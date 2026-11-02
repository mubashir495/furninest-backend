import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateListingDraftDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'costPrice must be a valid number.' })
  @Min(0, { message: 'costPrice cannot be negative.' })
  costPrice: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  subCategoryId?: string;
}
