import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';

import {  SubCategoryModule } from './subcategory/subcategory.module';
import { ProductModule } from './product/product.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UploadService } from './upload/upload.service';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');
        console.log('🔗 Connecting to MongoDB...');
        return {
          uri,
          connectionFactory: (connection) => {
            if (connection.readyState === 1) {
              console.log('✅ MongoDB already connected');
            }
            connection.on('connected', () => {
              console.log('✅ MongoDB connected successfully');
            });
            connection.on('error', (err) => {
              console.error('❌ MongoDB connection error:', err.message);
            });
            connection.on('disconnected', () => {
              console.log('⚠️ MongoDB disconnected');
            });
            return connection;
          },
        };
      },
    }),
    // Global rate limit default: 20 requests/min per IP.
    // Stricter per-route limits (signup/login/resend-verification) are
    // already set via @Throttle() in auth.controller.ts and override this.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
    AuthModule,
    CategoryModule,
    SubCategoryModule,
    ProductModule,
    SupabaseModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    UploadService,
  ],
})
export class AppModule {}