import { IsMongoId, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
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
}