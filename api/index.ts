import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import express from 'express';
import serverlessExpress from '@codegenie/serverless-express';

const expressApp = express();

let server;

async function bootstrap() {
  if (!server) {
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );

    await app.init();

    server = serverlessExpress({ app: expressApp });
  }

  return server;
}

export default async function handler(req, res) {
  const server = await bootstrap();
  return server(req, res);
}