import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './schema/product.schema';
import { Category, CategoryDocument } from '../category/schema/category.schema';
import {
  SubCategory,
  SubCategoryDocument,
} from '../subcategory/schema/subcategory.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { slugify } from '../common/utils/slugify';

const PUBLIC_FIELDS =
  'name slug shortDescription longDescription price discount stock images category subCategory isActive created_date updated_date';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategoryDocument>,
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

  async create(dto: CreateProductDto) {
    const subCategory = await this.resolveSubCategory(dto.subCategory);
    const slug = await this.generateUniqueSlug(dto.name);

    const product = await this.productModel.create({
      ...dto,
      slug,
      category: subCategory.category, // derived, not passed in by the client
    });

    return { success: true, message: 'Product created successfully.', data: product };
  }

  async findAll() {
    const products = await this.productModel
      .find()
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findByCategory(categoryId: string) {
    const products = await this.productModel
      .find({ category: categoryId, isActive: true })
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  async findBySubCategory(subCategoryId: string) {
    const products = await this.productModel
      .find({ subCategory: subCategoryId, isActive: true })
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: products };
  }

  private async getSuggestions(product: ProductDocument) {
    if (product.suggestionItems?.length) {
      return this.productModel
        .find({ _id: { $in: product.suggestionItems }, isActive: true })
        .select('name slug price discount images stock')
        .limit(8);
    }

    return this.productModel
      .find({
        subCategory: product.subCategory,
        _id: { $ne: product._id },
        isActive: true,
      })
      .select('name slug price discount images stock')
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

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException('Product not found.');

    if (dto.subCategory) {
      const subCategory = await this.resolveSubCategory(dto.subCategory);
      product.subCategory = subCategory._id as any;
      product.category = subCategory.category; // keep denormalized category in sync
    }

    if (dto.name && dto.name.trim() !== product.name) {
      product.slug = await this.generateUniqueSlug(dto.name, id);
      product.name = dto.name.trim();
    }

    Object.assign(product, {
      shortDescription: dto.shortDescription ?? product.shortDescription,
      longDescription: dto.longDescription ?? product.longDescription,
      price: dto.price ?? product.price,
      discount: dto.discount ?? product.discount,
      stock: dto.stock ?? product.stock,
      images: dto.images ?? product.images,
      suggestionItems: dto.suggestionItems ?? product.suggestionItems,
      isActive: dto.isActive ?? product.isActive,
    });

    await product.save();

    return { success: true, message: 'Product updated successfully.', data: product };
  }

  async remove(id: string) {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException('Product not found.');

    await product.deleteOne();

    return { success: true, message: 'Product deleted successfully.' };
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
              .select('name slug price discount images stock')
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