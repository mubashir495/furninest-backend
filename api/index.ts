import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from '../src/app.module';

let cachedServer: any;

async function bootstrapServerless() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL, // exact URL, wildcard nahi
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.setGlobalPrefix('api');

  await app.init();
  return app.getHttpAdapter().getInstance();
}

module.exports = async (req: any, res: any) => {
  try {
    if (!cachedServer) {
      cachedServer = await bootstrapServerless();
    }
    return cachedServer(req, res);
  } catch (error: any) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};