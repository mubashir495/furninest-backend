import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let cachedServer: any;

async function bootstrapServerless() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.setGlobalPrefix('api');

  await app.init();
  return app.getHttpAdapter().getInstance();
}

module.exports = async (req: any, res: any) => {
  if (!cachedServer) {
    cachedServer = await bootstrapServerless();
  }
  return cachedServer(req, res);
};