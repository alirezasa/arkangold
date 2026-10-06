// api/src/common/file-security/upload-policies.ts
// سیاست‌های آپلود هر بخش (فهرست مجاز پسوند، سقف حجم، ابعاد تصویر، محدودیت آرشیو)
import type { UploadPolicy } from './file-security.service';

const MB = 1024 * 1024;

export const LEGAL_DOCUMENT_POLICY: UploadPolicy = {
  purpose: 'legal_document',
  allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
  maxBytes: 10 * MB,
  maxImageDimension: 4000,
};

export const TICKET_ATTACHMENT_POLICY: UploadPolicy = {
  purpose: 'ticket_attachment',
  // فرمت‌های قدیمی doc/xls (OLE) قابل بازرسی و پاک‌سازی ماکرو نیستند و پذیرفته نمی‌شوند
  allowedExtensions: [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'pdf',
    'docx',
    'xlsx',
    'txt',
    'zip',
  ],
  maxBytes: 10 * MB,
  maxImageDimension: 3000,
  archiveInnerExtensions: [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'pdf',
    'docx',
    'xlsx',
    'txt',
  ],
  archiveLimits: {
    maxEntries: 100,
    maxTotalUncompressed: 50 * MB,
    maxEntryUncompressed: 20 * MB,
    maxCompressionRatio: 100,
  },
};

export const DEPOSIT_RECEIPT_POLICY: UploadPolicy = {
  purpose: 'deposit_receipt',
  allowedExtensions: ['jpg', 'jpeg', 'png'],
  maxBytes: 5 * MB,
  maxImageDimension: 2200,
};

export const CATALOG_IMAGE_POLICY: UploadPolicy = {
  purpose: 'catalog_image',
  allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  maxBytes: 5 * MB,
  maxImageDimension: 2400,
};
