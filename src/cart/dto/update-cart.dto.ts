import { PartialType } from '@nestjs/mapped-types';
import { AddCartItemDto } from './create-cart.dto';

export class UpdateCartDto extends PartialType(AddCartItemDto) {}
