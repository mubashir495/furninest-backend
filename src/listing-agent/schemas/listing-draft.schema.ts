import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ListingDraftDocument = ListingDraft & Document;

export enum ListingDraftStatus {
  QUEUED = 'queued',
  ANALYZING = 'analyzing',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

@Schema({ _id: false })
export class SpecificationItem {
  @Prop({ trim: true, default: '' })
  label: string;

  @Prop({ trim: true, default: '' })
  value: string;
}

@Schema({ _id: false })
export class AnalysisData {
  @Prop({ trim: true, default: '' })
  category: string;

  @Prop({ trim: true, default: '' })
  material: string;

  @Prop({ trim: true, default: '' })
  color: string;

  @Prop({ trim: true, default: '' })
  style: string;

  @Prop({ type: Number, default: null })
  seating?: number | null;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({
    type: [{ label: { type: String, trim: true }, value: { type: String, trim: true } }],
    _id: false,
    default: [],
  })
  specifications: SpecificationItem[];

  @Prop({ type: Number, default: 0, min: 0, max: 1 })
  confidence: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  raw?: Record<string, any>;
}

@Schema({ _id: false })
export class SeoData {
  @Prop({ trim: true, default: '', maxlength: 60 })
  title: string;

  @Prop({ trim: true, default: '' })
  slug: string;

  @Prop({ trim: true, default: '', maxlength: 155 })
  metaDescription: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

@Schema({ _id: false })
export class SuggestedPriceRange {
  @Prop({ type: Number, default: 0 })
  min: number;

  @Prop({ type: Number, default: 0 })
  max: number;
}

@Schema({ _id: false })
export class PricingData {
  @Prop({ required: true, min: 0, default: 0 })
  costPrice: number;

  @Prop({ default: 0.4 })
  marginRate: number;

  @Prop({ default: 0.20 })
  vatRate: number;

  @Prop({ default: 'GBP' })
  currency: string;

  @Prop({ default: 0 })
  calculatedPrice: number;

  @Prop({ type: Number, default: null })
  compareAtPrice: number | null;

  @Prop({ type: SuggestedPriceRange, default: null })
  suggestedPriceRange?: SuggestedPriceRange | null;
}

@Schema({ _id: true })
export class DraftVariant {
  @Prop({ required: true, trim: true })
  configName: string;

  @Prop({ trim: true, default: '' })
  colorName: string;

  @Prop({ trim: true, default: '' })
  colorHex: string;

  @Prop({ trim: true, default: '' })
  sku: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ type: Number, min: 0, default: null })
  compareAtPrice: number | null;

  @Prop({ min: 0, default: 0 })
  stock: number;

  @Prop({ trim: true, default: '' })
  dimensions: string;

  @Prop({ trim: true, default: '' })
  material: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: false })
  needsPhoto: boolean;

  @Prop({ default: true })
  suggested: boolean;

  @Prop({ default: false })
  isActive: boolean;
}

@Schema({ _id: false })
export class GeneratedImage {
  @Prop({ required: true })
  url: string;

  @Prop({ default: '' })
  prompt: string;

  @Prop({ enum: ['cleanup', 'lifestyle', 'other'], default: 'lifestyle' })
  type: string;

  @Prop({ default: true })
  isAiGenerated: boolean;
}

@Schema({
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
})
export class ListingDraft {
  @Prop({ type: [String], default: [] })
  sourceImages: string[];

  @Prop({ min: 0, default: 0 })
  costPrice: number;

  @Prop({
    type: String,
    enum: Object.values(ListingDraftStatus),
    default: ListingDraftStatus.QUEUED,
    index: true,
  })
  status: ListingDraftStatus;

  @Prop({ type: AnalysisData, default: () => ({}) })
  analysis: AnalysisData;

  @Prop({ type: SeoData, default: () => ({}) })
  seo: SeoData;

  @Prop({ type: [DraftVariant], default: [] })
  variants: DraftVariant[];

  @Prop({ type: PricingData, default: () => ({}) })
  pricing: PricingData;

  @Prop({ type: [GeneratedImage], default: [] })
  generatedImages: GeneratedImage[];

  @Prop({ default: false, index: true })
  reviewRequired: boolean;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    default: null,
    index: true,
  })
  publishedProductId: Types.ObjectId | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    default: null,
  })
  categoryId: Types.ObjectId | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SubCategory',
    default: null,
  })
  subCategoryId: Types.ObjectId | null;

  @Prop({ type: String, default: 'en' })
  language: string;

  @Prop({ type: String, default: null })
  rawDetails: string | null;

  /** UK compliance: whether the seller/admin has confirmed the physical fire safety label on upholstered items */
  @Prop({ default: false })
  fireSafetyLabelConfirmed: boolean;

  /** Stock location: held in the UK (default: "UK warehouse") */
  @Prop({ default: 'UK warehouse', trim: true })
  stockLocation: string;
}

export const ListingDraftSchema = SchemaFactory.createForClass(ListingDraft);
ListingDraftSchema.index({ status: 1, createdAt: -1 });
