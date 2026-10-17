/**
 * Idempotent migration: legacy products -> variant model.
 *
 *   DRY RUN (default):  npx ts-node src/migrations/migrate-variants.ts
 *   APPLY:              npx ts-node src/migrations/migrate-variants.ts --apply
 *
 * BACK UP THE DATABASE FIRST (mongodump). Run against a copy/staging first.
 *
 * What it does
 *  1. Products with no variants -> NOTHING is changed. They keep working through
 *     the legacy price/stock fields (backwards compatible).
 *  2. Optional --convert: creates one variant per legacy colour (or a single
 *     "Standard" variant) using the product's real price/stock/images. Missing
 *     values are NOT invented; products that cannot be mapped safely are listed
 *     for manual review.
 *  3. Replaces the old unique {cart, product} index on cartitems with
 *     {cart, product, variantId}.
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { AppModule } from '../app.module';
import { Product, ProductDocument } from '../product/schema/product.schema';
import { CartItem, CartItemDocument } from '../cart/schema/cart-item.schema';

async function run() {
  const apply = process.argv.includes('--apply');
  const convert = process.argv.includes('--convert');
  const app = await NestFactory.createApplicationContext(AppModule);
  const productModel = app.get<Model<ProductDocument>>(
    getModelToken(Product.name),
  );
  const cartItemModel = app.get<Model<CartItemDocument>>(
    getModelToken(CartItem.name),
  );

  console.log(apply ? 'MODE: APPLY' : 'MODE: DRY RUN (no writes)');

  // --- 3. cart index ---
  const idx = await cartItemModel.collection.indexes();
  const old = idx.find(
    (i: any) =>
      i.unique &&
      JSON.stringify(i.key) === JSON.stringify({ cart: 1, product: 1 }),
  );
  if (old) {
    console.log(`Old cart index found: ${old.name}`);
    if (apply) await cartItemModel.collection.dropIndex(old.name as string);
  }
  if (apply) await cartItemModel.syncIndexes();

  // --- 1/2. products ---
  const products = await productModel.find({
    'variants.0': { $exists: false },
  });
  const review: string[] = [];
  let converted = 0;

  for (const p of products) {
    if (!convert) continue;
    if (!p.price || p.price <= 0) {
      review.push(`${p._id} "${p.name}": no usable price`);
      continue;
    }
    const colours = p.color?.length ? p.color : [''];
    const baseSku = p.slug
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .slice(0, 40);
    const variants = colours.map((c, i) => ({
      _id: new (mongoose as any).Types.ObjectId(),
      sku: `${baseSku}-${(c || 'STD')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 10)}-${i + 1}`,
      configuration: 'Standard',
      colorName: c,
      colorCode: '',
      price: p.price,
      salePrice: p.discount
        ? Math.round(p.price - (p.price * p.discount) / 100)
        : null,
      stock: colours.length === 1 ? p.stock : 0, // never invent per-colour stock
      images: [p.thumbnailImage, ...(p.images ?? [])].filter(Boolean),
      isActive: true,
      sortOrder: i,
    }));
    if (colours.length > 1) {
      review.push(
        `${p._id} "${p.name}": ${colours.length} colours, stock set to 0 per colour - set real stock in admin`,
      );
    }
    console.log(
      `${apply ? 'Converting' : 'Would convert'}: ${p.name} -> ${variants.length} variant(s)`,
    );
    if (apply) {
      await productModel.updateOne(
        { _id: p._id, 'variants.0': { $exists: false } },
        { $set: { variants } },
      );
    }
    converted++;
  }

  console.log(`Legacy products without variants: ${products.length}`);
  if (convert) console.log(`Converted: ${converted}`);
  if (review.length) {
    console.log('\nNeeds MANUAL REVIEW:');
    review.forEach((r) => console.log(' - ' + r));
  }
  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
