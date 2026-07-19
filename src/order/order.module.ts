import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Order, OrderSchema } from './schema/order.schema';
import { OrderItem, OrderItemSchema } from './schema/order-item.schema';
import {
  ShippingAddress,
  ShippingAddressSchema,
} from '../shipping-address/schema/shipping-address.schema';
import { Cart, CartSchema } from '../cart/schema/cart.schema';
import { CartItem, CartItemSchema } from '../cart/schema/cart-item.schema';
import { Product, ProductSchema } from '../product/schema/product.schema';

import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: ShippingAddress.name, schema: ShippingAddressSchema },
      { name: Cart.name, schema: CartSchema },
      { name: CartItem.name, schema: CartItemSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}