import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Review, ReviewSchema } from './schema/review.schema';
import { Order, OrderSchema } from '../order/schema/order.schema';
import { OrderItem, OrderItemSchema } from '../order/schema/order-item.schema';
import { Product, ProductSchema } from '../product/schema/product.schema';

import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
