import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema } from 'mongoose';

import { Order, OrderDocument, OrderStatus } from './schema/order.schema';
import { OrderItem, OrderItemDocument } from './schema/order-item.schema';
import {
  ShippingAddress,
  ShippingAddressDocument,
} from '../shipping-address/schema/shipping-address.schema';
import { Cart, CartDocument } from '../cart/schema/cart.schema';
import { CartItem, CartItemDocument } from '../cart/schema/cart-item.schema';
import { Product, ProductDocument, ProductVariant } from '../product/schema/product.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';


// Runtime helper � avoids TS namespace import issues with mongoose v9
const isValidObjectIdHelper = (id: any): boolean => /^[0-9a-fA-F]{24}$/.test(String(id));

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItemDocument>,

    @InjectModel(ShippingAddress.name)
    private readonly shippingAddressModel: Model<ShippingAddressDocument>,

    @InjectModel(Cart.name)
    private readonly cartModel: Model<CartDocument>,

    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,

    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private toObjectId(id: string): any {
    if (!isValidObjectIdHelper(id)) {
      throw new BadRequestException('Invalid ID format');
    }
    return new Schema.Types.ObjectId(id);
  }

  private async generateOrderNumber(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    let orderNumber = '';
    let isUnique = false;

    while (!isUnique) {
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      orderNumber = `ORD-${datePart}-${randomPart}`;
      const existing = await this.orderModel.findOne({ orderNumber });
      if (!existing) isUnique = true;
    }

    return orderNumber;
  }

  private async resolveShippingAddress(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<any> {
    if (dto.shippingAddressId) {
      const existingAddress = await this.shippingAddressModel.findById(
        dto.shippingAddressId,
      );

      if (!existingAddress) {
        throw new NotFoundException('Shipping address not found.');
      }

      if (existingAddress.user.toString() !== userId) {
        throw new ForbiddenException('You cannot use this address.');
      }

      return existingAddress._id as any;
    }

    if (dto.shippingAddress) {
      const existingCount = await this.shippingAddressModel.countDocuments({
        user: this.toObjectId(userId),
      });

      const newAddress = new this.shippingAddressModel({
        ...dto.shippingAddress,
        user: this.toObjectId(userId),
        isDefault: existingCount === 0,
      });
      await newAddress.save();

      return newAddress._id as any;
    }

    throw new BadRequestException(
      'Provide either shippingAddressId or shippingAddress.',
    );
  }

  // ─── Helper: find a variant in a product by its _id string ────────────────
  private findVariant(
    product: ProductDocument,
    variantId: string,
  ): ProductVariant | null {
    return (
      (product.variants as ProductVariant[]).find(
        (v) => (v as any)._id?.toString() === variantId,
      ) ?? null
    );
  }

  // ─── Helper: decrement stock — variant if variantId present, else product ──
  private async decrementStock(
    product: ProductDocument,
    variantId: string | null,
    quantity: number,
  ): Promise<void> {
    if (variantId) {
      await this.productModel.updateOne(
        { _id: product._id, 'variants._id': this.toObjectId(variantId) },
        { $inc: { 'variants.$.stock': -quantity } },
      );
    } else {
      await this.productModel.updateOne(
        { _id: product._id },
        { $inc: { stock: -quantity } },
      );
    }
  }

  // ─── Helper: restore stock on cancellation ─────────────────────────────────
  private async restoreStock(
    productId: any | string,
    variantId: string | null,
    quantity: number,
  ): Promise<void> {
    if (variantId && isValidObjectIdHelper(variantId)) {
      await this.productModel.updateOne(
        { _id: productId, 'variants._id': this.toObjectId(variantId) },
        { $inc: { 'variants.$.stock': quantity } },
      );
    } else {
      await this.productModel.updateOne(
        { _id: productId },
        { $inc: { stock: quantity } },
      );
    }
  }

  // ✅ createFromCart — builds an order from the user's active cart
  async createFromCart(userId: string, dto: CreateOrderDto) {
    const userObjectId = this.toObjectId(userId);

    // Find the user's cart
    const cart = await this.cartModel.findOne({ user: userObjectId });
    if (!cart) {
      throw new BadRequestException('Your cart is empty.');
    }

    const cartItems = await this.cartItemModel
      .find({ cart: cart._id })
      .populate<{ product: ProductDocument }>('product');

    if (!cartItems.length) {
      throw new BadRequestException('Your cart is empty.');
    }

    // ─── Validate stock for every item before committing anything ─────────
    for (const item of cartItems) {
      const product = item.product as unknown as ProductDocument;

      if (!product || !product.isActive) {
        throw new BadRequestException(
          `"${product?.name ?? 'A product'}" is no longer available.`,
        );
      }

      if (item.variantId) {
        // Variant-based stock check
        const variant = this.findVariant(product, item.variantId);
        if (!variant) {
          throw new BadRequestException(
            `A selected variant of "${product.name}" is no longer available.`,
          );
        }
        if (!variant.isActive) {
          throw new BadRequestException(
            `A selected variant of "${product.name}" is currently unavailable.`,
          );
        }
        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Only ${variant.stock} unit(s) of "${product.name} — ${item.variantName ?? item.variantId}" available.`,
          );
        }
      } else {
        // Legacy product-level stock check
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Only ${product.stock} unit(s) of "${product.name}" available in stock.`,
          );
        }
      }
    }

    const shippingAddressId = await this.resolveShippingAddress(userId, dto);
    const orderNumber = await this.generateOrderNumber();

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = new this.orderModel({
      user: userObjectId,
      orderNumber,
      shippingAddress: shippingAddressId,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
      totalItems,
      totalAmount: Math.round(totalAmount),
      status: OrderStatus.PENDING,
    });
    await order.save();

    // ─── Create order items with full variant snapshot ────────────────────
    const orderItemsData = cartItems.map((item) => {
      const product = item.product as unknown as ProductDocument;

      // Resolve thumbnail: prefer variant image, fall back to product thumbnail
      let thumbnail = product.thumbnailImage;
      if (item.variantId) {
        const variant = this.findVariant(product, item.variantId);
        if (variant?.images?.length) {
          thumbnail = variant.images[0];
        }
      }

      return {
        order: order._id,
        product: product._id,
        productName: product.name,
        productThumbnail: thumbnail,
        price: item.price,
        quantity: item.quantity,
        // Variant snapshot — null for legacy items
        variantId: item.variantId ?? null,
        variantSku: item.variantId
          ? (this.findVariant(product, item.variantId)?.sku ?? null)
          : null,
        variantName: item.variantName ?? null,
        selectedConfig: item.selectedConfig ?? null,
        selectedColor: item.selectedColor ?? null,
      };
    });

    await this.orderItemModel.insertMany(orderItemsData);

    // ─── Decrement stock (variant-aware) ──────────────────────────────────
    for (const item of cartItems) {
      const product = item.product as unknown as ProductDocument;
      await this.decrementStock(product, item.variantId ?? null, item.quantity);
    }

    // Clear the cart after successful checkout
    await this.cartItemModel.deleteMany({ cart: cart._id });

    return {
      success: true,
      message: 'Order placed successfully.',
      data: order,
    };
  }

  async findMyOrders(userId: string) {
    const userObjectId = this.toObjectId(userId);
    const orders = await this.orderModel
      .find({ user: userObjectId })
      .populate('shippingAddress')
      .sort({ created_date: -1 });

    return { success: true, data: orders };
  }

  // findOne — owner check uses toString() comparison
  async findOne(userId: string, orderId: string, isAdmin = false) {
    const order = await this.orderModel
      .findById(orderId)
      .populate('shippingAddress');

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (!isAdmin && order.user.toString() !== userId) {
      throw new ForbiddenException('You cannot access this order.');
    }

    const items = await this.orderItemModel.find({ order: order._id });

    return {
      success: true,
      data: { ...order.toJSON(), items },
    };
  }

  // cancelOrder — only PENDING or PROCESSING orders can be cancelled
  async cancelOrder(userId: string, orderId: string) {
    const order = await this.orderModel.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.user.toString() !== userId) {
      throw new ForbiddenException('You cannot cancel this order.');
    }

    if (![OrderStatus.PENDING, OrderStatus.PROCESSING].includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled once it is ${order.status.toLowerCase()}.`,
      );
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    await order.save();

    // Restore stock (variant-aware)
    const items = await this.orderItemModel.find({ order: order._id });
    for (const item of items) {
      await this.restoreStock(
        item.product as any,
        item.variantId ?? null,
        item.quantity,
      );
    }

    return {
      success: true,
      message: 'Order cancelled successfully.',
      data: order,
    };
  }

  // ---------- Admin ----------

  async findAll(status?: OrderStatus) {
    const filter = status ? { status } : {};

    const orders = await this.orderModel
      .find(filter)
      .populate('user', 'fullName email')
      .populate('shippingAddress')
      .sort({ created_date: -1 });

    return { success: true, data: orders };
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.orderModel.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled order.');
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException('Order is already delivered.');
    }

    order.status = dto.status;

    if (dto.status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    }

    if (dto.status === OrderStatus.CANCELLED) {
      order.cancelledAt = new Date();

      // Restore stock on admin-side cancellation (variant-aware)
      const items = await this.orderItemModel.find({ order: order._id });
      for (const item of items) {
        await this.restoreStock(
          item.product as any,
          item.variantId ?? null,
          item.quantity,
        );
      }
    }

    await order.save();

    return {
      success: true,
      message: 'Order status updated.',
      data: order,
    };
  }
}