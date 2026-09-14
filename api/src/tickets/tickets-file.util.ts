// api/src/tickets/tickets-file.util.ts
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

// Configurable از طریق env — اگر می‌خواهید کاملاً از دیتابیس (system_config) بخوانید
// می‌توانید این دو مقدار را با یک Config Service جایگزین کنید.
export const TICKET_ALLOWED_EXTENSIONS = (
  process.env.TICKET_ALLOWED_EXTENSIONS ??
  'jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,txt,zip'
)
  .split(',')
  .map((e) => e.trim().toLowerCase());

export const TICKET_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]);

export const TICKET_MAX_FILE_SIZE_BYTES = Number(
  process.env.TICKET_MAX_FILE_SIZE_BYTES ?? 10 * 1024 * 1024, // 10MB
);
export const TICKET_MAX_FILES_PER_UPLOAD = Number(
  process.env.TICKET_MAX_FILES_PER_UPLOAD ?? 5,
);

/**
 * نام فایل را برای استفاده در Storage Key پاکسازی می‌کند.
 * از Path Traversal (../, /, \) و کاراکترهای خطرناک جلوگیری می‌کند.
 */
export function sanitizeFilename(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9آ-ی._-]/g, '_').slice(-150); // جلوگیری از نام خیلی طولانی
  return cleaned.length > 0 ? cleaned : 'file';
}

export function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1]!.toLowerCase();
}

export function validateUploadedFile(file: {
  originalname: string;
  mimetype: string;
  size: number;
}): void {
  if (file.size > TICKET_MAX_FILE_SIZE_BYTES) {
    throw new BadRequestException({
      message: 'حجم فایل بیش از حد مجاز است',
      error_code: 'FILE_TOO_LARGE',
    });
  }

  const ext = getExtension(file.originalname);
  if (!ext || !TICKET_ALLOWED_EXTENSIONS.includes(ext)) {
    throw new BadRequestException({
      message: 'فرمت فایل مجاز نیست',
      error_code: 'INVALID_FILE_EXTENSION',
    });
  }

  if (!TICKET_ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException({
      message: 'نوع فایل مجاز نیست',
      error_code: 'INVALID_MIME_TYPE',
    });
  }

  // جلوگیری صریح از فایل‌های اجرایی حتی اگر پسوندشان تغییر داده شده باشد
  const dangerousExtensions = [
    'exe',
    'sh',
    'bat',
    'cmd',
    'msi',
    'php',
    'js',
    'jar',
    'com',
  ];
  if (dangerousExtensions.includes(ext)) {
    throw new BadRequestException({
      message: 'آپلود فایل اجرایی مجاز نیست',
      error_code: 'EXECUTABLE_NOT_ALLOWED',
    });
  }
}

/**
 * ساخت Storage Key مطابق ساختار:
 * {userId}/Ticket/{ticketId}/{uuid}_{sanitizedFilename}
 */
export function buildTicketStorageKey(
  userId: string,
  ticketId: string,
  originalFilename: string,
): { storageKey: string; sanitized: string } {
  const sanitized = sanitizeFilename(originalFilename);
  const uuid = randomUUID().split('-')[0]; // uuid کوتاه، کافی برای یکتایی در حد یک تیکت
  const storageKey = `${userId}/Ticket/${ticketId}/${uuid}_${sanitized}`;
  return { storageKey, sanitized };
}
