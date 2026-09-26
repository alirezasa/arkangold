// FAU_GEN_EXT.1.2: پیش از هر کد دیگر، منطقه‌ی زمانی فرآیند Node صریحاً UTC
// تنظیم می‌شود تا مهرهای زمانی رویدادها بدون ابهام و مستقل از ساعت هاست باشند.
process.env.TZ = 'UTC';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { join } from 'path';
import { PinoLoggerService } from './common/logging/pino-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuditService } from './common/audit/audit.service';
import { loadSecrets } from './common/secrets/load-secrets';

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
  const logger = new PinoLoggerService();
  // FCS_CKM_EXT.1.4: اسرار پیش از ساخت هر provider از Vault / فایل secret / env بارگذاری و اعتبارسنجی می‌شوند
  await loadSecrets(logger);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // FAU_GEN_EXT.1.3: لاگ‌های عمومی برنامه هم به فرمت JSON ساخت‌یافته تولید شوند
    logger,
  });

  // FAU_GEN_EXT.1.7 / FAU_GEN_EXT.1.8: ثبت متمرکز شکست اعتبارسنجی ورودی و
  // خطاهای پیش‌بینی‌نشده/شکست کنترل‌های امنیتی به‌عنوان رویداد امنیتی
  app.useGlobalFilters(new AllExceptionsFilter(app.get(AuditService)));

  // پشت یک reverse proxy/CDN (مثلاً Cloudflare یا Nginx) اجرا می‌شود — بدون این
  // تنظیم، req.ip همیشه IP همان پراکسی را برمی‌گرداند، نه IP واقعی کلاینت که
  // برای مسدودسازی هولوگرام (بند ۵.۲) لازم است.
  app.set('trust proxy', true);

  // فایل‌های تصویر محصولات
  app.useStaticAssets(join(process.cwd(), 'uploads', 'products'), {
    prefix: '/uploads/products',
  });
  // تصاویر طرح‌های بسته‌بندی
  app.useStaticAssets(join(process.cwd(), 'uploads', 'packaging'), {
    prefix: '/uploads/packaging',
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

  // چابکان پورت را از طریق PORT مشخص می‌کند؛ پیش‌فرض توسعه‌ی محلی ۵۰۰۰ باقی می‌ماند
  await app.listen(Number(process.env.PORT) || 5000);
}

void bootstrap();
