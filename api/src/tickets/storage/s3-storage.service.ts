// api/src/tickets/storage/s3-storage.service.ts
//
// چون Bucket باید Private باشد، هیچ متدی برای ساخت Public URL وجود ندارد؛
// فقط Presigned URL کوتاه‌مدت تولید می‌شود.

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageService, UploadFileParams } from './storage.service';

@Injectable()
export class S3StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    this.bucket = this.config.get<string>('S3_BUCKET') ?? '';

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.error(
        '[Tickets Storage] متغیرهای S3 تنظیم نشده‌اند — آپلود پیوست تیکت کار نخواهد کرد',
      );
      return;
    }

    // S3_ENDPOINT باید یک URL کامل با scheme باشد (مثلاً https://storage.iran.liara.space).
    // اگر فقط دامنه وارد شده باشد، new URL(...) در SDK با خطای مبهم «Invalid URL» شکست
    // می‌خورد — این‌جا هم به‌صورت مهربان تصحیح می‌کنیم هم در صورت نامعتبر بودن واقعی خطای
    // روشن در لاگ می‌دهیم به‌جای شکست دیرهنگام و گنگ هنگام آپلود.
    const normalizedEndpoint = /^https?:\/\//i.test(endpoint)
      ? endpoint
      : `https://${endpoint}`;
    try {
      new URL(normalizedEndpoint);
    } catch {
      this.logger.error(
        `[Tickets Storage] مقدار S3_ENDPOINT معتبر نیست: "${endpoint}" — باید یک آدرس کامل باشد (مثلاً https://storage.iran.liara.space)`,
      );
      return;
    }

    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: normalizedEndpoint,
      forcePathStyle: true, // برای MinIO/R2/Wasabi/لیارا لازم است
      credentials: { accessKeyId, secretAccessKey },
      // نسخه‌های اخیر AWS SDK v3 به‌صورت پیش‌فرض هدر/تریلر Checksum اضافه
      // (flexible checksums) به هر PutObject اضافه می‌کنند. اکثر سرویس‌های
      // S3-Compatible غیر AWS (لیارا، آروان، مین‌آی‌او و ...) این را پشتیبانی
      // نمی‌کنند و درخواست آپلود را رد می‌کنند. WHEN_REQUIRED رفتار قبلی
      // (بدون این هدرهای اضافه) را برمی‌گرداند.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(`[Tickets Storage] آماده است — bucket: ${this.bucket}`);
  }

  private assertReady() {
    if (!this.client) {
      throw new InternalServerErrorException(
        'سرویس ذخیره‌سازی فایل تیکت در دسترس نیست — متغیرهای S3 را بررسی کنید',
      );
    }
  }

  async upload({
    key,
    buffer,
    mimeType,
  }: UploadFileParams): Promise<{ storageKey: string }> {
    this.assertReady();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          // Bucket باید از قبل به صورت Private کانفیگ شده باشد (بدون ACL عمومی)
        }),
      );
    } catch (err) {
      this.logger.error(
        `[Tickets Storage] آپلود ${key} ناموفق بود: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'آپلود فایل ناموفق بود؛ لطفاً دوباره تلاش کنید',
      );
    }
    this.logger.debug(`Uploaded object: ${key}`);
    return { storageKey: key };
  }

  async getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    this.assertReady();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(storageKey: string): Promise<void> {
    this.assertReady();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    this.logger.debug(`Deleted object: ${storageKey}`);
  }
}
