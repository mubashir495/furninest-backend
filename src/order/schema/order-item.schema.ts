import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderItemDocument = OrderItem & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  order: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ trim: true })
  productThumbnail?: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 1 })
  quantity: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

OrderItemSchema.virtual('subtotal').get(function (this: OrderItem) {
  return Math.round(this.price * this.quantity);
});

OrderItemSchema.set('toJSON', { virtuals: true });
OrderItemSchema.set('toObject', { virtuals: true });