import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Cart, CartSchema } from './schema/cart.schema';
import { CartItem, CartItemSchema } from './schema/cart-item.schema';
import { Product, ProductSchema } from '../product/schema/product.schema';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: CartItem.name, schema: CartItemSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}