import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

import { multerOptions } from '../common/multer/multer.config';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ─────────────────────────────────────────────────────────
  //  Public Routes
  // ─────────────────────────────────────────────────────────

  /** Public catalogue — always returns only active products. */
  @Get()
  findAll() {
    return this.productService.findAll(false);
  }

  /**
   * Admin catalogue — returns all products regardless of status.
   * Protected: only ADMIN role can call this route.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin')
  findAllAdmin() {
    return this.productService.findAll(true);
  }

  @Get('catalog-tree')
  getCatalogTree() {
    return this.productService.getCatalogTree();
  }

  @Get('category/:categoryId')
  findByCategory(@Param('categoryId') categoryId: string) {
    return this.productService.findByCategory(categoryId);
  }

  @Get('subcategory/:subCategoryId')
  findBySubCategory(@Param('subCategoryId') subCategoryId: string) {
    return this.productService.findBySubCategory(subCategoryId);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  // ─────────────────────────────────────────────────────────
  //  Admin Routes — Products
  // ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'thumbnail', maxCount: 1 },
        { name: 'images', maxCount: 10 },
      ],
      multerOptions,
    ),
  )
  create(
    @Body() dto: CreateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    return this.productService.create(dto, files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'thumbnail', maxCount: 1 },
        { name: 'images', maxCount: 10 },
      ],
      multerOptions,
    ),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    return this.productService.update(id, dto, files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productService.remove(id);
  }

  // ─────────────────────────────────────────────────────────
  //  Admin Routes — Variants
  // ─────────────────────────────────────────────────────────

  /** Add a new variant to a product (with optional image upload). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/variants')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 10 }], multerOptions),
  )
  addVariant(
    @Param('id') productId: string,
    @Body() dto: CreateVariantDto,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
  ) {
    return this.productService.addVariant(productId, dto, files);
  }

  /** Update an existing variant (fields only — use the images route to add images). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productService.updateVariant(productId, variantId, dto);
  }

  /** Upload / replace images for a specific variant. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/variants/:variantId/images')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 10 }], multerOptions),
  )
  addVariantImages(
    @Param('id') productId: string,
    @Param('variantId') variantId: string,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
  ) {
    return this.productService.addVariantImages(productId, variantId, files);
  }

  /** Remove a variant from a product. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id/variants/:variantId')
  deleteVariant(
    @Param('id') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productService.deleteVariant(productId, variantId);
  }
}