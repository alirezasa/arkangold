import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ─── فایل‌های تصویر محصولات — عمومی و بدون نیاز به توکن ───
  app.useStaticAssets(join(process.cwd(), 'uploads', 'products'), {
    prefix: '/uploads/products',
  });

  // ─── تنظیمات CORS برای ارتباط با Next.js ───
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  // ──────────────────────────────────────────

  // ── اضافه کردن Swagger ──
  const config = new DocumentBuilder()
    .setTitle('آرکان گلد')
    .setDescription('مستندات API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(5000);
}
void bootstrap();
