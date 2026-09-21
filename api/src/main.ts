import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // فایل‌های تصویر محصولات
  app.useStaticAssets(join(process.cwd(), 'uploads', 'products'), {
    prefix: '/uploads/products',
  });

  // تنظیمات CORS
  // در محیط هاست، دامنه‌های واقعی را از طریق env var «CORS_ORIGINS» (جدا شده با کاما) ست کنید.
  const defaultCorsOrigins =
    process.env.NODE_ENV === 'production'
      ? ['https://arkan.gold', 'https://admin.arkan.gold']
      : ['http://localhost:3000', 'http://localhost:3001'];

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? defaultCorsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'idempotency-key',
    ],
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('آرکان گلد')
    .setDescription('مستندات API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  // اعتبارسنجی و تبدیل DTOها
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(5000);
}

void bootstrap();
