import { IsBoolean, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toBool = ({ value }: { value: any }) =>
  value === undefined || value === '' ? undefined : value === 'true' || value === true;

export enum ProductSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME = 'name',
}

/**
 * All fields optional. If neither `page` nor `limit` is sent, the list endpoints
 * behave exactly as before (full array, no pagination).
 */
export class ProductQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsMongoId()
  category?: string;

  @IsOptional() @IsMongoId()
  subCategory?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minPrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxPrice?: number;

  @IsOptional() @IsEnum(ProductSort)
  sort?: ProductSort;

  @IsOptional() @Transform(toBool) @IsBoolean()
  inStock?: boolean;

  @IsOptional() @Transform(toBool) @IsBoolean()
  featured?: boolean;

  /** Admin only: true = archived products, false = non-archived. Omitted = all. */
  @IsOptional() @Transform(toBool) @IsBoolean()
  archived?: boolean;
}
