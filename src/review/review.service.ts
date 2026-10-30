import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';

import { Review, ReviewDocument } from './schema/review.schema';
import { Order, OrderDocument, OrderStatus } from '../order/schema/order.schema';
import { OrderItem, OrderItemDocument } from '../order/schema/order-item.schema';
import { Product, ProductDocument } from '../product/schema/product.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItemDocument>,

    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private toObjectId(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestException('Invalid ID format');
    }
    return new (mongoose as any).Types.ObjectId(id);
  }

  // ─── Customer: submit a review ───────────────────────────────────────────────
  async createReview(userId: string, orderId: string, productId: string, dto: CreateReviewDto) {
    const userOid = this.toObjectId(userId);
    const orderOid = this.toObjectId(orderId);
    const productOid = this.toObjectId(productId);

    // 1. Order must exist and belong to this user
    const order = await this.orderModel.findById(orderOid);
    if (!order) throw new NotFoundException('Order not found.');
    if (order.user.toString() !== userId) throw new ForbiddenException('Not your order.');

    // 2. Order must be DELIVERED to leave a review
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('You can only review products from delivered orders.');
    }

    // 3. The product must be in this order
    const orderItem = await this.orderItemModel.findOne({
      order: orderOid,
      product: productOid,
    });
    if (!orderItem) {
      throw new BadRequestException('This product was not part of the specified order.');
    }

    // 4. Product must exist
    const product = await this.productModel.findById(productOid);
    if (!product) throw new NotFoundException('Product not found.');

    // 5. One review per user per product per order (unique index handles this,
    //    but give a friendly error)
    const existing = await this.reviewModel.findOne({
      user: userOid,
      product: productOid,
      order: orderOid,
    });
    if (existing) {
      throw new BadRequestException('You have already reviewed this product for this order.');
    }

    const review = new this.reviewModel({
      user: userOid,
      product: productOid,
      order: orderOid,
      rating: dto.rating,
      comment: dto.comment,
      isActive: true,
    });

    await review.save();

    // Update cached rating stats on the product
    await this.updateProductRatingStats(productId);

    return { success: true, message: 'Review submitted successfully.', data: review };
  }

  // ─── Public: get active reviews for a product ────────────────────────────────
  async getProductReviews(productId: string) {
    const productOid = this.toObjectId(productId);

    const reviews = await this.reviewModel
      .find({ product: productOid, isActive: true })
      .populate('user', 'fullName')
      .sort({ created_date: -1 });

    const total = reviews.length;
    const avgRating =
      total > 0
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
        : 0;

    return { success: true, data: reviews, total, avgRating };
  }

  // ─── Customer: get my reviews ─────────────────────────────────────────────────
  async getMyReviews(userId: string) {
    const reviews = await this.reviewModel
      .find({ user: this.toObjectId(userId) })
      .populate('product', 'name thumbnailImage slug')
      .populate('order', 'orderNumber')
      .sort({ created_date: -1 });

    return { success: true, data: reviews };
  }

  // ─── Admin: get all reviews (with optional isActive filter) ──────────────────
  async adminGetAllReviews(isActive?: boolean) {
    const filter: any = {};
    if (isActive !== undefined) filter.isActive = isActive;

    const reviews = await this.reviewModel
      .find(filter)
      .populate('user', 'fullName email')
      .populate('product', 'name thumbnailImage slug')
      .populate('order', 'orderNumber')
      .sort({ created_date: -1 });

    return { success: true, data: reviews, total: reviews.length };
  }

  // ─── Admin: toggle review active/inactive ────────────────────────────────────
  async updateReviewStatus(reviewId: string, dto: UpdateReviewStatusDto) {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException('Review not found.');

    review.isActive = dto.isActive;
    await review.save();

    // Update product stats after toggling
    await this.updateProductRatingStats(review.product.toString());

    return {
      success: true,
      message: `Review ${dto.isActive ? 'activated' : 'deactivated'} successfully.`,
      data: review,
    };
  }

  // ─── Admin: delete a review ───────────────────────────────────────────────────
  async deleteReview(reviewId: string) {
    const review = await this.reviewModel.findByIdAndDelete(reviewId);
    if (!review) throw new NotFoundException('Review not found.');

    await this.updateProductRatingStats(review.product.toString());

    return { success: true, message: 'Review deleted.' };
  }

  // ─── Internal: recalculate and cache rating stats on Product ─────────────────
  private async updateProductRatingStats(productId: string) {
    const productOid = this.toObjectId(productId);

    const [result] = await this.reviewModel.aggregate([
      { $match: { product: productOid, isActive: true } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    await this.productModel.updateOne(
      { _id: productOid },
      {
        $set: {
          avgRating: result ? Math.round(result.avgRating * 10) / 10 : 0,
          totalReviews: result ? result.totalReviews : 0,
        },
      },
    );
  }
}
