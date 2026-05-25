import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── تنظیمات CORS برای ارتباط با Next.js ───
  app.enableCors({
    // آدرس دقیق پورت فرانت‌اَند Next.js شما روی لوکال
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    // اجازه حمل کوکی‌های امن (HttpOnly) بین فرانت و بک
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
  // ─────────────────────────

  // بک‌اَند شما روی پورت 5000 اجرا می‌شود تا با پورت پیش‌فرض نکس‌جی‌اس (3000) تداخل نداشته باشد
  await app.listen(5000);
}
void bootstrap();
