import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' },
})
export class Review {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  })
  product: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  })
  order: mongoose.Types.ObjectId;

  /** 1–5 star rating */
  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true, trim: true, minlength: 10, maxlength: 1000 })
  comment: string;

  /** Admin can activate or deactivate a review */
  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// One review per user per product per order
ReviewSchema.index({ user: 1, product: 1, order: 1 }, { unique: true });
