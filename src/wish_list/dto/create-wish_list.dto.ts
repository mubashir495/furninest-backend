import { IsMongoId, IsNotEmpty } from 'class-validator';

export class AddWishlistDto {
  @IsMongoId({ message: 'productId must be a valid product id' })
  @IsNotEmpty()
  productId: string;
}