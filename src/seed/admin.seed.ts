import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { User, UserDocument, UserRole } from '../auth/schema/user.schema';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@furninest.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const adminName = process.env.ADMIN_NAME || 'FurniNest Admin';

  const existing = await userModel.findOne({ email: adminEmail.toLowerCase() });

  if (existing) {
    if (existing.role !== UserRole.ADMIN) {
      existing.role = UserRole.ADMIN;
      await existing.save();
      console.log(`✅ Existing user "${adminEmail}" promoted to ADMIN.`);
    } else {
      console.log(`ℹ️  Admin "${adminEmail}" already exists. Nothing to do.`);
    }
    await app.close();
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const admin = await userModel.create({
    fullName: adminName,
    email: adminEmail.toLowerCase(),
    password: hashedPassword,
    role: UserRole.ADMIN,
    isActive: true,
    isEmailVerified: true, // skip verification for the seeded admin
  });

  console.log('✅ Admin user created successfully:');
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`   Role:     ${admin.role}`);
  console.log('⚠️  Please log in and change this password immediately.');

  await app.close();
}

seedAdmin().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});