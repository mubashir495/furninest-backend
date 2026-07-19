import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wishlist, WishlistDocument } from './schema/wishlist.schema';
import { Product, ProductDocument } from '../product/schema/product.schema';
import { AddWishlistDto } from './dto/create-wish_list.dto';

@Injectable()
export class WishlistService {
  constructor(
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,

    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async add(userId: string, dto: AddWishlistDto) {
    const product = await this.productModel.findById(dto.productId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const existing = await this.wishlistModel.findOne({
      user: userId,
      product: dto.productId,
    });

    if (existing) {
      throw new ConflictException('Product is already in your wishlist.');
    }

    const wishlistItem = new this.wishlistModel({
      user: new Types.ObjectId(userId),
      product: new Types.ObjectId(dto.productId),
    });
    await wishlistItem.save();

    return {
      success: true,
      message: 'Product added to wishlist.',
      data: wishlistItem,
    };
  }

  async findAll(userId: string) {
    const items = await this.wishlistModel
      .find({ user: userId })
      .populate({
        path: 'product',
        select:
          'name slug price discount thumbnailImage images stock isActive',
      })
      .sort({ created_date: -1 });

    return { success: true, data: items };
  }

  async isWishlisted(userId: string, productId: string) {
    const exists = await this.wishlistModel.exists({
      user: userId,
      product: productId,
    });

    return { success: true, data: { wishlisted: !!exists } };
  }

  async remove(userId: string, productId: string) {
    const item = await this.wishlistModel.findOneAndDelete({
      user: userId,
      product: productId,
    });

    if (!item) {
      throw new NotFoundException('Product not found in your wishlist.');
    }

    return {
      success: true,
      message: 'Product removed from wishlist.',
    };
  }

  async toggle(userId: string, dto: AddWishlistDto) {
    const existing = await this.wishlistModel.findOne({
      user: userId,
      product: dto.productId,
    });

    if (existing) {
      await existing.deleteOne();
      return {
        success: true,
        message: 'Product removed from wishlist.',
        data: { wishlisted: false },
      };
    }

    const product = await this.productModel.findById(dto.productId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const wishlistItem = new this.wishlistModel({
      user: new Types.ObjectId(userId),
      product: new Types.ObjectId(dto.productId),
    });
    await wishlistItem.save();

    return {
      success: true,
      message: 'Product added to wishlist.',
      data: { wishlisted: true },
    };
  }

  async clear(userId: string) {
    await this.wishlistModel.deleteMany({ user: userId });

    return {
      success: true,
      message: 'Wishlist cleared.',
    };
  }
}