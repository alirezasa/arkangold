// api/src/common/file-security/local-file-store.ts
//
// FPT_RVM_EXT.2.2 / FPT_SEP_EXT.1.2 — نوشتن فایل پاک‌سازی‌شده روی دیسک محلی با نام تولیدی سرور
// (UUID + پسوند تعیین‌شده توسط سرور) در پوشه‌ی ثابت؛ ایجاد اتمی با O_CREAT|O_EXCL تا هیچ فایل
// موجودی بازنویسی نشود. ورودی کاربر هیچ نقشی در مسیر ندارد.
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { resolve } from 'path';
import type { SanitizedFile } from './file-security.service';

export async function writeSanitizedFile(dir: string, file: SanitizedFile) {
  const base = resolve(dir);
  await fs.mkdir(base, { recursive: true });
  const filename = `${randomUUID()}.${file.ext}`;
  const fullPath = resolve(base, filename);
  await fs.writeFile(fullPath, file.buffer, { flag: 'wx', mode: 0o644 });
  return { filename, fullPath };
}
