import { IsMongoId, IsNotEmpty, IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddCartItemDto {
  @IsMongoId({ message: 'productId must be a valid product id' })
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number = 1;

  /**
   * Optional variant ID (_id of the ProductVariant sub-document).
   * When provided, price and stock are resolved from the variant.
   * When omitted, the top-level product price/stock are used (legacy behaviour).
   */
  @IsOptional()
  @IsString()
  variantId?: string;
}