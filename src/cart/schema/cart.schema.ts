import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type CartDocument = Cart & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class Cart {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user: mongoose.Schema.Types.ObjectId;
}

export const CartSchema = SchemaFactory.createForClass(Cart);