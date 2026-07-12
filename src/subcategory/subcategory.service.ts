import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubCategory, SubCategoryDocument } from './schema/subcategory.schema';
import { Category, CategoryDocument } from '../category/schema/category.schema';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { slugify } from '../common/utils/slugify';

@Injectable()
export class SubCategoryService {
  constructor(
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategoryDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;

    while (
      await this.subCategoryModel.findOne({
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.categoryModel.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  async create(dto: CreateSubCategoryDto) {
    await this.assertCategoryExists(dto.category);

    const existing = await this.subCategoryModel.findOne({
      name: dto.name.trim(),
      category: dto.category,
    });
    if (existing) {
      throw new ConflictException('This subcategory already exists under the selected category.');
    }

    const slug = await this.generateUniqueSlug(dto.name);

    const subCategory = await this.subCategoryModel.create({
      name: dto.name.trim(),
      slug,
      category: dto.category,
    });

    return {
      success: true,
      message: 'Subcategory created successfully.',
      data: subCategory,
    };
  }

  async findAll() {
    const subCategories = await this.subCategoryModel
      .find()
      .populate('category', 'name slug')
      .sort({ created_date: -1 });

    return { success: true, data: subCategories };
  }

  async findByCategory(categoryId: string) {
    await this.assertCategoryExists(categoryId);

    const subCategories = await this.subCategoryModel
      .find({ category: categoryId })
      .sort({ created_date: -1 });

    return { success: true, data: subCategories };
  }

  async findOne(id: string) {
    const subCategory = await this.subCategoryModel
      .findById(id)
      .populate('category', 'name slug');

    if (!subCategory) {
      throw new NotFoundException('Subcategory not found.');
    }
    return { success: true, data: subCategory };
  }

  async findBySlug(slug: string) {
    const subCategory = await this.subCategoryModel
      .findOne({ slug })
      .populate('category', 'name slug');

    if (!subCategory) {
      throw new NotFoundException('Subcategory not found.');
    }
    return { success: true, data: subCategory };
  }

  async update(id: string, dto: UpdateSubCategoryDto) {
    const subCategory = await this.subCategoryModel.findById(id);
    if (!subCategory) {
      throw new NotFoundException('Subcategory not found.');
    }

    if (dto.category) {
      await this.assertCategoryExists(dto.category);
      subCategory.category = dto.category as any;
    }

    if (dto.name && dto.name.trim() !== subCategory.name) {
      const existing = await this.subCategoryModel.findOne({
        name: dto.name.trim(),
        category: dto.category ?? subCategory.category,
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictException('This subcategory already exists under the selected category.');
      }

      subCategory.name = dto.name.trim();
      subCategory.slug = await this.generateUniqueSlug(dto.name, id);
    }

    await subCategory.save();

    return { success: true, message: 'Subcategory updated successfully.', data: subCategory };
  }

  async remove(id: string) {
    const subCategory = await this.subCategoryModel.findById(id);
    if (!subCategory) {
      throw new NotFoundException('Subcategory not found.');
    }

    await subCategory.deleteOne();

    return { success: true, message: 'Subcategory deleted successfully.' };
  }
}