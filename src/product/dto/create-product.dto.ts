import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsMongoId,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Helper: multipart/form-data sends arrays as either a JSON string
// (e.g. '["red","blue"]') or a comma-separated string (e.g. 'red,blue').
// This normalizes both into a proper string[].
const parseArrayField = ({ value }: { value: any }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON, fall back to comma-split
    }
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return value;
};

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  shortDescription: string;

  @IsString()
  @IsNotEmpty()
  longDescription: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  thumbnailImage?: string;

  // Available Colors
  @IsOptional()
  @Transform(parseArrayField)
  @IsArray()
  @IsString({ each: true })
  color?: string[];

  // Available Sizes
  @IsOptional()
  @Transform(parseArrayField)
  @IsArray()
  @IsString({ each: true })
  size?: string[];

  @IsMongoId()
  @IsNotEmpty()
  subCategory: string;

  @IsOptional()
  @Transform(parseArrayField)
  @IsArray()
  @IsMongoId({ each: true })
  suggestionItems?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}