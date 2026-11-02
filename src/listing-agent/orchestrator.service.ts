import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  ListingDraft,
  ListingDraftDocument,
  ListingDraftStatus,
} from './schemas/listing-draft.schema';
import { CreateListingDraftDto } from './dto/create-listing-draft.dto';
import { UpdateListingDraftDto } from './dto/update-listing-draft.dto';
import { QueryListingDraftDto } from './dto/query-listing-draft.dto';
import { UploadService } from '../upload/upload.service';
import { Product, ProductDocument } from '../product/schema/product.schema';
import { Category, CategoryDocument } from '../category/schema/category.schema';
import {
  SubCategory,
  SubCategoryDocument,
} from '../subcategory/schema/subcategory.schema';
import { RevalidationService } from '../revalidation/revalidation.service';

import { VisionService } from './steps/vision.service';
import { SeoService } from './steps/seo.service';
import { VariantsService } from './steps/variants.service';
import { PricingService } from './steps/pricing.service';
import { ImageGenService } from './steps/image-gen.service';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @InjectModel(ListingDraft.name)
    private readonly draftModel: Model<ListingDraftDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategoryDocument>,
    @InjectQueue('listing-agent')
    private readonly listingQueue: Queue,
    private readonly uploadService: UploadService,
    private readonly revalidationService: RevalidationService,
    private readonly visionService: VisionService,
    private readonly seoService: SeoService,
    private readonly variantsService: VariantsService,
    private readonly pricingService: PricingService,
    private readonly imageGenService: ImageGenService,
  ) {}

  /**
   * Admin creates a new draft by uploading 0-6 photos and/or raw details + optional cost price in GBP (£).
   * Uploads photos (if any), saves draft with status queued, and adds job to BullMQ queue.
   */
  async createDraft(
    dto: CreateListingDraftDto,
    files?: Express.Multer.File[],
  ): Promise<{ draftId: string; draft: ListingDraftDocument }> {
    const hasFiles = Array.isArray(files) && files.length > 0;
    const hasRawDetails = Boolean(dto.rawDetails?.trim());

    if (!hasFiles && !hasRawDetails) {
      throw new BadRequestException(
        'At least 1 product photo or raw description text must be provided.',
      );
    }

    if (hasFiles && files!.length > 6) {
      throw new BadRequestException('A maximum of 6 product photos can be uploaded.');
    }

    let imageUrls: string[] = [];
    if (hasFiles) {
      this.logger.log(`Uploading ${files!.length} source images for new listing draft...`);
      imageUrls = await this.uploadService.uploadImages(files!, 'listing-drafts');
    }

    const costPrice = Number(dto.costPrice || 0);
    const initialPricing = this.pricingService.calculate(costPrice);

    const draft = new this.draftModel({
      sourceImages: imageUrls,
      costPrice,
      status: ListingDraftStatus.QUEUED,
      pricing: initialPricing,
      categoryId: dto.categoryId ? new Types.ObjectId(dto.categoryId) : null,
      subCategoryId: dto.subCategoryId
        ? new Types.ObjectId(dto.subCategoryId)
        : null,
      language: dto.language || 'en',
      rawDetails: dto.rawDetails || null,
      fireSafetyLabelConfirmed: Boolean(dto.fireSafetyLabelConfirmed),
      stockLocation: dto.stockLocation?.trim() || 'UK warehouse',
      reviewRequired: false,
    });

    await draft.save();

    // Enqueue BullMQ job with 3 attempts and exponential backoff
    await this.listingQueue.add(
      'process-draft',
      { draftId: draft._id.toString() },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log(`Enqueued listing-agent job for draftId: ${draft._id}`);
    return { draftId: draft._id.toString(), draft };
  }

  /**
   * BullMQ worker calls this method to process a draft through Claude AI pipeline:
   * 1. status -> analyzing
   * 2. Claude Vision & attribute analysis (benchmarked to UK retail standards)
   * 3. UK Pricing calculation (Cost + Margin + 20% VAT, rounded to UK price point e.g. £649)
   * 4. Parallel execution of British English SEO generator and UK Variants generator
   * 5. Save everything and transition status -> pending_approval
   */
  async processDraft(draftId: string): Promise<ListingDraftDocument> {
    const draft = await this.draftModel.findById(draftId);
    if (!draft) {
      this.logger.error(`Draft ${draftId} not found during processing.`);
      throw new NotFoundException(`Draft ${draftId} not found.`);
    }

    this.logger.log(`Draft ${draftId}: Starting Claude AI listing pipeline for UK market...`);
    draft.status = ListingDraftStatus.ANALYZING;
    draft.error = null;
    await draft.save();

    const timeoutMs = 90000;
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `AI listing pipeline timed out after ${timeoutMs / 1000} seconds.`,
          ),
        );
      }, timeoutMs);
    });

    const pipelinePromise = (async () => {
      const rawDetails = draft.rawDetails || undefined;

      // Step 1: Claude Vision & Text Attribute Extraction (British English)
      this.logger.log(`Draft ${draftId}: [Step 1/3] Running Claude Vision & Attribute analysis...`);
      const visionResult = await this.visionService.analyze(
        draft.sourceImages || [],
        rawDetails,
      );

      draft.analysis = {
        category: visionResult.category,
        material: visionResult.material,
        color: visionResult.color,
        style: visionResult.style,
        seating: visionResult.seating,
        features: visionResult.features,
        specifications: visionResult.specifications || [],
        confidence: visionResult.confidence,
        raw: visionResult.raw,
      };
      if (visionResult.reviewRequired) {
        draft.reviewRequired = true;
      }
      await draft.save();

      // Step 2: UK Pricing engine (Cost + Margin + 20% VAT)
      this.logger.log(`Draft ${draftId}: [Step 2/3] Calculating UK retail pricing...`);
      let effectiveCost = draft.costPrice;
      if (!effectiveCost && visionResult.suggestedPriceRange?.min) {
        // Derive approximate wholesale cost from typical UK retail min price
        effectiveCost = Math.round(visionResult.suggestedPriceRange.min / 1.7);
        draft.costPrice = effectiveCost;
      }

      const pricingResult = this.pricingService.calculate(
        effectiveCost,
        visionResult.category,
      );

      draft.pricing = {
        ...pricingResult,
        suggestedPriceRange: visionResult.suggestedPriceRange || null,
      };

      // Step 3: Run British English SEO generator and UK Variants generator in parallel
      this.logger.log(
        `Draft ${draftId}: [Step 3/3] Generating British English SEO content and UK Variants in parallel...`,
      );
      const [seoResult, variantsResult] = await Promise.all([
        this.seoService.generate(visionResult, rawDetails),
        this.variantsService.generate(
          visionResult,
          pricingResult,
          draft.sourceImages || [],
        ),
      ]);

      draft.seo = seoResult;
      draft.variants = variantsResult;

      // Pipeline complete: save and move to pending_approval
      draft.status = ListingDraftStatus.PENDING_APPROVAL;
      await draft.save();

      this.logger.log(
        `Draft ${draftId}: Pipeline successfully finished. Status is now pending_approval.`,
      );
      return draft;
    })();

    try {
      return await Promise.race([pipelinePromise, timeoutPromise]);
    } catch (err: any) {
      this.logger.error(
        `Draft ${draftId}: Processing failed - ${err?.message || err}`,
        err?.stack,
      );
      draft.status = ListingDraftStatus.FAILED;
      draft.error = err?.message || 'Unexpected processing error occurred.';
      await draft.save();
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Synchronous / Direct AI listing generation.
   * Runs the full Claude pipeline and returns the draft object without waiting on a queue.
   */
  async generateDirect(
    dto: CreateListingDraftDto,
    files?: Express.Multer.File[],
  ): Promise<ListingDraftDocument> {
    const created = await this.createDraft(dto, files);
    return this.processDraft(created.draftId);
  }

  /**
   * Retrieve paginated drafts with optional status filtering.
   */
  async getDrafts(query: QueryListingDraftDto) {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 20);
    const skip = (page - 1) * limit;

    const [drafts, total] = await Promise.all([
      this.draftModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.draftModel.countDocuments(filter).exec(),
    ]);

    return {
      drafts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieve a single draft by ID.
   */
  async getDraftById(id: string): Promise<ListingDraftDocument> {
    const draft = await this.draftModel.findById(id).exec();
    if (!draft) {
      throw new NotFoundException(`Listing draft ${id} not found.`);
    }
    return draft;
  }

  /**
   * Admin edits any field in a draft.
   */
  async updateDraft(
    id: string,
    dto: UpdateListingDraftDto,
  ): Promise<ListingDraftDocument> {
    const draft = await this.getDraftById(id);

    if (dto.costPrice !== undefined) draft.costPrice = Number(dto.costPrice);
    if (dto.status !== undefined) draft.status = dto.status;
    if (dto.reviewRequired !== undefined) draft.reviewRequired = dto.reviewRequired;
    if (dto.fireSafetyLabelConfirmed !== undefined) {
      draft.fireSafetyLabelConfirmed = dto.fireSafetyLabelConfirmed;
    }
    if (dto.stockLocation !== undefined) {
      draft.stockLocation = dto.stockLocation;
    }
    if (dto.categoryId !== undefined) {
      draft.categoryId = dto.categoryId ? new Types.ObjectId(dto.categoryId) : null;
    }
    if (dto.subCategoryId !== undefined) {
      draft.subCategoryId = dto.subCategoryId ? new Types.ObjectId(dto.subCategoryId) : null;
    }

    if (dto.analysis) {
      draft.analysis = {
        ...draft.analysis,
        ...dto.analysis,
      };
    }

    if (dto.seo) {
      draft.seo = {
        ...draft.seo,
        ...dto.seo,
      };
    }

    if (dto.pricing) {
      draft.pricing = {
        ...draft.pricing,
        ...dto.pricing,
      };
    }

    if (dto.variants) {
      draft.variants = dto.variants as any;
    }

    if (dto.generatedImages) {
      draft.generatedImages = dto.generatedImages as any;
    }

    await draft.save();
    this.logger.log(`Draft ${id} updated by admin.`);
    return draft;
  }

  /**
   * Admin approves a draft. Transitions status from pending_approval to approved.
   */
  async approveDraft(id: string): Promise<ListingDraftDocument> {
    const draft = await this.getDraftById(id);

    if (draft.status !== ListingDraftStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve draft with status '${draft.status}'. Only drafts in 'pending_approval' can be approved.`,
      );
    }

    draft.status = ListingDraftStatus.APPROVED;
    draft.reviewRequired = false;
    await draft.save();

    this.logger.log(`Draft ${id} approved by admin.`);
    return draft;
  }

  /**
   * Publishes an approved draft by converting it into a real Product in the catalogue.
   * Enforces UK compliance on fire safety labelling for upholstered items.
   * Triggers ISR revalidation.
   */
  async publishDraft(
    id: string,
  ): Promise<{ success: boolean; message: string; productId: string; product: ProductDocument }> {
    const draft = await this.getDraftById(id);

    if (draft.status !== ListingDraftStatus.APPROVED) {
      throw new BadRequestException(
        `Draft must be in 'approved' status to be published. Current status: '${draft.status}'`,
      );
    }

    // UK Compliance Safety Rail: Check fire safety label confirmation on upholstered furniture
    const isUpholstered =
      /sofa|chair|couch|armchair|upholster|fabric|cushion|stool|headboard|bed/i.test(
        `${draft.analysis?.category || ''} ${draft.analysis?.material || ''}`,
      );

    if (isUpholstered && !draft.fireSafetyLabelConfirmed) {
      throw new BadRequestException(
        'UK Compliance Notice: For upholstered furniture items, the physical fire safety label must be verified and confirmed by the administrator before publishing.',
      );
    }

    let subCategoryId = draft.subCategoryId;
    let categoryId = draft.categoryId;

    if (!subCategoryId) {
      const firstSub = await this.subCategoryModel.findOne().exec();
      if (!firstSub) {
        throw new BadRequestException(
          'No subcategories exist in the database. Please create a subcategory before publishing.',
        );
      }
      subCategoryId = firstSub._id as any;
      categoryId = firstSub.category as any;
    }

    if (!categoryId) {
      const sub = await this.subCategoryModel.findById(subCategoryId).exec();
      if (sub && sub.category) {
        categoryId = sub.category as any;
      } else {
        const firstCat = await this.categoryModel.findOne().exec();
        if (!firstCat) {
          throw new BadRequestException(
            'No categories exist in the database. Please create a category before publishing.',
          );
        }
        categoryId = firstCat._id as any;
      }
    }

    const title =
      draft.seo?.title?.trim() ||
      `Luxury Furniture Item ${Date.now().toString().slice(-4)}`;

    const slug = await this.generateUniqueSlug(draft.seo?.slug || title);

    const price =
      draft.pricing?.calculatedPrice ||
      Math.round((draft.costPrice || 200) * 1.6) ||
      299;

    const shortDescription =
      draft.seo?.metaDescription ||
      draft.seo?.title ||
      'Quality British home furniture crafted with premium materials.';

    const longDescription =
      draft.seo?.description ||
      draft.seo?.metaDescription ||
      draft.seo?.title ||
      'Experience unmatched comfort and timeless design with this British luxury furniture piece.';

    // Map draft variants to real ProductVariants if any exist
    const variants = (draft.variants || []).map((v, idx) => ({
      configName: v.configName || `Option ${idx + 1}`,
      colorName: v.colorName || '',
      colorHex: v.colorHex || '',
      sku: v.sku || `${slug}-${idx + 1}`,
      price: v.price || price,
      salePrice: v.compareAtPrice || null,
      images: v.images?.length ? v.images : draft.sourceImages,
      stock: v.stock !== undefined ? v.stock : 0,
      dimensions: v.dimensions || '',
      material: v.material || draft.analysis?.material || '',
      attributes: {},
      isActive: v.isActive !== undefined ? v.isActive : false,
    }));

    const product = new this.productModel({
      name: title,
      slug,
      shortDescription,
      longDescription,
      price,
      discount: 0,
      stock: variants.reduce((sum, v) => sum + (v.stock || 0), 0),
      thumbnailImage: draft.sourceImages?.[0] || '',
      images: draft.sourceImages || [],
      variants,
      category: categoryId,
      subCategory: subCategoryId,
      material: draft.analysis?.material || '',
      features: draft.analysis?.features || [],
      specifications: draft.analysis?.specifications || [],
      seoTitle: draft.seo?.title || title,
      seoDescription: draft.seo?.metaDescription || shortDescription,
      isActive: true,
    });

    await product.save();

    // Mark draft as published
    draft.status = ListingDraftStatus.PUBLISHED;
    draft.publishedProductId = product._id as any;
    await draft.save();

    // Trigger on-demand ISR revalidation on frontend
    this.revalidationService.revalidateProduct({
      action: 'create',
      id: product._id.toString(),
      slug: product.slug,
    });

    this.logger.log(`Draft ${id} successfully published as Product ${product._id}`);
    return {
      success: true,
      message: 'Product published successfully.',
      productId: product._id.toString(),
      product,
    };
  }

  /**
   * Reset failed draft and retry execution in BullMQ queue.
   */
  async retryDraft(id: string): Promise<ListingDraftDocument> {
    const draft = await this.getDraftById(id);
    draft.status = ListingDraftStatus.QUEUED;
    draft.error = null;
    await draft.save();

    await this.listingQueue.add(
      'process-draft',
      { draftId: draft._id.toString() },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    this.logger.log(`Retried draft ${id} and enqueued new job.`);
    return draft;
  }

  /**
   * Image generation placeholder (Phase d).
   */
  async generateImages(id: string): Promise<{ message: string; draftId: string }> {
    const draft = await this.getDraftById(id);
    await this.imageGenService.generateImages(
      draft._id.toString(),
      draft.sourceImages,
    );
    return {
      message: 'Image generation completed.',
      draftId: draft._id.toString(),
    };
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    if (!slug) slug = 'product';

    let unique = slug;
    let counter = 1;
    while (await this.productModel.exists({ slug: unique })) {
      unique = `${slug}-${counter}`;
      counter++;
    }
    return unique;
  }
}
