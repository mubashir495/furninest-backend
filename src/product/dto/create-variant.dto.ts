import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVariantDto {
  /** Configuration name — e.g. '3-Seater', '5-Seater', 'Single Chair' */
  @IsString()
  @IsNotEmpty()
  configName: string;

  /** Colour display name — e.g. 'Beige', 'Grey', 'Dark Blue' */
  @IsOptional()
  @IsString()
  colorName?: string;

  /** CSS hex colour for swatch rendering — e.g. '#D4A373' */
  @IsOptional()
  @IsString()
  colorHex?: string;

  /** Stock-keeping unit */
  @IsOptional()
  @IsString()
  sku?: string;

  /** Regular selling price in GBP (pence or decimal) */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  /** Sale price — only set when genuinely on sale and lower than price */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salePrice?: number;

  /** Available units */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  /** Human-readable dimensions e.g. 'W: 220cm, D: 95cm, H: 85cm' */
  @IsOptional()
  @IsString()
  dimensions?: string;

  /** Material / fabric details specific to this variant */
  @IsOptional()
  @IsString()
  material?: string;

  /** Weight in kg */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weight?: number;

  /** Whether this variant is available for purchase */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
