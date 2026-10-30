import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertEnv, configureApp } from './common/configure-app';

async function bootstrap() {
  assertEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 LUXA FURNITURE API running on http://localhost:${port}`);
  console.log(`📡 API available at http://localhost:${port}/api`);
  console.log(`🔍 Health check: http://localhost:${port}/api/auth/health`);
}

bootstrap();
