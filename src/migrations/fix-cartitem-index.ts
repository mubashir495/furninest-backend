/**
 * Migration: fix-cartitem-index
 * ──────────────────────────────
 * Drop the old unique index { cart:1, product:1 } from the cartitems collection
 * if it exists. The schema now uses { cart:1, product:1, variantId:1 } which
 * allows multiple variants of the same product in one cart.
 * The old index causes a duplicate-key 500 error when adding any product.
 * Safe to run multiple times.
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const conn = await mongoose.createConnection(uri).asPromise();
  const cartItems = conn.db!.collection('cartitems');

  const indexes = await cartItems.indexes();
  console.log('Current indexes on cartitems:');
  indexes.forEach((idx) => console.log(' ', idx.name, JSON.stringify(idx.key)));

  // Drop any index whose key is EXACTLY { cart:1, product:1 } (no variantId key)
  for (const idx of indexes) {
    const keys = Object.keys(idx.key);
    if (
      keys.length === 2 &&
      idx.key.cart === 1 &&
      idx.key.product === 1 &&
      idx.key.variantId === undefined
    ) {
      await cartItems.dropIndex(idx.name!);
      console.log(`✅ Dropped old index: ${idx.name}`);
    }
  }

  // List remaining indexes
  const remaining = await cartItems.indexes();
  console.log('\nRemaining indexes:');
  remaining.forEach((idx) => console.log(' ', idx.name, JSON.stringify(idx.key)));

  await conn.close();
  console.log('\nDone.');
}

run().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
