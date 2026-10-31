import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type OrderItemDocument = OrderItem & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class OrderItem {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true })
  order: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true })
  product: mongoose.Types.ObjectId;

  /** Snapshot of the product name at time of purchase */
  @Prop({ required: true, trim: true })
  productName: string;

  /** Snapshot of the product thumbnail URL at time of purchase */
  @Prop({ trim: true })
  productThumbnail?: string;

  /** Unit price at time of purchase */
  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  // ─── Variant snapshot fields (optional — null for legacy orders) ───

  /** The variant's _id at time of purchase */
  @Prop({ type: String, default: null })
  variantId: string | null;

  /** SKU snapshot at time of purchase */
  @Prop({ type: String, default: null })
  variantSku: string | null;

  /** Human-readable variant name snapshot e.g. '3-Seater / Grey' */
  @Prop({ type: String, default: null })
  variantName: string | null;

  /** Selected configuration at time of purchase e.g. '3-Seater' */
  @Prop({ type: String, default: null })
  selectedConfig: string | null;

  /** Selected colour at time of purchase e.g. 'Grey' */
  @Prop({ type: String, default: null })
  selectedColor: string | null;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

OrderItemSchema.virtual('subtotal').get(function (this: OrderItem) {
  return Math.round(this.price * this.quantity);
});

OrderItemSchema.set('toJSON', { virtuals: true });
OrderItemSchema.set('toObject', { virtuals: true });
