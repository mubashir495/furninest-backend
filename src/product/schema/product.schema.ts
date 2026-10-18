import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type ProductDocument = Product & Document;

// ─────────────────────────────────────────────────────────
//  ProductVariant — embedded sub-document
//  Each purchasable configuration / colour combination
// ─────────────────────────────────────────────────────────
@Schema({ _id: true })
export class ProductVariant {
  /** e.g. '3-Seater', '5-Seater', 'Single Chair', 'Sofa + Chair Set' */
  @Prop({ required: true, trim: true })
  configName: string;

  /** e.g. 'Beige', 'Grey', 'Dark Blue' */
  @Prop({ trim: true, default: '' })
  colorName: string;

  /** CSS hex colour used for swatch rendering, e.g. '#D4A373' */
  @Prop({ trim: true, default: '' })
  colorHex: string;

  /** Stock-keeping unit — unique within a product */
  @Prop({ trim: true, default: '' })
  sku: string;

  /** Regular selling price in GBP pence (store as integer pence to avoid float issues) */
  @Prop({ required: true, min: 0 })
  price: number;

  /** Sale / discounted price — only set when genuinely on sale */
  @Prop({ min: 0, default: null })
  salePrice: number | null;

  /** Variant-specific image gallery (ordered) */
  @Prop({ type: [String], default: [] })
  images: string[];

  /** Available units */
  @Prop({ min: 0, default: 0 })
  stock: number;

  /** Human-readable dimensions e.g. 'W: 220cm, D: 95cm, H: 85cm' */
  @Prop({ trim: true, default: '' })
  dimensions: string;

  /** Material / fabric details specific to this variant */
  @Prop({ trim: true, default: '' })
  material: string;

  /** Weight in kg */
  @Prop({ min: 0, default: null })
  weight: number | null;

  /** Additional free-form attributes (finish, upholstery style, etc.) */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  attributes: Record<string, string>;

  /** Whether this variant is available for purchase */
  @Prop({ default: true })
  isActive: boolean;
}

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

// Virtual: effective selling price
ProductVariantSchema.virtual('finalPrice').get(function (this: ProductVariant) {
  if (this.salePrice !== null && this.salePrice !== undefined && this.salePrice < this.price) {
    return this.salePrice;
  }
  return this.price;
});

ProductVariantSchema.set('toJSON', { virtuals: true });
ProductVariantSchema.set('toObject', { virtuals: true });

// ─────────────────────────────────────────────────────────
//  Product — top-level document
// ─────────────────────────────────────────────────────────
@Schema({
  timestamps: {
    createdAt: 'created_date',
    updatedAt: 'updated_date',
  },
})
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  shortDescription: string;

  @Prop({ required: true, trim: true })
  longDescription: string;

  /**
   * Top-level price — used as the default when no variants are defined.
   * When variants exist, each variant carries its own price.
   */
  @Prop({ required: true, min: 0 })
  price: number;

  /** Legacy percentage discount (0–100) used when no variants exist. */
  @Prop({ min: 0, max: 100, default: 0 })
  discount: number;

  /** Top-level stock — used when no variants are defined. */
  @Prop({ min: 0, default: 0 })
  stock: number;

  @Prop({ default: '' })
  thumbnailImage: string;

  /** Shared gallery — used when no variants define their own images. */
  @Prop({ type: [String], default: [] })
  images: string[];

  // Available Colors (legacy — kept for backward compatibility)
  @Prop({
    type: [String],
    default: [],
  })
  color: string[];

  // Available Sizes (legacy — kept for backward compatibility)
  @Prop({
    type: [String],
    default: [],
  })
  size: string[];

  /**
   * Purchasable variants — each has its own price, stock, images, colour.
   * Empty array means the product is sold as a single unit (legacy behaviour).
   */
  @Prop({ type: [ProductVariantSchema], default: [] })
  variants: ProductVariant[];

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubCategory',
    required: true,
    index: true,
  })
  subCategory: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true,
  })
  category: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Product',
    default: [],
  })
  suggestionItems: mongoose.Schema.Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Virtual: top-level finalPrice (backward-compat for products without variants)
ProductSchema.virtual('finalPrice').get(function (this: Product) {
  return Math.round(this.price - (this.price * this.discount) / 100);
});

ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });