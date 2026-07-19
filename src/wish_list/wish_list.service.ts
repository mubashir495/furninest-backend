import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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

  // ہیلپر: ObjectId کی تصدیق
  private validateObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
    return new Types.ObjectId(id);
  }

  // ✅ Add to wishlist
  async add(userId: string, dto: AddWishlistDto) {
    const userObjectId = this.validateObjectId(userId);
    const productObjectId = this.validateObjectId(dto.productId);

    // چیک کریں کہ پروڈکٹ موجود ہے
    const product = await this.productModel.findById(productObjectId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    // چیک کریں کہ پہلے سے موجود تو نہیں
    const existing = await this.wishlistModel.findOne({
      user: userObjectId,
      product: productObjectId,
    });
    if (existing) {
      throw new ConflictException('Product is already in your wishlist.');
    }

    // نیا آئٹم بنائیں
    const wishlistItem = new this.wishlistModel({
      user: userObjectId,
      product: productObjectId,
    });
    await wishlistItem.save();

    return {
      success: true,
      message: 'Product added to wishlist.',
      data: wishlistItem,
    };
  }

  // ✅ تمام wishlist آئٹمز
  async findAll(userId: string) {
    const userObjectId = this.validateObjectId(userId);
    const items = await this.wishlistModel
      .find({ user: userObjectId })
      .populate({
        path: 'product',
        select:
          'name slug price discount thumbnailImage images stock isActive',
      })
      .sort({ created_date: -1 });

    return { success: true, data: items };
  }

  async isWishlisted(userId: string, productId: string) {
    const userObjectId = this.validateObjectId(userId);
    const productObjectId = this.validateObjectId(productId);

    const exists = await this.wishlistModel.exists({
      user: userObjectId,
      product: productObjectId,
    });

    return { success: true, data: { wishlisted: !!exists } };
  }

  async remove(userId: string, productId: string) {
    const userObjectId = this.validateObjectId(userId);
    const productObjectId = this.validateObjectId(productId);

    const item = await this.wishlistModel.findOneAndDelete({
      user: userObjectId,
      product: productObjectId,
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
    const userObjectId = this.validateObjectId(userId);
    const productObjectId = this.validateObjectId(dto.productId);

    // چیک کریں کہ پہلے سے موجود ہے؟
    const existing = await this.wishlistModel.findOne({
      user: userObjectId,
      product: productObjectId,
    });

    if (existing) {
      await existing.deleteOne();
      return {
        success: true,
        message: 'Product removed from wishlist.',
        data: { wishlisted: false },
      };
    }

    const product = await this.productModel.findById(productObjectId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const wishlistItem = new this.wishlistModel({
      user: userObjectId,
      product: productObjectId,
    });
    await wishlistItem.save();

    return {
      success: true,
      message: 'Product added to wishlist.',
      data: { wishlisted: true },
    };
  }

 async clear(userId: string) {
    const userObjectId = this.validateObjectId(userId);
    await this.wishlistModel.deleteMany({ user: userObjectId });

    return {
      success: true,
      message: 'Wishlist cleared.',
    };
  }
}