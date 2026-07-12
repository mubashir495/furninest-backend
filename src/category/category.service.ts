import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schema/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from '../common/utils/slugify';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;
    while (
      await this.categoryModel.findOne({
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.categoryModel.findOne({ name: dto.name.trim() });
    if (existing) {
      throw new ConflictException('A category with this name already exists.');
    }

    const slug = await this.generateUniqueSlug(dto.name);

    const category = await this.categoryModel.create({
      name: dto.name.trim(),
      slug,
    });

    return { success: true, message: 'Category created successfully.', data: category };
  }

  async findAll() {
    const categories = await this.categoryModel.find().sort({ created_date: -1 });
    return { success: true, data: categories };
  }

  async findOne(id: string) {
    const category = await this.categoryModel.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return { success: true, data: category };
  }

  async findBySlug(slug: string) {
    const category = await this.categoryModel.findOne({ slug });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return { success: true, data: category };
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryModel.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    if (dto.name && dto.name.trim() !== category.name) {
      const existing = await this.categoryModel.findOne({
        name: dto.name.trim(),
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictException('A category with this name already exists.');
      }

      category.name = dto.name.trim();
      category.slug = await this.generateUniqueSlug(dto.name, id);
    }

    await category.save();

    return { success: true, message: 'Category updated successfully.', data: category };
  }

  async remove(id: string) {
    const category = await this.categoryModel.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    await category.deleteOne();

    return { success: true, message: 'Category deleted successfully.' };
  }
}