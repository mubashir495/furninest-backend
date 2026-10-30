import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Product, ProductDocument, ProductVariant } from './schema/product.schema';
import { Category, CategoryDocument } from '../category/schema/category.schema';
import { SubCategory, SubCategoryDocument } from '../subcategory/schema/subcategory.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductQueryDto, ProductSort } from './dto/product-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { slugify } from '../common/utils/slugify';
import { UploadService } from '../upload/upload.service';
import { RevalidationService } from '../revalidation/revalidation.service';

const LIST_FIELDS =
  'name slug shortDescription price discount stock thumbnailImage images color size variants brand isFeatured category subCategory suggestionItems isActive isArchived created_date updated_date totalSold avgRating totalReviews';

const FULL_FIELDS =
  'name slug shortDescription longDescription price discount stock thumbnailImage images color size variants brand features specifications material dimensions careInstructions seoTitle seoDescription isFeatured category subCategory suggestionItems isActive isArchived archivedAt created_date updated_date totalSold avgRating totalReviews';

const PUBLIC_FILTER = { isActive: true, isArchived: { $ne: true } };

export interface ProductFiles {
  thumbnail?: Express.Multer.File[];
  images?: Express.Multer.File[];
}

const ObjectIdCtor = (mongoose as any).Types.ObjectId;
const oid = (id: string) => new ObjectIdCtor(id);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(SubCategory.name) private readonly subCategoryModel: Model<SubCategoryDocument>,
    private readonly uploadService: UploadService,
    private readonly revalidationService: RevalidationService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;
    while (
      await this.productModel.exists({
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

  private rethrowDuplicate(err: any): never {
    if (err?.code === 11000) {
      throw new ConflictException('A product with this slug already exists. Please retry.');
    }
    throw err;
  }

  /** Best-effort storage cleanup — never throws. */
  private async safeDeleteImages(urls: string[]) {
    for (const url of urls ?? []) {
      if (!url) continue;
      try {
        await this.uploadService.deleteImage(url);
      } catch (e) {
        console.error('Failed to delete image:', url, e);
      }
    }
  }

  /** Public shape: hides inactive variants, adds inStock + startingPrice. */
  private toPublic(doc: any) {
    const obj = doc?.toJSON ? doc.toJSON() : { ...doc };
    obj.variants = (obj.variants ?? []).filter((v: any) => v.isActive !== false);
    const hasVariants = obj.variants.length > 0;
    obj.inStock = hasVariants
      ? obj.variants.some((v: any) => v.stock > 0)
      : (obj.stock ?? 0) > 0;
    obj.startingPrice = hasVariants
      ? Math.min(...obj.variants.map((v: any) => v.finalPrice ?? v.price))
      : (obj.finalPrice ?? obj.price);
    return obj;
  }

  private cleanAttributes(attrs?: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return out;
    for (const [k, v] of Object.entries(attrs).slice(0, 20)) {
      if (k.startsWith('$') || k.includes('.')) continue; // no operator / path keys
      if (v === null || typeof v === 'object') continue;
      out[k.slice(0, 50)] = String(v).slice(0, 200);
    }
    return out;
  }

  private assertPrices(price: number, salePrice?: number | null) {
    if (salePrice !== null && salePrice !== undefined && salePrice >= price) {
      throw new BadRequestException('salePrice must be lower than price.');
    }
  }

  /** SKU must be unique across all products' variants (empty SKU is allowed). */
  private async assertSkuAvailable(sku: string | undefined, exceptVariantId?: string) {
    if (!sku) return;
    const hit = await this.productModel
      .findOne({ 'variants.sku': sku })
      .select('variants._id variants.sku')
      .lean();
    if (!hit) return;
    const clash = (hit.variants as any[]).some(
      (v) => v.sku === sku && v._id.toString() !== exceptVariantId,
    );
    if (clash) throw new ConflictException(`SKU "${sku}" is already in use.`);
  }

  private assertUniqueCombo(
    variants: any[],
    configName: string,
    colorName: string,
    exceptVariantId?: string,
  ) {
    const norm = (s: string) => (s ?? '').trim().toLowerCase();
    const clash = variants.some(
      (v) =>
        v._id.toString() !== exceptVariantId &&
        norm(v.configName) === norm(configName) &&
        norm(v.colorName) === norm(colorName),
    );
    if (clash) {
      throw new ConflictException('This configuration + colour combination already exists.');
    }
  }

  private async getVariantOrThrow(productId: string, variantId: string) {
    const product = await this.productModel.findById(productId).select('variants');
    if (!product) throw new NotFoundException('Product not found.');
    const variant = (product.variants as any[]).find((v) => v._id?.toString() === variantId);
    if (!variant) throw new NotFoundException('Variant not found on this product.');
    return { product, variant };
  }

  private async getSuggestions(product: ProductDocument) {
    const base = product.suggestionItems?.length
      ? { _id: { $in: product.suggestionItems }, ...PUBLIC_FILTER }
      : { subCategory: product.subCategory, _id: { $ne: product._id }, ...PUBLIC_FILTER };
    const items = await this.productModel
      .find(base)
      .select('name slug price discount thumbnailImage images color size stock variants')
      .limit(8);
    return items.map((p) => this.toPublic(p));
  }

  // ─── Product CRUD ──────────────────────────────────────────────────────────

  async create(dto: CreateProductDto, files: ProductFiles) {
    const subCategory = await this.resolveSubCategory(dto.subCategory);
    const slug = await this.generateUniqueSlug(dto.name);

    let imageUrls: string[] = [];
    let thumbnailUrl = '';
    if (files?.images?.length) {
      imageUrls = await this.uploadService.uploadImages(files.images, 'products');
    }
    if (files?.thumbnail?.length) {
      const up = await this.uploadService.uploadImages(files.thumbnail, 'products');
      thumbnailUrl = up[0] || '';
    }

    try {
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
      this.revalidationService.revalidateProduct({
        action: 'create',
        id: product._id.toString(),
        slug: product.slug,
      });
      return { success: true, message: 'Product created successfully.', data: product };
    } catch (err) {
      await this.safeDeleteImages([...imageUrls, thumbnailUrl]); // don't orphan uploads
      this.rethrowDuplicate(err);
    }
  }

  /**
   * Backward compatible: with no `page`/`limit` the full array is returned as before.
   * With `page` or `limit`, the response also carries `meta`.
   */
  async findAll(isAdmin = false, q: ProductQueryDto = {}) {
    const filter: Record<string, any> = isAdmin ? {} : { ...PUBLIC_FILTER };
    const and: any[] = [];

    if (isAdmin && q.archived !== undefined) {
      filter.isArchived = q.archived ? true : { $ne: true };
    }
    if (q.category) filter.category = q.category;
    if (q.subCategory) filter.subCategory = q.subCategory;
    if (q.featured !== undefined) filter.isFeatured = q.featured;

    if (q.search?.trim()) {
      const rx = new RegExp(escapeRegex(q.search.trim()), 'i');
      and.push({ $or: [{ name: rx }, { shortDescription: rx }, { brand: rx }] });
    }
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      const range: Record<string, number> = {};
      if (q.minPrice !== undefined) range.$gte = q.minPrice;
      if (q.maxPrice !== undefined) range.$lte = q.maxPrice;
      and.push({ $or: [{ price: range }, { variants: { $elemMatch: { price: range, isActive: true } } }] });
    }
    if (q.inStock) {
      and.push({
        $or: [
          { 'variants.0': { $exists: false }, stock: { $gt: 0 } },
          { variants: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } },
        ],
      });
    }
    if (and.length) filter.$and = and;

    const sortMap: Record<string, any> = {
      [ProductSort.NEWEST]: { created_date: -1 },
      [ProductSort.PRICE_ASC]: { price: 1, created_date: -1 },
      [ProductSort.PRICE_DESC]: { price: -1, created_date: -1 },
      [ProductSort.NAME]: { name: 1 },
    };
    const sort = sortMap[q.sort ?? ProductSort.NEWEST];

    const paginated = q.page !== undefined || q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 12;

    let query = this.productModel
      .find(filter)
      .select(isAdmin ? FULL_FIELDS : LIST_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort(sort);
    if (paginated) query = query.skip((page - 1) * limit).limit(limit);

    const [products, total] = await Promise.all([
      query,
      paginated ? this.productModel.countDocuments(filter) : Promise.resolve(0),
    ]);

    const data = isAdmin ? products : products.map((p) => this.toPublic(p));
    return paginated
      ? { success: true, data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      : { success: true, data };
  }

  async findByCategory(categoryId: string, q: ProductQueryDto = {}) {
    return this.findAll(false, { ...q, category: categoryId });
  }

  async findBySubCategory(subCategoryId: string, q: ProductQueryDto = {}) {
    return this.findAll(false, { ...q, subCategory: subCategoryId });
  }

  async findOne(id: string, isAdmin = false) {
    const product = await this.productModel
      .findOne({ _id: id, ...(isAdmin ? {} : PUBLIC_FILTER) })
      .select(FULL_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');
    if (!product) throw new NotFoundException('Product not found.');
    return this.buildDetail(product, isAdmin);
  }

  async findBySlug(slug: string) {
    const product = await this.productModel
      .findOne({ slug, ...PUBLIC_FILTER })
      .select(FULL_FIELDS)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');
    if (!product) throw new NotFoundException('Product not found.');
    return this.buildDetail(product, false);
  }

  private async buildDetail(product: ProductDocument, isAdmin: boolean) {
    const suggestions = await this.getSuggestions(product);
    const base = isAdmin ? (product.toJSON() as any) : this.toPublic(product);
    return { success: true, data: { ...base, suggestions } };
  }

  async update(id: string, dto: UpdateProductDto, files?: ProductFiles) {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException('Product not found.');
    const deletedSlug = product.slug;
    const deletedId = product._id.toString();
    const previousSlug = product.slug;
    if (!product) throw new NotFoundException('Product not found.');

    if (dto.subCategory) {
      const subCategory = await this.resolveSubCategory(dto.subCategory);
      product.subCategory = subCategory._id as any;
      product.category = subCategory.category;
    }

    if (dto.name && dto.name.trim() !== product.name) {
      product.name = dto.name.trim();
      product.slug = await this.generateUniqueSlug(dto.name, id);
    }

    // Upload new files FIRST; delete the replaced ones only after a successful save.
    const toDelete: string[] = [];
    const newUploads: string[] = [];

    if (files?.images?.length) {
      const urls = await this.uploadService.uploadImages(files.images, 'products');
      newUploads.push(...urls);
      toDelete.push(...(product.images ?? []));
      product.images = urls;
    }
    if (files?.thumbnail?.length) {
      const up = await this.uploadService.uploadImages(files.thumbnail, 'products');
      if (up[0]) {
        newUploads.push(up[0]);
        if (product.thumbnailImage) toDelete.push(product.thumbnailImage);
        product.thumbnailImage = up[0];
      }
    } else if (dto.thumbnailImage) {
      product.thumbnailImage = dto.thumbnailImage;
    }

    product.shortDescription = dto.shortDescription ?? product.shortDescription;
    product.longDescription = dto.longDescription ?? product.longDescription;
    product.price = dto.price ?? product.price;
    product.discount = dto.discount ?? product.discount;
    product.stock = dto.stock ?? product.stock;
    product.color = dto.color ?? product.color;
    product.size = dto.size ?? product.size;
    product.isActive = dto.isActive ?? product.isActive;

    // new optional fields
    product.brand = dto.brand ?? product.brand;
    product.features = dto.features ?? product.features;
    product.specifications = dto.specifications ?? product.specifications;
    product.material = dto.material ?? product.material;
    product.dimensions = dto.dimensions ?? product.dimensions;
    product.careInstructions = dto.careInstructions ?? product.careInstructions;
    product.seoTitle = dto.seoTitle ?? product.seoTitle;
    product.seoDescription = dto.seoDescription ?? product.seoDescription;
    product.isFeatured = dto.isFeatured ?? product.isFeatured;

    if (dto.suggestionItems) {
      product.suggestionItems = dto.suggestionItems.map((i) => oid(i)) as any;
    }

    try {
      await product.save();
    } catch (err) {
      await this.safeDeleteImages(newUploads); // roll back new uploads, keep old ones
      this.rethrowDuplicate(err);
    }
    await this.safeDeleteImages(toDelete);
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: product._id.toString(),
      slug: product.slug,
      previousSlug: previousSlug !== product.slug ? previousSlug : undefined,
    });

    return { success: true, message: 'Product updated successfully.', data: product };
  }

  /**
   * Hard delete (legacy behaviour, kept). DB first, storage second.
   * Prefer archive() for products that may appear in past orders.
   */
  async remove(id: string) {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException('Product not found.');

    const deletedSlug = product.slug;
    const deletedId = product._id.toString();

    const urls = [
      product.thumbnailImage,
      ...(product.images ?? []),
      ...((product.variants as any[]) ?? []).flatMap((v) => v.images ?? []),
    ];

    await product.deleteOne();
    await this.safeDeleteImages(urls);
    this.revalidationService.revalidateProduct({
      action: 'delete',
      id: deletedId,
      slug: deletedSlug,
    });

    return { success: true, message: 'Product deleted successfully.' };
  }

  async archive(id: string) {
    const product = await this.productModel.findByIdAndUpdate(
      id,
      { $set: { isArchived: true, isActive: false, archivedAt: new Date() } },
      { new: true },
    );
    if (!product) throw new NotFoundException('Product not found.');
    this.revalidationService.revalidateProduct({
      action: 'archive',
      id: product._id.toString(),
      slug: product.slug,
    });
    return { success: true, message: 'Product archived.', data: product };
  }

  /** Restores as unpublished (isActive=false) so an admin must consciously re-publish. */
  async restore(id: string) {
    const product = await this.productModel.findByIdAndUpdate(
      id,
      { $set: { isArchived: false, archivedAt: null } },
      { new: true },
    );
    if (!product) throw new NotFoundException('Product not found.');
    this.revalidationService.revalidateProduct({
      action: 'restore',
      id: product._id.toString(),
      slug: product.slug,
    });
    return { success: true, message: 'Product restored (still unpublished).', data: product };
  }

  async setPublished(id: string, isActive: boolean) {
    const product = await this.productModel.findOneAndUpdate(
      { _id: id, isArchived: { $ne: true } },
      { $set: { isActive } },
      { new: true },
    );
    if (!product) throw new NotFoundException('Product not found (or archived).');
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: product._id.toString(),
      slug: product.slug,
    });
    return { success: true, message: isActive ? 'Product published.' : 'Product unpublished.', data: product };
  }

  // ─── Variant CRUD (all atomic — one variant never overwrites another) ─────

  async addVariant(productId: string, dto: CreateVariantDto, files?: { images?: Express.Multer.File[] }) {
    const product = await this.productModel.findById(productId).select('variants');
    if (!product) throw new NotFoundException('Product not found.');

    this.assertPrices(dto.price, dto.salePrice);
    this.assertUniqueCombo(product.variants as any[], dto.configName, dto.colorName ?? '');
    await this.assertSkuAvailable(dto.sku);

    let imageUrls: string[] = [];
    if (files?.images?.length) {
      imageUrls = await this.uploadService.uploadImages(files.images, 'products/variants');
    }

    const newVariant = {
      _id: new ObjectIdCtor(),
      configName: dto.configName.trim(),
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
      attributes: this.cleanAttributes(dto.attributes),
    };

    const updated = await this.productModel.findByIdAndUpdate(
      productId,
      { $push: { variants: newVariant } },
      { new: true },
    );
    if (!updated) {
      await this.safeDeleteImages(imageUrls);
      throw new NotFoundException('Product not found.');
    }
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: updated.slug,
    });
    return { success: true, message: 'Variant added successfully.', data: updated };
  }

  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto) {
    const { product, variant } = await this.getVariantOrThrow(productId, variantId);

    const price = dto.price ?? variant.price;
    const salePrice = dto.salePrice !== undefined ? dto.salePrice : variant.salePrice;
    this.assertPrices(price, salePrice);

    const configName = dto.configName ?? variant.configName;
    const colorName = dto.colorName ?? variant.colorName;
    this.assertUniqueCombo(product.variants as any[], configName, colorName, variantId);
    if (dto.sku !== undefined) await this.assertSkuAvailable(dto.sku, variantId);

    const set: Record<string, any> = {};
    const fields = ['configName', 'colorName', 'colorHex', 'sku', 'price', 'salePrice', 'stock', 'isActive', 'dimensions', 'material', 'weight'] as const;
    for (const f of fields) {
      if ((dto as any)[f] !== undefined) set[`variants.$[v].${f}`] = (dto as any)[f];
    }
    if (dto.attributes !== undefined) set['variants.$[v].attributes'] = this.cleanAttributes(dto.attributes);
    if (!Object.keys(set).length) throw new BadRequestException('Nothing to update.');

    const updated = await this.productModel.findOneAndUpdate(
      { _id: productId },
      { $set: set },
      { new: true, arrayFilters: [{ 'v._id': oid(variantId) }] },
    );
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: updated?.slug,
    });
    return { success: true, message: 'Variant updated successfully.', data: updated };
  }

  async addVariantImages(productId: string, variantId: string, files: { images?: Express.Multer.File[] }) {
    if (!files?.images?.length) throw new BadRequestException('No images provided.');
    await this.getVariantOrThrow(productId, variantId);

    const urls = await this.uploadService.uploadImages(files.images, 'products/variants');
    const updated = await this.productModel.findOneAndUpdate(
      { _id: productId },
      { $push: { 'variants.$[v].images': { $each: urls } } },
      { new: true, arrayFilters: [{ 'v._id': oid(variantId) }] },
    );
    if (!updated) {
      await this.safeDeleteImages(urls);
      throw new NotFoundException('Product not found.');
    }
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: updated?.slug,
    });
    return { success: true, message: 'Variant images uploaded successfully.', data: updated };
  }

  async removeVariantImage(productId: string, variantId: string, url: string) {
    const { variant } = await this.getVariantOrThrow(productId, variantId);
    if (!(variant.images ?? []).includes(url)) {
      throw new NotFoundException('Image not found on this variant.');
    }
    const updated = await this.productModel.findOneAndUpdate(
      { _id: productId },
      { $pull: { 'variants.$[v].images': url } },
      { new: true, arrayFilters: [{ 'v._id': oid(variantId) }] },
    );
    await this.safeDeleteImages([url]);
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: updated?.slug,
    });
    return { success: true, message: 'Image removed.', data: updated };
  }

  /** `images` must be exactly the variant's current URLs, in the new order. */
  async reorderVariantImages(productId: string, variantId: string, images: string[]) {
    const { variant } = await this.getVariantOrThrow(productId, variantId);
    const current: string[] = variant.images ?? [];
    const same =
      images.length === current.length &&
      new Set(images).size === images.length &&
      images.every((u) => current.includes(u));
    if (!same) {
      throw new BadRequestException('images must contain exactly the variant\'s current images.');
    }
    const updated = await this.productModel.findOneAndUpdate(
      { _id: productId },
      { $set: { 'variants.$[v].images': images } },
      { new: true, arrayFilters: [{ 'v._id': oid(variantId) }] },
    );
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: updated?.slug,
    });
    return { success: true, message: 'Images reordered.', data: updated };
  }

  /** Primary image = first image. */
  async setPrimaryVariantImage(productId: string, variantId: string, url: string) {
    const { variant } = await this.getVariantOrThrow(productId, variantId);
    const current: string[] = variant.images ?? [];
    if (!current.includes(url)) throw new NotFoundException('Image not found on this variant.');
    return this.reorderVariantImages(productId, variantId, [url, ...current.filter((u) => u !== url)]);
  }

  /**
   * Atomic stock change. Never goes below 0.
   * Use `delta: -qty` from the order flow to deduct stock safely under concurrency.
   */
  async adjustVariantStock(productId: string, variantId: string, dto: AdjustStockDto) {
    const hasStock = dto.stock !== undefined;
    const hasDelta = dto.delta !== undefined;
    if (hasStock === hasDelta) throw new BadRequestException('Send exactly one of "stock" or "delta".');
    await this.getVariantOrThrow(productId, variantId);

    const vid = oid(variantId);
    let updated;
    if (hasStock) {
      updated = await this.productModel.findOneAndUpdate(
        { _id: productId },
        { $set: { 'variants.$[v].stock': dto.stock } },
        { new: true, arrayFilters: [{ 'v._id': vid }] },
      );
    } else {
      const delta = dto.delta as number;
      updated = await this.productModel.findOneAndUpdate(
        {
          _id: productId,
          variants: { $elemMatch: { _id: vid, stock: { $gte: delta < 0 ? -delta : 0 } } },
        },
        { $inc: { 'variants.$[v].stock': delta } },
        { new: true, arrayFilters: [{ 'v._id': vid }] },
      );
      if (!updated) throw new ConflictException('Insufficient stock for this change.');
    }
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: updated?.slug,
    });
    return { success: true, message: 'Stock updated.', data: updated };
  }

  async deleteVariant(productId: string, variantId: string) {
    const { product, variant } = await this.getVariantOrThrow(productId, variantId);
    const images: string[] = variant.images ?? [];

    await this.productModel.updateOne(
      { _id: productId },
      { $pull: { variants: { _id: oid(variantId) } } },
    );
    await this.safeDeleteImages(images);
    this.revalidationService.revalidateProduct({
      action: 'update',
      id: productId,
      slug: (product as any)?.slug,
    });

    return { success: true, message: 'Variant deleted successfully.' };
  }

  // ─── Sales Count (Admin manual override) ──────────────────────────────────

  async setTotalSold(productId: string, totalSold: number) {
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      { $set: { totalSold } },
      { new: true },
    );
    if (!product) throw new NotFoundException('Product not found.');
    return { success: true, message: 'Total sold updated.', data: { totalSold: product.totalSold } };
  }

  /** Increment totalSold for multiple products (called from OrderService on DELIVERED). */
  async incrementTotalSold(items: { productId: string; quantity: number }[]) {
    for (const item of items) {
      await this.productModel.updateOne(
        { _id: item.productId },
        { $inc: { totalSold: item.quantity } },
      );
    }
  }

  // ─── Catalog Tree ──────────────────────────────────────────────────────────

  async getCatalogTree() {
    const categories = await this.categoryModel.find().sort({ name: 1 }).lean();
    const subCategories = await this.subCategoryModel.find().sort({ name: 1 }).lean();
    const tree = categories.map((category) => ({
      ...category,
      subCategories: subCategories.filter(
        (sub) => sub.category.toString() === category._id.toString(),
      ),
    }));
    return { success: true, data: tree };
  }
}