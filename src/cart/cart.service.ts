import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from './schema/cart.schema';
import { CartItem, CartItemDocument } from './schema/cart-item.schema';
import { Product, ProductDocument } from '../product/schema/product.schema';
import { AddCartItemDto } from './dto/create-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,

    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,

    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private async getOrCreateCart(userId: string): Promise<CartDocument> {
    let cart = await this.cartModel.findOne({ user: userId });

    if (!cart) {
      cart = new this.cartModel({ user: new Types.ObjectId(userId) });
      await cart.save();
    }

    return cart;
  }

  private computeTotals(items: CartItemDocument[]) {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    return {
      totalItems,
      totalPrice: Math.round(totalPrice),
    };
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    const items = await this.cartItemModel
      .find({ cart: cart._id })
      .populate({
        path: 'product',
        select: 'name slug price discount thumbnailImage stock isActive',
      })
      .sort({ created_date: -1 });

    const totals = this.computeTotals(items);

    return {
      success: true,
      data: {
        cartId: cart._id,
        items,
        ...totals,
      },
    };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.productModel.findById(dto.productId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    if (!product.isActive) {
      throw new BadRequestException('This product is currently unavailable.');
    }

    const quantity = dto.quantity ?? 1;

    if (product.stock < quantity) {
      throw new BadRequestException(
        `Only ${product.stock} unit(s) available in stock.`,
      );
    }

    const cart = await this.getOrCreateCart(userId);

    const existingItem = await this.cartItemModel.findOne({
      cart: cart._id,
      product: dto.productId,
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (product.stock < newQuantity) {
        throw new BadRequestException(
          `Only ${product.stock} unit(s) available in stock.`,
        );
      }

      existingItem.quantity = newQuantity;
      existingItem.price = (product as any).finalPrice ?? product.price;
      await existingItem.save();

      return {
        success: true,
        message: 'Cart item quantity updated.',
        data: existingItem,
      };
    }

    const cartItem = new this.cartItemModel({
      cart: cart._id,
      product: new Types.ObjectId(dto.productId),
      quantity,
      price: (product as any).finalPrice ?? product.price,
    });
    await cartItem.save();

    return {
      success: true,
      message: 'Product added to cart.',
      data: cartItem,
    };
  }

  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = await this.getOrCreateCart(userId);

    const cartItem = await this.cartItemModel.findOne({
      cart: cart._id,
      product: productId,
    });

    if (!cartItem) {
      throw new NotFoundException('Item not found in your cart.');
    }

    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    if (product.stock < dto.quantity) {
      throw new BadRequestException(
        `Only ${product.stock} unit(s) available in stock.`,
      );
    }

    cartItem.quantity = dto.quantity;
    cartItem.price = (product as any).finalPrice ?? product.price;
    await cartItem.save();

    return {
      success: true,
      message: 'Cart item updated.',
      data: cartItem,
    };
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.getOrCreateCart(userId);

    const deleted = await this.cartItemModel.findOneAndDelete({
      cart: cart._id,
      product: productId,
    });

    if (!deleted) {
      throw new NotFoundException('Item not found in your cart.');
    }

    return {
      success: true,
      message: 'Item removed from cart.',
    };
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    await this.cartItemModel.deleteMany({ cart: cart._id });

    return {
      success: true,
      message: 'Cart cleared.',
    };
  }
}