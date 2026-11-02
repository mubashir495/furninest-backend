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
   * Admin creates a new draft by uploading 1-6 photos + cost price.
   * Uploads photos, saves draft with status queued, and adds job to BullMQ queue.
   */
  async createDraft(
    dto: CreateListingDraftDto,
    files: Express.Multer.File[],
  ): Promise<{ draftId: string; draft: ListingDraftDocument }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least 1 product photo is required (max 6).');
    }
    if (files.length > 6) {
      throw new BadRequestException('A maximum of 6 product photos can be uploaded.');
    }

    this.logger.log(`Uploading ${files.length} source images for new listing draft...`);
    const imageUrls = await this.uploadService.uploadImages(files, 'listing-drafts');

    const costPrice = Number(dto.costPrice);
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
   * BullMQ worker calls this method to process a draft through Phase (b) pipeline:
   * 1. status -> analyzing
   * 2. Vision analysis (Gemini Vision with Zod validation + 1 retry)
   * 3. Pricing calculation (pure code, NO LLM)
   * 4. Parallel execution of SEO generator and Variants generator
   * 5. Save everything and transition status -> pending_approval
   * On error: status -> failed + error message, rethrow for BullMQ retry
   */
  async processDraft(draftId: string): Promise<ListingDraftDocument> {
    const draft = await this.draftModel.findById(draftId);
    if (!draft) {
      this.logger.error(`Draft ${draftId} not found during processing.`);
      throw new NotFoundException(`Draft ${draftId} not found.`);
    }

    this.logger.log(`Draft ${draftId}: Starting AI listing pipeline...`);
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
      // Step 1: Gemini Vision Analysis
      this.logger.log(`Draft ${draftId}: [Step 1/3] Running Gemini Vision analysis...`);
      const visionResult = await this.visionService.analyze(draft.sourceImages);

      draft.analysis = {
        category: visionResult.category,
        material: visionResult.material,
        color: visionResult.color,
        style: visionResult.style,
        seating: visionResult.seating,
        features: visionResult.features,
        confidence: visionResult.confidence,
        raw: visionResult.raw,
      };
      if (visionResult.reviewRequired) {
        draft.reviewRequired = true;
      }
      await draft.save();

      // Step 2: Pricing engine (pure code, NO LLM)
      this.logger.log(`Draft ${draftId}: [Step 2/3] Calculating rule-based pricing...`);
      const pricingResult = this.pricingService.calculate(
        draft.costPrice,
        visionResult.category,
      );
      draft.pricing = pricingResult;

      // Step 3: Run SEO generator and Variants generator in parallel
      this.logger.log(`Draft ${draftId}: [Step 3/3] Generating SEO content and Variants in parallel...`);
      const [seoResult, variantsResult] = await Promise.all([
        this.seoService.generate(visionResult),
        this.variantsService.generate(
          visionResult,
          pricingResult,
          draft.sourceImages,
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
      // Rethrow so BullMQ can trigger automatic retries with backoff
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
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

    if (dto.costPrice !== undefined) {
      draft.costPrice = dto.costPrice;
      if (draft.pricing) {
        draft.pricing.costPrice = dto.costPrice;
      }
    }
    if (dto.status !== undefined) draft.status = dto.status;
    if (dto.analysis !== undefined) {
      draft.analysis = { ...draft.analysis, ...dto.analysis } as any;
    }
    if (dto.seo !== undefined) {
      draft.seo = { ...draft.seo, ...dto.seo } as any;
    }
    if (dto.pricing !== undefined) {
      draft.pricing = { ...draft.pricing, ...dto.pricing } as any;
    }
    if (dto.variants !== undefined) draft.variants = dto.variants;
    if (dto.generatedImages !== undefined) {
      draft.generatedImages = dto.generatedImages;
    }
    if (dto.reviewRequired !== undefined) {
      draft.reviewRequired = dto.reviewRequired;
    }
    if (dto.categoryId !== undefined) {
      draft.categoryId = dto.categoryId
        ? new Types.ObjectId(dto.categoryId)
        : null;
    }
    if (dto.subCategoryId !== undefined) {
      draft.subCategoryId = dto.subCategoryId
        ? new Types.ObjectId(dto.subCategoryId)
        : null;
    }

    await draft.save();
    return draft;
  }

  /**
   * Admin approves a draft. AI can NEVER auto-approve.
   */
  async approveDraft(id: string): Promise<ListingDraftDocument> {
    const draft = await this.getDraftById(id);
    draft.status = ListingDraftStatus.APPROVED;
    draft.error = null;
    await draft.save();
    this.logger.log(`Draft ${id} approved by admin.`);
    return draft;
  }

  /**
   * Publish creates the real Product.
   * SAFETY RULE: AI can NEVER publish.
   * Requires status === 'approved', otherwise returns 400 Bad Request.
   */
  async publishDraft(id: string): Promise<{
    success: boolean;
    message: string;
    productId: string;
    product: ProductDocument;
  }> {
    const draft = await this.getDraftById(id);

    if (draft.status !== ListingDraftStatus.APPROVED) {
      throw new BadRequestException(
        `Draft cannot be published because it is not approved. Current status: ${draft.status}. Please approve the draft first.`,
      );
    }

    // Resolve Category & SubCategory
    let categoryId = draft.categoryId;
    let subCategoryId = draft.subCategoryId;

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
      Math.round(draft.costPrice * 1.4) ||
      999;

    const shortDescription =
      draft.seo?.metaDescription || draft.seo?.title || 'Luxury furniture handcrafted with premium materials.';

    const longDescription =
      draft.seo?.description ||
      draft.seo?.metaDescription ||
      draft.seo?.title ||
      'Experience unmatched comfort and timeless design with this luxury furniture piece.';

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
      thumbnailImage: draft.sourceImages[0] || '',
      images: draft.sourceImages || [],
      variants,
      category: categoryId,
      subCategory: subCategoryId,
      material: draft.analysis?.material || '',
      features: draft.analysis?.features || [],
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
   * Placeholder for separate image generation step (Phase d).
   */
  async generateImages(id: string): Promise<{ message: string; draftId: string }> {
    const draft = await this.getDraftById(id);
    const images = await this.imageGenService.generateImages(
      draft._id.toString(),
      draft.sourceImages,
    );
    return {
      message: 'Image generation endpoint ready for phase (d).',
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
