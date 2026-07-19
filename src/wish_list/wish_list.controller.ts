import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';

import { WishlistService } from './wish_list.service';
import { AddWishlistDto } from './dto/create-wish_list.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.wishlistService.findAll(userId);
  }
  
  @Get('check/:productId')
  isWishlisted(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.isWishlisted(userId, productId);
  }
  @Post()
  add(@CurrentUser('userId') userId: string, @Body() dto: AddWishlistDto) {
    return this.wishlistService.add(userId, dto);
  }

  @Post('toggle')
  toggle(@CurrentUser('userId') userId: string, @Body() dto: AddWishlistDto) {
    return this.wishlistService.toggle(userId, dto);
  }

  @Delete('clear')
  clear(@CurrentUser('userId') userId: string) {
    return this.wishlistService.clear(userId);
  }

  @Delete(':productId')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.remove(userId, productId);
  }
}