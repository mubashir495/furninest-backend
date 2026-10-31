import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type SubCategoryDocument = SubCategory & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class SubCategory {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true })
  category: mongoose.Types.ObjectId;
}

export const SubCategorySchema = SchemaFactory.createForClass(SubCategory);

// Same name+category combo shouldn't repeat (different categories can share a subcategory name)
SubCategorySchema.index({ name: 1, category: 1 }, { unique: true });
