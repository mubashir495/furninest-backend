import { Type } from 'class-transformer';
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
  @IsBoolean()
  reviewRequired?: boolean;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  subCategoryId?: string;
}
