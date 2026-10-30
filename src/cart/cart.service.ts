import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Model } from 'mongoose';


import { Cart, CartDocument } from './schema/cart.schema';
import { CartItem, CartItemDocument } from './schema/cart-item.schema';
import { Product, ProductDocument, ProductVariant } from '../product/schema/product.schema';
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private toObjectId(id: string): any {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestException('Invalid ID format');
    }
    // Use (mongoose as any) to avoid the namespace typing issue with esModuleInterop
    return new (mongoose as any).Types.ObjectId(id);
  }

  private async getOrCreateCart(userId: string): Promise<CartDocument> {
    const userObjectId = this.toObjectId(userId);

    let cart = await this.cartModel.findOne({ user: userObjectId });

    if (!cart) {
      cart = new this.cartModel({ user: userObjectId });
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

  /** Resolve a variant from a product by its _id string. Throws if not found or inactive. */
  private resolveVariant(
    product: ProductDocument,
    variantId: string,
  ): ProductVariant {
    const variant = (product.variants as ProductVariant[]).find(
      (v) => (v as any)._id?.toString() === variantId,
    );
    if (!variant) {
      throw new NotFoundException('Variant not found for this product.');
    }
    if (!variant.isActive) {
      throw new BadRequestException('This variant is currently unavailable.');
    }
    return variant;
  }

  /** Get the effective unit price for a variant (salePrice if set and lower). */
  private getVariantPrice(variant: ProductVariant): number {
    if (
      variant.salePrice !== null &&
      variant.salePrice !== undefined &&
      variant.salePrice < variant.price
    ) {
      return variant.salePrice;
    }
    return variant.price;
  }

  // ─── Public Methods ────────────────────────────────────────────────────────

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    const items = await this.cartItemModel
      .find({ cart: cart._id })
      .populate({
        path: 'product',
        select: 'name slug price discount thumbnailImage stock isActive variants',
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
    const productObjectId = this.toObjectId(dto.productId);
    const product = await this.productModel.findById(productObjectId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    if (!product.isActive) {
      throw new BadRequestException('This product is currently unavailable.');
    }

    const quantity = dto.quantity ?? 1;
    const cart = await this.getOrCreateCart(userId);

    // ─── Variant path ──────────────────────────────────────────────────────
    if (dto.variantId) {
      const variant = this.resolveVariant(product, dto.variantId);

      if (variant.stock < quantity) {
        throw new BadRequestException(
          `Only ${variant.stock} unit(s) of this variant are available.`,
        );
      }

      const variantName = [variant.configName, variant.colorName]
        .filter(Boolean)
        .join(' / ');

      // Check for existing cart item with the same product + variant
      const existingItem = await this.cartItemModel.findOne({
        cart: cart._id,
        product: productObjectId,
        variantId: dto.variantId,
      });

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;

        if (variant.stock < newQuantity) {
          throw new BadRequestException(
            `Only ${variant.stock} unit(s) of this variant are available.`,
          );
        }

        existingItem.quantity = newQuantity;
        existingItem.price = this.getVariantPrice(variant);
        await existingItem.save();

        return {
          success: true,
          message: 'Cart item quantity updated.',
          data: existingItem,
        };
      }

      const cartItem = new this.cartItemModel({
        cart: cart._id,
        product: productObjectId,
        quantity,
        price: this.getVariantPrice(variant),
        variantId: dto.variantId,
        variantName,
        selectedConfig: variant.configName,
        selectedColor: variant.colorName || null,
      });
      await cartItem.save();

      return {
        success: true,
        message: 'Product added to cart.',
        data: cartItem,
      };
    }

    // ─── Legacy path (no variant) ──────────────────────────────────────────
    if (product.stock < quantity) {
      throw new BadRequestException(
        `Only ${product.stock} unit(s) available in stock.`,
      );
    }

    // موجودہ آئٹم چیک کریں (existing item check)
    const existingItem = await this.cartItemModel.findOne({
      cart: cart._id,
      product: productObjectId,
      variantId: null,
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
      product: productObjectId,
      quantity,
      price: (product as any).finalPrice ?? product.price,
      variantId: null,
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
    const productObjectId = this.toObjectId(productId);

    // Use variantId from DTO (undefined → null for the query)
    const variantId = dto.variantId ?? null;

    const cartItem = await this.cartItemModel.findOne({
      cart: cart._id,
      product: productObjectId,
      variantId,
    });

    if (!cartItem) {
      throw new NotFoundException('Item not found in your cart.');
    }

    const product = await this.productModel.findById(productObjectId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    if (variantId) {
      const variant = this.resolveVariant(product, variantId);
      if (variant.stock < dto.quantity) {
        throw new BadRequestException(
          `Only ${variant.stock} unit(s) of this variant are available.`,
        );
      }
      cartItem.quantity = dto.quantity;
      cartItem.price = this.getVariantPrice(variant);
    } else {
      if (product.stock < dto.quantity) {
        throw new BadRequestException(
          `Only ${product.stock} unit(s) available in stock.`,
        );
      }
      cartItem.quantity = dto.quantity;
      cartItem.price = (product as any).finalPrice ?? product.price;
    }

    await cartItem.save();

    return {
      success: true,
      message: 'Cart item updated.',
      data: cartItem,
    };
  }

  async removeItem(userId: string, productId: string, variantId?: string) {
    const cart = await this.getOrCreateCart(userId);
    const productObjectId = this.toObjectId(productId);

    const query: Record<string, any> = {
      cart: cart._id,
      product: productObjectId,
    };

    // Match on variantId when provided; otherwise remove the legacy (non-variant) item
    if (variantId !== undefined) {
      query.variantId = variantId;
    } else {
      query.variantId = null;
    }

    const deleted = await this.cartItemModel.findOneAndDelete(query);

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