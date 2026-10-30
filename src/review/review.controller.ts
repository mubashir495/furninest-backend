import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  /** Get all active reviews for a product */
  @Get('product/:productId')
  getProductReviews(@Param('productId') productId: string) {
    return this.reviewService.getProductReviews(productId);
  }

  // ─── Customer (authenticated) ─────────────────────────────────────────────────

  /** Submit a review — must have a DELIVERED order containing the product */
  @UseGuards(JwtAuthGuard)
  @Post('order/:orderId/product/:productId')
  createReview(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(userId, orderId, productId, dto);
  }

  /** Get current user's own reviews */
  @UseGuards(JwtAuthGuard)
  @Get('my-reviews')
  getMyReviews(@CurrentUser('id') userId: string) {
    return this.reviewService.getMyReviews(userId);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────────

  /** Get all reviews — ?isActive=true|false optional filter */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin')
  adminGetAllReviews(@Query('isActive') isActive?: string) {
    const parsed =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.reviewService.adminGetAllReviews(parsed);
  }

  /** Toggle review active/inactive */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/status')
  updateReviewStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewService.updateReviewStatus(id, dto);
  }

  /** Delete a review permanently */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  deleteReview(@Param('id') id: string) {
    return this.reviewService.deleteReview(id);
  }
}
