import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // ← اضافه شود
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(3000);
}
void bootstrap();
