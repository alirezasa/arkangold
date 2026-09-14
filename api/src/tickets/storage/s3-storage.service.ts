// api/src/tickets/storage/s3-storage.service.ts
//
// نصب پکیج‌ها:
//   pnpm --filter api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//
// چون Bucket باید Private باشد، هیچ متدی برای ساخت Public URL وجود ندارد؛
// فقط Presigned URL کوتاه‌مدت تولید می‌شود.

import { Injectable, Logger } from '@nestjs/common';
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
export class S3StorageService implements IStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: true, // برای MinIO/R2/Wasabi لازم است
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  async upload({
    key,
    buffer,
    mimeType,
  }: UploadFileParams): Promise<{ storageKey: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Bucket باید از قبل به صورت Private کانفیگ شده باشد (بدون ACL عمومی)
      }),
    );
    this.logger.debug(`Uploaded object: ${key}`);
    return { storageKey: key };
  }

  async getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    this.logger.debug(`Deleted object: ${storageKey}`);
  }
}
