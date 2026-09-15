// api/src/common/storage/storage.service.ts
// نصب لازم: pnpm --filter api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp
//
// انتزاع عمدی: هیچ جای دیگری از کد نباید مستقیماً S3Client بسازد. بعداً
// آپلودهای فعلی روی دیسک (مدارک حقوقی، تصاویر محصول) هم می‌توانند بدون
// تغییر کد صدازننده به همین سرویس مهاجرت کنند.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import sharp from 'sharp';

export interface StoredObject {
  storageKey: string;
  bucket: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
}

/** امضای فایل — هدر Content-Type کلاینت قابل جعل است، magic bytes نه. */
const MAGIC: { mime: string; ext: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
];

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
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
        '[Storage] متغیرهای S3 تنظیم نشده‌اند — آپلود رسید کار نخواهد کرد',
      );
      return;
    }

    // لیارا: forcePathStyle اجباری است و region مقدار ساختگی می‌گیرد
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      // نسخه‌های اخیر AWS SDK v3 به‌صورت پیش‌فرض هدر/تریلر Checksum اضافه
      // (flexible checksums) به هر PutObject اضافه می‌کنند که لیارا (و اکثر
      // S3-Compatible های غیر AWS) پشتیبانی نمی‌کند و آپلود را رد می‌کند.
      // WHEN_REQUIRED رفتار قبلی (بدون این هدرهای اضافه) را برمی‌گرداند.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(`[Storage] لیارا آماده است — bucket: ${this.bucket}`);
  }

  private assertReady() {
    if (!this.client) {
      throw new InternalServerErrorException(
        'سرویس ذخیره‌سازی فایل در دسترس نیست',
      );
    }
  }

  private detectType(buffer: Buffer): { mime: string; ext: string } {
    const found = MAGIC.find((m) => m.bytes.every((b, i) => buffer[i] === b));
    if (!found) {
      throw new BadRequestException(
        'فرمت فایل معتبر نیست. فقط JPG، JPEG و PNG پذیرفته می‌شود',
      );
    }
    return { mime: found.mime, ext: found.ext };
  }

  /**
   * آپلود تصویر رسید.
   * تصویر با sharp دوباره انکود می‌شود: EXIF/GPS حذف و هر payload
   * جاسازی‌شده در فایل خنثی می‌شود.
   */
  async uploadReceiptImage(
    file: Express.Multer.File,
    keyPrefix: string,
  ): Promise<StoredObject> {
    this.assertReady();

    if (!file?.buffer?.length) {
      throw new BadRequestException('فایلی دریافت نشد');
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException('حجم فایل نباید بیشتر از ۵ مگابایت باشد');
    }

    const { ext } = this.detectType(file.buffer);

    let normalized: Buffer;
    let outMime: string;
    try {
      const pipeline = sharp(file.buffer, { failOn: 'error' })
        .rotate() // اعمال جهت EXIF سپس حذف آن
        .resize({
          width: 2200,
          height: 2200,
          fit: 'inside',
          withoutEnlargement: true,
        });

      if (ext === 'png') {
        normalized = await pipeline.png({ compressionLevel: 8 }).toBuffer();
        outMime = 'image/png';
      } else {
        normalized = await pipeline
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();
        outMime = 'image/jpeg';
      }
    } catch {
      throw new BadRequestException('فایل تصویر معتبر نیست یا آسیب دیده است');
    }

    const outExt = outMime === 'image/png' ? 'png' : 'jpg';
    // نام فایل تصادفی سمت سرور — هرگز originalname کاربر
    const storageKey = `${keyPrefix}/${randomUUID()}.${outExt}`;
    const checksum = createHash('sha256').update(normalized).digest('hex');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: normalized,
        ContentType: outMime,
        // دانلود اجباری — مانع اجرای محتوا در دامنه storage
        ContentDisposition: `attachment; filename="receipt.${outExt}"`,
        CacheControl: 'private, no-store',
      }),
    );

    return {
      storageKey,
      bucket: this.bucket,
      fileName: `receipt.${outExt}`,
      mimeType: outMime,
      fileSize: normalized.length,
      checksumSha256: checksum,
    };
  }

  /** URL امضاشده کوتاه‌عمر — bucket خصوصی است و هیچ URL دائمی صادر نمی‌شود. */
  async getSignedReadUrl(
    storageKey: string,
    expiresInSeconds = 120,
  ): Promise<string> {
    this.assertReady();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(storageKey: string): Promise<void> {
    this.assertReady();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }
}
