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
import {
  clientIpMiddleware,
  parseProxyRanges,
  resolveTrustProxy,
} from './common/network/client-ip';
import { isOtpDebugLogEnabledInProduction } from './common/logging/otp-debug';
import { securityHeadersMiddleware } from './common/network/security-headers';
import { sensitiveQueryMiddleware } from './common/network/sensitive-query';

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
  // پنل نمایندگان فروش (همان برنامه‌ی admin روی دامنه‌ی جدا)
  'https://panel.arkan.gold',
];

function resolveCorsOrigins(): string[] {
  const extra = (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_CORS_ORIGINS, ...extra];
}

/**
 * FPT_FLS_EXT.1.4 — دریافت متمرکز استثناهای مدیریت‌نشده در سطح فرآیند: هیچ Promise رد‌شده یا
 * استثنای بیرون از چرخه‌ی درخواست (کران‌جاب، رویدادها) بدون ثبت در لاگ نمی‌ماند و یک خطای منفرد
 * کل سرویس را از دسترس خارج نمی‌کند. خطای ناشی از وضعیت نامعتبر حافظه/راه‌اندازی (پیش از آماده
 * شدن برنامه) همچنان فرآیند را به‌صورت کنترل‌شده متوقف می‌کند تا ارکستراتور آن را بازآغاز کند.
 */
function installProcessErrorHandlers(logger: PinoLoggerService) {
  let ready = false;
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`Promise رد‌شده‌ی مدیریت‌نشده: ${err.message}`, err.stack, 'Process');
  });
  process.on('uncaughtException', (err) => {
    logger.error(`استثنای مدیریت‌نشده: ${err.message}`, err.stack, 'Process');
    if (!ready) process.exit(1);
  });
  return () => {
    ready = true;
  };
}

async function bootstrap() {
  const logger = new PinoLoggerService();
  const markReady = installProcessErrorHandlers(logger);
  // FCS_CKM_EXT.1.4: اسرار پیش از ساخت هر provider از Vault / فایل secret / env بارگذاری و اعتبارسنجی می‌شوند
  await loadSecrets(logger);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // FAU_GEN_EXT.1.3: لاگ‌های عمومی برنامه هم به فرمت JSON ساخت‌یافته تولید شوند
    logger,
  });

  // FAU_GEN_EXT.1.7 / FAU_GEN_EXT.1.8: ثبت متمرکز شکست اعتبارسنجی ورودی و
  // خطاهای پیش‌بینی‌نشده/شکست کنترل‌های امنیتی به‌عنوان رویداد امنیتی
  app.useGlobalFilters(new AllExceptionsFilter(app.get(AuditService)));

  // پشت reverse proxy پلتفرم (لیارا) اجرا می‌شود — بدون این تنظیم، req.ip همیشه IP
  // همان پراکسی است، نه IP واقعی کلاینت که برای rate limit و مسدودسازی هولوگرام (بند ۵.۲) لازم است.
  // مقدار true قبلی اولین مقدار X-Forwarded-For را می‌پذیرفت که کلاینت می‌تواند جعل کند؛ حالا فقط
  // از روی پراکسی‌های مورد اعتماد (پیش‌فرض: شبکه‌ی داخلی، قابل تغییر با TRUST_PROXY) عبور می‌شود.
  app.set('trust proxy', resolveTrustProxy());
  const invalidCdnRanges = parseProxyRanges().invalid;
  if (invalidCdnRanges.length) {
    logger.warn(
      `مقادیر نامعتبر در CDN_PROXY_RANGES نادیده گرفته شد: ${invalidCdnRanges.join(' ')}`,
      'Bootstrap',
    );
  }
  // درخواست‌های سرور Next.js (app/admin): IP و User-Agent کاربر اصلی با راز مشترک
  if (!process.env.INTERNAL_PROXY_SECRET) {
    logger.warn(
      'INTERNAL_PROXY_SECRET تنظیم نشده؛ درخواست‌های app/admin همه با IP سرور Next شمرده می‌شوند و rate limit بین کاربران مشترک است',
      'Bootstrap',
    );
  }
  app.use(clientIpMiddleware());
  // FDP_ACC_EXT.1.4 / FDP_RIP_EXT.1.2 — no-store روی پاسخ‌های پویا + سرآیندهای امنیتی پایه
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware());
  // FDP_ACC_EXT.1.1 — جستجوی موبایل/کد ملی در پنل مدیریت و پرتال نمایندگی فقط از سرآیند
  app.use(['/admin', '/agent-portal'], sensitiveQueryMiddleware());

  if (isOtpDebugLogEnabledInProduction()) {
    logger.warn(
      'OTP_DEBUG_LOG در production روشن است و کد OTP در لاگ چاپ می‌شود؛ پس از اتصال سرویس پیامک واقعی OTP_DEBUG_LOG و OTP_DEBUG_LOG_ALLOW_PRODUCTION را حذف کنید',
      'Bootstrap',
    );
  }

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

  // لیارا پورت را از طریق PORT مشخص می‌کند؛ پیش‌فرض توسعه‌ی محلی ۵۰۰۰ باقی می‌ماند
  await app.listen(Number(process.env.PORT) || 5000);
  markReady();
}

void bootstrap();
