import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  shortDescription: string;

  @Prop({ required: true, trim: true })
  longDescription: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ min: 0, max: 100, default: 0 })
  discount: number;

  @Prop({ min: 0, default: 0 })
  stock: number;

  @Prop({ default: '' })
  thumbnailImage: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: Types.ObjectId, ref: 'SubCategory', required: true, index: true })
  subCategory: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  category: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Product', default: [] })
  suggestionItems: Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.virtual('finalPrice').get(function (this: Product) {
  return Math.round(this.price - (this.price * this.discount) / 100);
});

ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });