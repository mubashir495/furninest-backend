import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({
  timestamps: {
    createdAt: 'created_date',
    updatedAt: 'updated_date',
  },
})
export class Category {
  @Prop({
    required: true,
    trim: true,
    unique: true,
  })
  name: string;

  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  slug: string;

  @Prop({
    type: String,
    default: null,
  })
  image: string;

  @Prop({
    type: String,
    trim: true,
    default: '',
  })
  description: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);