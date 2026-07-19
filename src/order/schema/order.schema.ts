import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'ShippingAddress', required: true, index: true })
  shippingAddress: Types.ObjectId;

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

  @Prop({ default: null })
  cancelledAt?: Date;

  @Prop({ default: null })
  deliveredAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);