import { IsString, IsOptional, IsNumber, IsBoolean, IsInt, IsObject, Min, IsNotEmpty, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toBool = ({ value }: { value: any }) =>
  value === undefined ? undefined : value === 'true' || value === true;

// '' / 'null' (multipart) => null so a sale price can be cleared
const toNullableNumber = ({ value }: { value: any }) =>
  value === '' || value === 'null' || value === null ? null : Number(value);

const parseObject = ({ value }: { value: any }) => {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
};

export class CreateVariantDto {
  /** e.g. '3-Seater', '5-Seater', 'Single Chair' */
  @IsString() @IsNotEmpty()
  configName: string;

  @IsOptional() @IsString()
  colorName?: string;

  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { message: 'colorHex must be a valid hex colour, e.g. #D4A373' })
  colorHex?: string;

  @IsOptional() @IsString()
  sku?: string;

  /** Same unit the project already uses for product prices. */
  @IsNumber() @Min(0) @Type(() => Number)
  price: number;

  /** Must be lower than price. null clears the sale. */
  @IsOptional() @Transform(toNullableNumber) @IsNumber() @Min(0)
  salePrice?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  stock?: number;

  @IsOptional() @IsString()
  dimensions?: string;

  @IsOptional() @IsString()
  material?: string;

  @IsOptional() @Transform(toNullableNumber) @IsNumber() @Min(0)
  weight?: number | null;

  /** Free-form string attributes (finish, upholstery...). Values are coerced to strings. */
  @IsOptional() @Transform(parseObject) @IsObject()
  attributes?: Record<string, string>;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isActive?: boolean;
}
