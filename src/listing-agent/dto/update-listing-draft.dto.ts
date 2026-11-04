import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ListingDraftStatus } from '../schemas/listing-draft.schema';

export class UpdateListingDraftDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsEnum(ListingDraftStatus)
  status?: ListingDraftStatus;

  @IsOptional()
  @IsObject()
  analysis?: Record<string, any>;

  @IsOptional()
  @IsObject()
  seo?: Record<string, any>;

  @IsOptional()
  @IsObject()
  pricing?: Record<string, any>;

  @IsOptional()
  @IsArray()
  variants?: any[];

  @IsOptional()
  @IsArray()
  generatedImages?: any[];

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  reviewRequired?: boolean;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  subCategoryId?: string;

  /**
   * UK compliance confirmation: physical fire safety label confirmed on upholstered item.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  fireSafetyLabelConfirmed?: boolean;

  /**
   * Location where stock is held in the UK.
   */
  @IsOptional()
  @IsString()
  stockLocation?: string;
}
