import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateListingDraftDto {
  /**
   * Cost price in GBP (£).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'costPrice must be a valid number in GBP (£).' })
  @Min(0, { message: 'costPrice cannot be negative.' })
  costPrice?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  subCategoryId?: string;

  /**
   * Optional input language hint (seller notes may be in English, Urdu, or Roman Urdu).
   * All generated listing output is strictly British English.
   */
  @IsOptional()
  @IsString()
  language?: string;

  /**
   * Optional raw text details provided by the seller (name, material/fabric, size, condition, price range, etc.).
   * Supports English, Urdu, or Roman Urdu.
   */
  @IsOptional()
  @IsString()
  rawDetails?: string;

  /**
   * UK compliance confirmation: whether the physical fire safety label has been verified on upholstered items.
   */
  @IsOptional()
  @IsBoolean()
  fireSafetyLabelConfirmed?: boolean;

  /**
   * Location where stock is held in the UK (default: "UK warehouse").
   */
  @IsOptional()
  @IsString()
  stockLocation?: string;
}
