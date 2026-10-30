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

  const defaults = [
    // Production & Staging domains
    'https://luxafurniture.co.uk',
    'https://www.luxafurniture.co.uk',
    'https://luxafurniture.vercel.app',
    'https://furninest.vercel.app',
    'https://furninest-pi.vercel.app',
    // Local development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  return [...new Set([...fromEnv, ...defaults])];
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    // Non-browser clients (cURL, Postman, server-to-server, SSR) have no Origin header
    return true;
  }

  const cleanOrigin = origin.trim().replace(/\/$/, '');
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(cleanOrigin)) {
    return true;
  }

  // Allow all Vercel deployments (*.vercel.app), including preview URLs,
  // branch deployments (e.g. furninest-*-mubashiryaseen780-gmailcoms-projects.vercel.app)
  try {
    const url = new URL(cleanOrigin);
    if (url.hostname.endsWith('.vercel.app')) {
      return true;
    }
  } catch {
    // Invalid URL format
  }

  return false;
}

/** Shared by src/main.ts and api/index.ts so both entry points stay identical. */
export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.enableCors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Requested-With',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');
  return getAllowedOrigins();
}
