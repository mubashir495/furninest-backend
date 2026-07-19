import { PartialType } from '@nestjs/mapped-types';
import { AddWishlistDto } from './create-wish_list.dto';

export class UpdateWishListDto extends PartialType(AddWishlistDto) {}
