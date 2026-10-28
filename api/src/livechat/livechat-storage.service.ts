// api/src/livechat/livechat-storage.service.ts
//
// ذخیره‌ی پیوست‌های چت: باکت خصوصی S3 (مثل پیوست تیکت) و در نبود تنظیمات S3، دیسک محلی
// uploads/livechat (بدون مسیر عمومی — فقط از مسیر احرازشده‌ی API قابل دریافت است).
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import { join, resolve } from 'path';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../tickets/storage/storage.service';
import type { SanitizedFile } from '../common/file-security/file-security.service';
import { writeSanitizedFile } from '../common/file-security/local-file-store';

const LOCAL_DIR = join(process.cwd(), 'uploads', 'livechat');

@Injectable()
export class LivechatStorageService {
  constructor(@Inject(STORAGE_SERVICE) private readonly s3: IStorageService) {}

  async save(conversationId: string, file: SanitizedFile): Promise<string> {
    if (this.s3.isReady?.()) {
      const key = `livechat/${conversationId}/${file.sha256.slice(0, 16)}-${Date.now()}.${file.ext}`;
      await this.s3.upload({
        key,
        buffer: file.buffer,
        mimeType: file.mime,
        fileName: file.displayName,
      });
      return `s3:${key}`;
    }
    const { filename } = await writeSanitizedFile(LOCAL_DIR, file);
    return `local:${filename}`;
  }

  async read(storageKey: string): Promise<Buffer> {
    if (storageKey.startsWith('s3:') && this.s3.download) {
      return this.s3.download(storageKey.slice(3));
    }
    if (storageKey.startsWith('local:')) {
      const name = storageKey.slice(6);
      // نام فایل تولیدی سرور است؛ با این حال از خروج از پوشه جلوگیری می‌شود
      if (!/^[\w-]+\.\w+$/.test(name))
        throw new NotFoundException('فایل یافت نشد');
      const full = resolve(LOCAL_DIR, name);
      return fs.readFile(full).catch(() => {
        throw new NotFoundException('فایل یافت نشد');
      });
    }
    throw new NotFoundException('فایل یافت نشد');
  }
}
