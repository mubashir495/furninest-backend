import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Wishlist, WishlistSchema } from './schema/wishlist.schema';

import { Product, ProductSchema } from '../product/schema/product.schema';
import { WishlistService } from './wish_list.service';
import { WishlistController } from './wish_list.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wishlist.name, schema: WishlistSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}