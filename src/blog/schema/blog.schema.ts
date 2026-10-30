import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BlogDocument = BlogPost & Document;

export enum BlogStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Schema({ timestamps: true })
export class BlogPost {
  @Prop({ required: true, trim: true })
  title: string;

  /** Auto-generated from title; unique across all posts */
  @Prop({ required: true, unique: true, trim: true, lowercase: true, index: true })
  slug: string;

  @Prop({ trim: true, default: '' })
  excerpt: string;

  /** Sanitised HTML content */
  @Prop({ default: '' })
  content: string;

  @Prop({ default: '' })
  coverImage: string;

  @Prop({ trim: true, default: 'General' })
  category: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ trim: true, default: 'Admin' })
  author: string;

  @Prop({ type: String, enum: BlogStatus, default: BlogStatus.DRAFT, index: true })
  status: BlogStatus;

  /** Auto-calculated words-per-minute reading time (200 wpm) */
  @Prop({ type: Number, default: 1 })
  readTime: number;

  @Prop({ trim: true, default: '' })
  seoTitle: string;

  @Prop({ trim: true, default: '' })
  seoDescription: string;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}

export const BlogSchema = SchemaFactory.createForClass(BlogPost);

// Text index for admin search
BlogSchema.index({ title: 'text', excerpt: 'text', tags: 'text' });
