import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * رمزنگاری/رمزگشایی Credentialهای Provider (Client ID/Secret، API Key و ...) با AES-256-GCM.
 * کلید از env گرفته می‌شود، نه از دیتابیس — اگر دیتابیس لو برود، بدون کلید env قابل رمزگشایی نیست.
 *
 * تولید کلید:
 *   openssl rand -base64 32
 * و مقدار خروجی را در INTEGRATION_ENCRYPTION_KEY قرار بده.
 */
@Injectable()
export class CredentialEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private key!: Buffer;

  onModuleInit() {
    const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'INTEGRATION_ENCRYPTION_KEY در env تنظیم نشده است. یک کلید ۳۲ بایتی Base64 تولید کن: `openssl rand -base64 32`',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'INTEGRATION_ENCRYPTION_KEY باید بعد از decode دقیقاً ۳۲ بایت باشد (AES-256)',
      );
    }
    this.key = key;
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('فرمت داده رمزنگاری‌شده Credential نامعتبر است');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /** برای نمایش در Admin Panel — فقط ۴ کاراکتر آخر را نشان می‌دهد (طبق سند: Client ID: ********1234) */
  maskForDisplay(plainText: string): string {
    if (plainText.length <= 4) return '*'.repeat(plainText.length);
    return '*'.repeat(plainText.length - 4) + plainText.slice(-4);
  }
}
