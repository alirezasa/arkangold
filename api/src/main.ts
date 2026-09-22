import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { join } from 'path';

// دامنه‌های مجاز CORS — arkan.gold (سایت اصلی) و app.arkan.gold/admin هر دو باید
// بتوانند مستقیماً از مرورگر به API عمومی هولوگرام (POST /public/hologram/verify)
// و سایر endpointها دسترسی داشته باشند (بند ۴.۱). دامنه‌های اضافه را می‌توان بدون
// تغییر کد از طریق CORS_EXTRA_ORIGINS (جدا شده با کاما) اضافه کرد.
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://arkan.gold',
  'https://www.arkan.gold',
  'https://app.arkan.gold',
  'https://admin.arkan.gold',
];

function resolveCorsOrigins(): string[] {
  const extra = (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_CORS_ORIGINS, ...extra];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // پشت یک reverse proxy/CDN (مثلاً Cloudflare یا Nginx) اجرا می‌شود — بدون این
  // تنظیم، req.ip همیشه IP همان پراکسی را برمی‌گرداند، نه IP واقعی کلاینت که
  // برای مسدودسازی هولوگرام (بند ۵.۲) لازم است.
  app.set('trust proxy', true);

  // فایل‌های تصویر محصولات
  app.useStaticAssets(join(process.cwd(), 'uploads', 'products'), {
    prefix: '/uploads/products',
  });

  // تنظیمات CORS
  app.enableCors({
    origin: resolveCorsOrigins(),
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
