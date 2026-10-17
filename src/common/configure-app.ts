import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';

const REQUIRED_ENV = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_BUCKET',
];

export function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    // Names only - never print values
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}

export function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const local =
    process.env.NODE_ENV === 'production'
      ? []
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:5173',
        ];

  return [...new Set([...fromEnv, ...local])];
}

/** Shared by src/main.ts and api/index.ts so both entry points stay identical. */
export function configureApp(app: INestApplication) {
  const allowedOrigins = getAllowedOrigins();

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser clients (no Origin header) are allowed; browsers must match
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
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
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');
  return allowedOrigins;
}
