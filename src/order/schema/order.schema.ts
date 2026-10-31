import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type OrderDocument = Order & Document;

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  COD = 'COD',
  CARD = 'CARD',
}

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class Order {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  user: mongoose.Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'ShippingAddress', required: true, index: true })
  shippingAddress: mongoose.Types.ObjectId;

  @Prop({ type: String, enum: PaymentMethod, default: PaymentMethod.COD })
  paymentMethod: PaymentMethod;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING, index: true })
  status: OrderStatus;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, min: 0 })
  totalItems: number;

  @Prop({ trim: true })
  notes?: string;

  // Client-generated key; a retry with the same key returns the same order
  @Prop({ trim: true, maxlength: 80 })
  idempotencyKey?: string;

  @Prop({ default: null })
  cancelledAt?: Date;

  @Prop({ default: null })
  deliveredAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
