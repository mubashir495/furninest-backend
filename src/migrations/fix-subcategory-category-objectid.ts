/**
 * Migration: fix-subcategory-category-objectid
 * ──────────────────────────────────────────────
 * SubCategory documents have their `category` field stored as a plain string
 * instead of a BSON ObjectId. Fix and make idempotent.
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const conn = await mongoose.createConnection(uri).asPromise();
  const subcategories = conn.db!.collection('subcategories');

  const cursor = subcategories.find({ category: { $type: 'string' } });

  let fixed = 0, errors = 0;
  for await (const doc of cursor) {
    if (typeof doc.category === 'string' && mongoose.isValidObjectId(doc.category)) {
      try {
        await subcategories.updateOne(
          { _id: doc._id },
          { $set: { category: new (mongoose as any).Types.ObjectId(doc.category) } },
        );
        fixed++;
        console.log(`  ✓ "${doc.name}"`);
      } catch (e: any) {
        errors++;
        console.error(`  ✗ "${doc.name}": ${e.message}`);
      }
    }
  }

  console.log(`\n✅ Done: ${fixed} fixed, ${errors} errors`);
  await conn.close();
}

run().catch((e) => { console.error(e.message); process.exit(1); });
