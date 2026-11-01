/**
 * Seed script — creates the first admin user if one doesn't exist.
 *
 * Usage:
 *   npx ts-node --transpile-only src/seed/seed-admin.ts
 *
 * Requires a .env file at the project root with MONGODB_URI set.
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in .env');

  const conn = await mongoose.createConnection(uri).asPromise();
  console.log('✅ Connected');

  const users = conn.db!.collection('users');

  const email = (process.env.ADMIN_EMAIL ?? 'admin@luxafurniture.co.uk').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
  const fullName = process.env.ADMIN_NAME ?? 'LUXA FURNITURE Admin';

  const existing = await users.findOne({ email });
  if (existing) {
    console.log(`ℹ️  Admin already exists: ${email}`);
    await conn.close();
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await users.insertOne({
    fullName,
    email,
    password: hashed,
    role: 'ADMIN',
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`✅ Admin user created: ${email}  password: ${password}`);
  await conn.close();
}

seed().catch((e) => { console.error(e.message); process.exit(1); });
