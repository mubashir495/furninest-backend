import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WishlistDocument = Wishlist & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class Wishlist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;
}

export const WishlistSchema = SchemaFactory.createForClass(Wishlist);

// Prevent the same user from adding the same product twice
WishlistSchema.index({ user: 1, product: 1 }, { unique: true });