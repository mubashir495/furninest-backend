import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

// ✅ Cache server instance for Vercel serverless
let cachedServer: any;

async function bootstrap() {
  console.log('🚀 Starting NestJS application...');
  
  const app = await NestFactory.create(AppModule);

  // ✅ CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // ✅ Body parsers
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // ✅ Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ✅ API prefix
  app.setGlobalPrefix('api');

  console.log('✅ NestJS application configured');

  // ✅ For local development
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`📡 API available at http://localhost:${port}/api`);
    return app;
  }

  // ✅ For Vercel serverless
  await app.init();
  console.log('✅ NestJS app initialized for Vercel');
  return app.getHttpAdapter().getInstance();
}

// ✅ For Vercel serverless - export the handler
module.exports = async (req: any, res: any) => {
  console.log('📥 Vercel request received:', req.method, req.url);
  
  try {
    if (!cachedServer) {
      console.log('🔄 Initializing server for first request...');
      cachedServer = await bootstrap();
    }
    return cachedServer(req, res);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// ✅ For local development
if (process.env.NODE_ENV !== 'production') {
  bootstrap().catch(error => {
    console.error('❌ Failed to start server:', error);
  });
}