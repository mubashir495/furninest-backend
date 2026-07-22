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
import { UploadService } from '../upload/upload.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,

    private readonly uploadService: UploadService,
  ) {}

  private async generateUniqueSlug(
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;

    while (
      await this.categoryModel.findOne({
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  async create(
    dto: CreateCategoryDto,
    image?: Express.Multer.File,
  ) {
    const existing = await this.categoryModel.findOne({
      name: dto.name.trim(),
    });

    if (existing) {
      throw new ConflictException(
        'A category with this name already exists.',
      );
    }

    const slug = await this.generateUniqueSlug(dto.name);

    let imageUrl = '';

    if (image) {
      const uploaded = await this.uploadService.uploadImages(
        [image],
        'categories',
      );

      imageUrl = uploaded[0] || '';
    }

    const category = await this.categoryModel.create({
      name: dto.name.trim(),
      slug,
      image: imageUrl,
      description: dto.description?.trim() || '',
    });

    return {
      success: true,
      message: 'Category created successfully.',
      data: category,
    };
  }

  async findAll() {
    const categories = await this.categoryModel
      .find()
      .sort({ created_date: -1 });

    return {
      success: true,
      data: categories,
    };
  }

  async findOne(id: string) {
    const category = await this.categoryModel.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    return {
      success: true,
      data: category,
    };
  }

  async findBySlug(slug: string) {
    const category = await this.categoryModel.findOne({ slug });

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    return {
      success: true,
      data: category,
    };
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    image?: Express.Multer.File,
  ) {
    const category = await this.categoryModel.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    // Update Name & Slug
    if (dto.name && dto.name.trim() !== category.name) {
      const existing = await this.categoryModel.findOne({
        name: dto.name.trim(),
        _id: { $ne: id },
      });

      if (existing) {
        throw new ConflictException(
          'A category with this name already exists.',
        );
      }

      category.name = dto.name.trim();
      category.slug = await this.generateUniqueSlug(dto.name, id);
    }

    // Update Description
    if (dto.description !== undefined) {
      category.description = dto.description.trim();
    }

    // Update Image
    if (image) {
      // Delete old image
      if (category.image) {
        try {
          await this.uploadService.deleteImage(category.image);
        } catch (error) {
          console.error(
            'Failed to delete category image:',
            category.image,
            error,
          );
        }
      }

      // Upload new image
      const uploaded = await this.uploadService.uploadImages(
        [image],
        'categories',
      );

      category.image = uploaded[0] || '';
    }

    await category.save();

    return {
      success: true,
      message: 'Category updated successfully.',
      data: category,
    };
  }

  async remove(id: string) {
    const category = await this.categoryModel.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    // Delete image from storage
    if (category.image) {
      try {
        await this.uploadService.deleteImage(category.image);
      } catch (error) {
        console.error(
          'Failed to delete category image:',
          category.image,
          error,
        );
      }
    }

    await category.deleteOne();

    return {
      success: true,
      message: 'Category deleted successfully.',
    };
  }
}