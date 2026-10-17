import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { assertEnv, configureApp } from '../src/common/configure-app';

let cachedServer: any;

async function bootstrapServerless() {
  assertEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  (app.getHttpAdapter().getInstance() as any).set?.('trust proxy', 1);
  await app.init();
  return app.getHttpAdapter().getInstance();
}

module.exports = async (req: any, res: any) => {
  try {
    if (!cachedServer) cachedServer = await bootstrapServerless();
    return cachedServer(req, res);
  } catch (error: unknown) {
    // Log details server-side only; never return messages/stack to clients
    console.error(
      'Server error:',
      error instanceof Error ? error.message : error,
    );
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
