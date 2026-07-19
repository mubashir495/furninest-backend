import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CartDocument = Cart & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user: Types.ObjectId;
}

export const CartSchema = SchemaFactory.createForClass(Cart);