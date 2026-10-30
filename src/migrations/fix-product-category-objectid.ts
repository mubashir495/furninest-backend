/**
 * Migration: fix-product-category-objectid
 * ─────────────────────────────────────────
 * Products were saved with `category`/`subCategory` stored as plain strings
 * instead of ObjectIds. This causes { category: ObjectId("...") } queries to
 * return 0 results because MongoDB does strict type equality.
 * Safe to run multiple times (idempotent).
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in .env');

  const conn = await mongoose.createConnection(uri).asPromise();
  console.log('✅ Connected to MongoDB');

  const products = conn.db!.collection('products');

  const cursor = products.find({
    $or: [
      { category: { $type: 'string' } },
      { subCategory: { $type: 'string' } },
    ],
  });

  let fixed = 0;
  let errors = 0;

  for await (const doc of cursor) {
    const update: Record<string, any> = {};

    if (typeof doc.category === 'string' && mongoose.isValidObjectId(doc.category)) {
      update.category = new (mongoose as any).Types.ObjectId(doc.category);
    }
    if (typeof doc.subCategory === 'string' && mongoose.isValidObjectId(doc.subCategory)) {
      update.subCategory = new (mongoose as any).Types.ObjectId(doc.subCategory);
    }

    if (Object.keys(update).length === 0) continue;

    try {
      await products.updateOne({ _id: doc._id }, { $set: update });
      fixed++;
      console.log(`  ✓ "${doc.name}" — ${Object.keys(update).join(', ')}`);
    } catch (e: any) {
      errors++;
      console.error(`  ✗ "${doc.name}": ${e.message}`);
    }
  }

  console.log(`\n✅ Done: ${fixed} fixed, ${errors} errors`);
  await conn.close();
}

run().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
