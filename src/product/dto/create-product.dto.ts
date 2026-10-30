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
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

export class SpecificationDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  label: string;

  @IsString() @IsNotEmpty() @MaxLength(300)
  value: string;
}

const parseJsonArray = ({ value }: { value: any }) => {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
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

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
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

  // ── New optional fields (all backward compatible) ─────────────────────────
  @IsOptional() @IsString() @MaxLength(100)
  brand?: string;

  @IsOptional()
  @Transform(parseArrayField)
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    // Accept JSON string (from FormData) or a plain array
    let arr: any[];
    if (Array.isArray(value)) {
      arr = value;
    } else if (typeof value === 'string') {
      try { arr = JSON.parse(value); } catch { return []; }
    } else {
      return [];
    }
    if (!Array.isArray(arr)) return [];
    // Explicitly instantiate SpecificationDto so @Type + whitelist work correctly
    return arr.map((item: any) => {
      const dto = new SpecificationDto();
      dto.label = typeof item?.label === 'string' ? item.label : '';
      dto.value = typeof item?.value === 'string' ? item.value : '';
      return dto;
    });
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];

  @IsOptional() @IsString() @MaxLength(500)
  material?: string;

  @IsOptional() @IsString() @MaxLength(500)
  dimensions?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  careInstructions?: string;

  @IsOptional() @IsString() @MaxLength(70)
  seoTitle?: string;

  @IsOptional() @IsString() @MaxLength(170)
  seoDescription?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isFeatured?: boolean;
}
