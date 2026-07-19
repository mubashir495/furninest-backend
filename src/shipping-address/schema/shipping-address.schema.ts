import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ShippingAddressDocument = ShippingAddress & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class ShippingAddress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  // Optional friendly name e.g. "Home", "Office"
  @Prop({ trim: true, default: 'Home' })
  label: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ required: true, trim: true })
  addressLine1: string;

  @Prop({ trim: true })
  addressLine2?: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  state: string;

  @Prop({ required: true, trim: true })
  postalCode: string;

  @Prop({ required: true, trim: true, default: 'Pakistan' })
  country: string;

  @Prop({ default: false, index: true })
  isDefault: boolean;
}

export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);