import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  /**
   * Required when updating a variant-specific cart item.
   * Must match the variantId that was used when adding the item.
   * Omit for legacy (non-variant) items.
   */
  @IsOptional()
  @IsString()
  variantId?: string;
}
