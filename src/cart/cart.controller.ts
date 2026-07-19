import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';

import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  addItem(
    @CurrentUser('userId') userId: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(userId, dto);
  }

  @Patch('items/:productId')
  updateItem(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(userId, productId, dto);
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(userId, productId);
  }

  @Delete()
  clearCart(@CurrentUser('userId') userId: string) {
    return this.cartService.clearCart(userId);
  }
}