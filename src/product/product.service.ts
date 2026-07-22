import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Product, ProductDocument } from './schema/product.schema';
import { Category, CategoryDocument } from '../category/schema/category.schema';
import {
  SubCategory,
  SubCategoryDocument,
} from '../subcategory/schema/subcategory.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { slugify } from '../common/utils/slugify';
import { UploadService } from '../upload/upload.service';

const PUBLIC_FIELDS =
  'name slug shortDescription longDescription price discount stock thumbnailImage images color size category subCategory isActive created_date updated_date';

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
    });
    await product.save();

    return {
      success: true,
      message: 'Product created successfully.',
      data: product,
    };
  }

  async findAll() {
    const products = await this.productModel
      .find()
      .select(PUBLIC_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findByCategory(categoryId: string) {
    const products = await this.productModel
      .find({ category: categoryId, isActive: true })
      .select(PUBLIC_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findBySubCategory(subCategoryId: string) {
    const products = await this.productModel
      .find({ subCategory: subCategoryId, isActive: true })
      .select(PUBLIC_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  private async getSuggestions(product: ProductDocument) {
    if (product.suggestionItems?.length) {
      return this.productModel
        .find({ _id: { $in: product.suggestionItems }, isActive: true })
        .select('name slug price discount thumbnailImage images color size stock')
        .limit(8);
    }

    return this.productModel
      .find({
        subCategory: product.subCategory,
        _id: { $ne: product._id },
        isActive: true,
      })
      .select('name slug price discount thumbnailImage images color size stock')
      .limit(8);
  }

  async findOne(id: string) {
    const product = await this.productModel
      .findById(id)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');

    if (!product) throw new NotFoundException('Product not found.');

    const suggestions = await this.getSuggestions(product);

    return { success: true, data: { ...product.toJSON(), suggestions } };
  }

  async findBySlug(slug: string) {
    const product = await this.productModel
      .findOne({ slug })
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
    product.shortDescription =
      dto.shortDescription ?? product.shortDescription;

    product.longDescription =
      dto.longDescription ?? product.longDescription;

    product.price =
      dto.price ?? product.price;

    product.discount =
      dto.discount ?? product.discount;

    product.stock =
      dto.stock ?? product.stock;

    // Available colors & sizes
    product.color =
      dto.color ?? product.color;

    product.size =
      dto.size ?? product.size;

    if (dto.suggestionItems) {
      product.suggestionItems = dto.suggestionItems.map(
        (itemId) => new Types.ObjectId(itemId),
      );
    }

    product.isActive =
      dto.isActive ?? product.isActive;

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

    // Delete product from MongoDB
    await product.deleteOne();

    return {
      success: true,
      message: 'Product deleted successfully.',
    };
  }

  async getCatalogTree() {
    const categories = await this.categoryModel.find().sort({ name: 1 }).lean();

    const tree = await Promise.all(
      categories.map(async (category) => {
        const subCategories = await this.subCategoryModel
          .find({ category: category._id })
          .sort({ name: 1 })
          .lean();

        const subCategoriesWithProducts = await Promise.all(
          subCategories.map(async (subCategory) => {
            const products = await this.productModel
              .find({ subCategory: subCategory._id, isActive: true })
              .select('name slug price discount thumbnailImage images color size stock')
              .sort({ name: 1 })
              .lean();

            return { ...subCategory, products };
          }),
        );

        return { ...category, subCategories: subCategoriesWithProducts };
      }),
    );

    return { success: true, data: tree };
  }
}