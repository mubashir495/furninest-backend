import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CartItemDocument = CartItem & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'Cart', required: true, index: true })
  cart: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

 @Prop({ required: true, min: 0 })
  price: number;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

// Prevent duplicate rows for the same product in the same cart
CartItemSchema.index({ cart: 1, product: 1 }, { unique: true });

CartItemSchema.virtual('subtotal').get(function (this: CartItem) {
  return Math.round(this.price * this.quantity);
});

CartItemSchema.set('toJSON', { virtuals: true });
CartItemSchema.set('toObject', { virtuals: true });