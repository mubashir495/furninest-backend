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
import { Transform, Type } from 'class-transformer';

const parseArrayField = ({ value }: { value: any }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON
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
  @Type(() => Number)        s
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  thumbnailImage?: string;

  @IsOptional()
  @Transform(parseArrayField)
  @IsArray()
  @IsString({ each: true })
  color?: string[];

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