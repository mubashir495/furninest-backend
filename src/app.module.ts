import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

  MongooseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const uri = configService.get<string>('MONGODB_URI');

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

  AuthModule,
],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}