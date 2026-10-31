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
  ValidationPipe,
  HttpCode,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { ProductService, CatalogTreeResponse } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetTotalSoldDto } from './dto/set-total-sold.dto';
import { ReorderVariantImagesDto, VariantImageUrlDto } from './dto/variant-images.dto';
import { ParseObjectIdPipe } from './pipes/parse-object-id.pipe';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

import { multerOptions } from '../common/multer/multer.config';

const queryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ─────────────────────────────────────────────────────────
  //  Public Routes
  // ─────────────────────────────────────────────────────────

  /** Public catalogue — always returns only active products. */
  @Get()
  findAll(@Query(queryPipe) query: ProductQueryDto) {
    return this.productService.findAll(false, query);
  }

  /**
   * Admin catalogue — returns all products regardless of status.
   * Protected: only ADMIN role can call this route.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin')
  findAllAdmin(@Query(queryPipe) query: ProductQueryDto) {
    return this.productService.findAll(true, query);
  }

  /** Admin single product — includes unpublished/archived and inactive variants. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  findOneAdmin(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productService.findOne(id, true);
  }

  @Get('catalog-tree')
  getCatalogTree(): Promise<CatalogTreeResponse> {
    return this.productService.getCatalogTree();
  }

  @Get('category/:categoryId')
  findByCategory(
    @Param('categoryId', ParseObjectIdPipe) categoryId: string,
    @Query(queryPipe) query: ProductQueryDto,
  ) {
    return this.productService.findByCategory(categoryId, query);
  }

  @Get('subcategory/:subCategoryId')
  findBySubCategory(
    @Param('subCategoryId', ParseObjectIdPipe) subCategoryId: string,
    @Query(queryPipe) query: ProductQueryDto,
  ) {
    return this.productService.findBySubCategory(subCategoryId, query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
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
    @Param('id', ParseObjectIdPipe) id: string,
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
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productService.remove(id);
  }

  /** Safe alternative to DELETE: hides the product but keeps it for order history. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/archive')
  archive(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productService.archive(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/restore')
  restore(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productService.restore(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/publish')
  publish(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productService.setPublished(id, true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/unpublish')
  unpublish(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productService.setPublished(id, false);
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
    @Param('id', ParseObjectIdPipe) productId: string,
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
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
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
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
  ) {
    return this.productService.addVariantImages(productId, variantId, files);
  }

  /** Remove a variant from a product. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id/variants/:variantId')
  deleteVariant(
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
  ) {
    return this.productService.deleteVariant(productId, variantId);
  }

  /** Atomic stock change: body { stock } (absolute) OR { delta } (relative). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/variants/:variantId/stock')
  adjustStock(
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productService.adjustVariantStock(productId, variantId, dto);
  }

  /** Remove one image from a variant (body: { url }). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/variants/:variantId/images/remove')
  @HttpCode(200)
  removeVariantImage(
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
    @Body() dto: VariantImageUrlDto,
  ) {
    return this.productService.removeVariantImage(productId, variantId, dto.url);
  }

  /** Reorder variant images (body: { images: [...all current urls in new order] }). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/variants/:variantId/images/order')
  reorderVariantImages(
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
    @Body() dto: ReorderVariantImagesDto,
  ) {
    return this.productService.reorderVariantImages(productId, variantId, dto.images);
  }

  /** Make an image the primary (first) one (body: { url }). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/variants/:variantId/images/primary')
  setPrimaryImage(
    @Param('id', ParseObjectIdPipe) productId: string,
    @Param('variantId', ParseObjectIdPipe) variantId: string,
    @Body() dto: VariantImageUrlDto,
  ) {
    return this.productService.setPrimaryVariantImage(productId, variantId, dto.url);
  }

  // ─────────────────────────────────────────────────────────
  //  Admin: Sales Count Override
  // ─────────────────────────────────────────────────────────

  /** Admin can manually set how many units of a product have been sold. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/total-sold')
  setTotalSold(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SetTotalSoldDto,
  ) {
    return this.productService.setTotalSold(id, dto.totalSold);
  }
}
