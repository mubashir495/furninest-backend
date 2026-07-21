import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let cachedServer: any;

async function bootstrapServerless() {
  const app = await NestFactory.create(AppModule);

  // ✅ CORS with multiple allowed origins
  const allowedOrigins = [
    process.env.FRONTEND_URL,           
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173',            
    'http://localhost:5174',
    'https://furninest-pi.vercel.app', 
  ].filter(Boolean); 
  app.enableCors({
    origin: (
      origin: string | undefined, 
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.useGlobalPipes(
    new ValidationPipe({ 
      whitelist: true, 
      transform: true, 
      forbidNonWhitelisted: true 
    })
  );

  app.setGlobalPrefix('api');

  await app.init();
  console.log('✅ NestJS app initialized for Vercel');
  console.log(`✅ CORS allowed origins:`, allowedOrigins);
  return app.getHttpAdapter().getInstance();
}

module.exports = async (req: any, res: any) => {
  console.log(`📥 ${req.method} ${req.url}`);
  
  try {
    if (!cachedServer) {
      console.log('🔄 Initializing server for first request...');
      cachedServer = await bootstrapServerless();
    }
    return cachedServer(req, res);
  } catch (error: unknown) {
    console.error('❌ Server error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
    });
  }
};