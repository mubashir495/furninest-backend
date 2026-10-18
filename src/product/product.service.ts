import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import {
  Product,
  ProductDocument,
  ProductVariant,
} from './schema/product.schema';
import { Category, CategoryDocument } from '../category/schema/category.schema';
import {
  SubCategory,
  SubCategoryDocument,
} from '../subcategory/schema/subcategory.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { slugify } from '../common/utils/slugify';
import { UploadService } from '../upload/upload.service';

// Fields returned in public listing (excludes variants for performance on list views)
const PUBLIC_LIST_FIELDS =
  'name slug shortDescription price discount stock thumbnailImage images color size category subCategory suggestionItems isActive created_date updated_date';

// Full fields including variants (for detail pages and admin)
const FULL_FIELDS =
  'name slug shortDescription longDescription price discount stock thumbnailImage images color size variants category subCategory suggestionItems isActive created_date updated_date';

export interface ProductFiles {
  thumbnail?: Express.Multer.File[];
  images?: Express.Multer.File[];
}

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,

    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,

    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategoryDocument>,

    private readonly uploadService: UploadService,
  ) {}

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;

    while (
      await this.productModel.findOne({
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  private async resolveSubCategory(subCategoryId: string) {
    const subCategory = await this.subCategoryModel.findById(subCategoryId);
    if (!subCategory) throw new NotFoundException('Subcategory not found.');
    return subCategory;
  }

  private findVariantById(product: ProductDocument, variantId: string): ProductVariant {
    const variant = (product.variants as ProductVariant[]).find(
      (v) => (v as any)._id?.toString() === variantId,
    );
    if (!variant) {
      throw new NotFoundException('Variant not found on this product.');
    }
    return variant;
  }

  private async getSuggestions(product: ProductDocument) {
    if (product.suggestionItems?.length) {
      return this.productModel
        .find({ _id: { $in: product.suggestionItems }, isActive: true })
        .select('name slug price discount thumbnailImage images color size stock variants')
        .limit(8);
    }

    return this.productModel
      .find({
        subCategory: product.subCategory,
        _id: { $ne: product._id },
        isActive: true,
      })
      .select('name slug price discount thumbnailImage images color size stock variants')
      .limit(8);
  }

  // ─── Product CRUD ──────────────────────────────────────────────────────────

  async create(dto: CreateProductDto, files: ProductFiles) {
    const subCategory = await this.resolveSubCategory(dto.subCategory);

    const slug = await this.generateUniqueSlug(dto.name);

    let imageUrls: string[] = [];
    let thumbnailUrl = '';

    // Upload gallery images
    if (files?.images?.length) {
      imageUrls = await this.uploadService.uploadImages(
        files.images,
        'products',
      );
    }

    // Upload thumbnail image
    if (files?.thumbnail?.length) {
      const uploadedThumbnail = await this.uploadService.uploadImages(
        files.thumbnail,
        'products',
      );
      thumbnailUrl = uploadedThumbnail[0] || '';
    }

    const product = new this.productModel({
      ...dto,
      slug,
      category: subCategory.category,
      thumbnailImage: thumbnailUrl || dto.thumbnailImage || '',
      images: imageUrls,
      color: dto.color ?? [],
      size: dto.size ?? [],
      variants: [],
    });
    await product.save();

    return {
      success: true,
      message: 'Product created successfully.',
      data: product,
    };
  }

  /**
   * Public listing — always returns only active products.
   * Admin listing (isAdmin=true) returns all regardless of status.
   */
  async findAll(isAdmin = false) {
    const filter = isAdmin ? {} : { isActive: true };

    const products = await this.productModel
      .find(filter)
      .select(isAdmin ? FULL_FIELDS : PUBLIC_LIST_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findByCategory(categoryId: string) {
    const products = await this.productModel
      .find({ category: categoryId, isActive: true })
      .select(PUBLIC_LIST_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findBySubCategory(subCategoryId: string) {
    const products = await this.productModel
      .find({ subCategory: subCategoryId, isActive: true })
      .select(PUBLIC_LIST_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findOne(id: string) {
    const product = await this.productModel
      .findById(id)
      .select(FULL_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');

    if (!product) throw new NotFoundException('Product not found.');

    const suggestions = await this.getSuggestions(product);

    return { success: true, data: { ...product.toJSON(), suggestions } };
  }

  async findBySlug(slug: string) {
    const product = await this.productModel
      .findOne({ slug })
      .select(FULL_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');

    if (!product) throw new NotFoundException('Product not found.');

    const suggestions = await this.getSuggestions(product);

    return { success: true, data: { ...product.toJSON(), suggestions } };
  }

  async update(id: string, dto: UpdateProductDto, files?: ProductFiles) {
    const product = await this.productModel.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    // Update subcategory & category
    if (dto.subCategory) {
      const subCategory = await this.resolveSubCategory(dto.subCategory);

      product.subCategory = subCategory._id as any;
      product.category = subCategory.category;
    }

    // Update slug if name changed
    if (dto.name && dto.name.trim() !== product.name) {
      product.name = dto.name.trim();
      product.slug = await this.generateUniqueSlug(dto.name, id);
    }

    // Upload new gallery images if provided (replaces old ones)
    if (files?.images?.length) {
      if (product.images?.length) {
        for (const image of product.images) {
          try {
            await this.uploadService.deleteImage(image);
          } catch (error) {
            console.error('Failed to delete image:', image, error);
          }
        }
      }

      product.images = await this.uploadService.uploadImages(
        files.images,
        'products',
      );
    }

    // Upload new thumbnail if provided (replaces old one)
    if (files?.thumbnail?.length) {
      if (product.thumbnailImage) {
        try {
          await this.uploadService.deleteImage(product.thumbnailImage);
        } catch (error) {
          console.error('Failed to delete thumbnail:', product.thumbnailImage, error);
        }
      }

      const uploadedThumbnail = await this.uploadService.uploadImages(
        files.thumbnail,
        'products',
      );
      product.thumbnailImage = uploadedThumbnail[0] || product.thumbnailImage;
    } else if (dto.thumbnailImage) {
      product.thumbnailImage = dto.thumbnailImage;
    }

    // Update remaining fields
    product.shortDescription = dto.shortDescription ?? product.shortDescription;
    product.longDescription   = dto.longDescription   ?? product.longDescription;
    product.price             = dto.price             ?? product.price;
    product.discount          = dto.discount          ?? product.discount;
    product.stock             = dto.stock             ?? product.stock;
    product.color             = dto.color             ?? product.color;
    product.size              = dto.size              ?? product.size;

    if (dto.suggestionItems) {
      product.suggestionItems = dto.suggestionItems.map(
        (itemId) => new (mongoose as any).Types.ObjectId(itemId),
      );
    }

    product.isActive = dto.isActive ?? product.isActive;

    await product.save();

    return {
      success: true,
      message: 'Product updated successfully.',
      data: product,
    };
  }

  async remove(id: string) {
    const product = await this.productModel.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    // Delete thumbnail from Supabase
    if (product.thumbnailImage) {
      try {
        await this.uploadService.deleteImage(product.thumbnailImage);
      } catch (error) {
        console.error('Failed to delete thumbnail:', product.thumbnailImage, error);
      }
    }

    // Delete gallery images from Supabase
    if (product.images && product.images.length > 0) {
      for (const image of product.images) {
        try {
          await this.uploadService.deleteImage(image);
        } catch (error) {
          console.error('Failed to delete image:', image, error);
        }
      }
    }

    // Delete variant images from Supabase
    if (product.variants?.length) {
      for (const variant of product.variants as ProductVariant[]) {
        for (const image of variant.images ?? []) {
          try {
            await this.uploadService.deleteImage(image);
          } catch (error) {
            console.error('Failed to delete variant image:', image, error);
          }
        }
      }
    }

    // Delete product from MongoDB
    await product.deleteOne();

    return {
      success: true,
      message: 'Product deleted successfully.',
    };
  }

  // ─── Variant CRUD ──────────────────────────────────────────────────────────

  /**
   * Add a new variant to a product.
   * Optionally uploads images for the variant immediately.
   */
  async addVariant(
    productId: string,
    dto: CreateVariantDto,
    files?: { images?: Express.Multer.File[] },
  ) {
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found.');

    let imageUrls: string[] = [];
    if (files?.images?.length) {
      imageUrls = await this.uploadService.uploadImages(
        files.images,
        'products/variants',
      );
    }

    const newVariant: Partial<ProductVariant> = {
      configName: dto.configName,
      colorName: dto.colorName ?? '',
      colorHex: dto.colorHex ?? '',
      sku: dto.sku ?? '',
      price: dto.price,
      salePrice: dto.salePrice ?? null,
      stock: dto.stock ?? 0,
      images: imageUrls,
      isActive: dto.isActive ?? true,
      dimensions: dto.dimensions ?? '',
      material: dto.material ?? '',
      weight: dto.weight ?? null,
      attributes: {},
    };

    (product.variants as any[]).push(newVariant);
    await product.save();

    return {
      success: true,
      message: 'Variant added successfully.',
      data: product,
    };
  }

  /**
   * Update fields on an existing variant.
   * Images are managed separately via addVariantImages.
   */
  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found.');

    const variant = this.findVariantById(product, variantId) as any;

    if (dto.configName !== undefined)  variant.configName  = dto.configName;
    if (dto.colorName  !== undefined)  variant.colorName   = dto.colorName;
    if (dto.colorHex   !== undefined)  variant.colorHex    = dto.colorHex;
    if (dto.sku        !== undefined)  variant.sku         = dto.sku;
    if (dto.price      !== undefined)  variant.price       = dto.price;
    if (dto.salePrice  !== undefined)  variant.salePrice   = dto.salePrice;
    if (dto.stock      !== undefined)  variant.stock       = dto.stock;
    if (dto.isActive   !== undefined)  variant.isActive    = dto.isActive;
    if (dto.dimensions !== undefined)  variant.dimensions  = dto.dimensions;
    if (dto.material   !== undefined)  variant.material    = dto.material;
    if (dto.weight     !== undefined)  variant.weight      = dto.weight;

    await product.save();

    return {
      success: true,
      message: 'Variant updated successfully.',
      data: product,
    };
  }

  /**
   * Upload and append images to a specific variant.
   * Existing variant images are preserved; new ones are appended.
   */
  async addVariantImages(
    productId: string,
    variantId: string,
    files: { images?: Express.Multer.File[] },
  ) {
    if (!files?.images?.length) {
      throw new BadRequestException('No images provided.');
    }

    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found.');

    const variant = this.findVariantById(product, variantId) as any;

    const newUrls = await this.uploadService.uploadImages(
      files.images,
      'products/variants',
    );

    variant.images = [...(variant.images ?? []), ...newUrls];
    await product.save();

    return {
      success: true,
      message: 'Variant images uploaded successfully.',
      data: product,
    };
  }

  /**
   * Remove a variant from a product.
   * Also deletes variant images from Supabase.
   */
  async deleteVariant(productId: string, variantId: string) {
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Product not found.');

    const variant = this.findVariantById(product, variantId) as any;

    // Delete variant images from storage
    for (const image of variant.images ?? []) {
      try {
        await this.uploadService.deleteImage(image);
      } catch (err) {
        console.error('Failed to delete variant image:', image, err);
      }
    }

    // Remove the variant from the array
    (product.variants as any[]) = (product.variants as any[]).filter(
      (v) => v._id?.toString() !== variantId,
    );

    await product.save();

    return {
      success: true,
      message: 'Variant deleted successfully.',
    };
  }

  // ─── Catalog Tree ──────────────────────────────────────────────────────────

  async getCatalogTree() {
    const categories = await this.categoryModel
      .find()
      .sort({ name: 1 })
      .lean();

    const subCategories = await this.subCategoryModel
      .find()
      .sort({ name: 1 })
      .lean();

    const tree = categories.map((category) => ({
      ...category,
      subCategories: subCategories.filter(
        (sub) => sub.category.toString() === category._id.toString(),
      ),
    }));

    return {
      success: true,
      data: tree,
    };
  }
}