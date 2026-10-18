import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type CartItemDocument = CartItem & Document;

@Schema({ timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } })
export class CartItem {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Cart', required: true, index: true })
  cart: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true })
  product: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  price: number;

  // ─── Variant fields (optional — null for legacy/non-variant products) ───

  /** The variant's _id as a string. Null means the top-level product was added (no variant). */
  @Prop({ type: String, default: null, index: true })
  variantId: string | null;

  /** Human-readable snapshot: 'configName / colorName' */
  @Prop({ type: String, default: null })
  variantName: string | null;

  /** Snapshot of the selected configuration name e.g. '3-Seater' */
  @Prop({ type: String, default: null })
  selectedConfig: string | null;

  /** Snapshot of the selected colour name e.g. 'Grey' */
  @Prop({ type: String, default: null })
  selectedColor: string | null;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

/**
 * Unique constraint: one row per (cart, product, variantId) triplet.
 * This allows different variants of the same parent product to coexist as
 * separate cart lines (e.g. 3-Seater Grey + 5-Seater Beige in the same cart).
 *
 * NOTE: If you have an existing `{ cart: 1, product: 1 }` unique index in MongoDB,
 * run this in the MongoDB shell to remove it before deploying:
 *   db.cartitems.dropIndex({ cart: 1, product: 1 })
 */
CartItemSchema.index({ cart: 1, product: 1, variantId: 1 }, { unique: true });

CartItemSchema.virtual('subtotal').get(function (this: CartItem) {
  return Math.round(this.price * this.quantity);
});

CartItemSchema.set('toJSON', { virtuals: true });
CartItemSchema.set('toObject', { virtuals: true });