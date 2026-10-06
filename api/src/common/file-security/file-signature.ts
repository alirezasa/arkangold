// api/src/common/file-security/file-signature.ts
//
// FPT_RVM_EXT.1.2 — تشخیص نوع واقعی فایل از «بایت‌های جادویی» (هدر Content-Type و پسوند
// ارسالی کلاینت قابل جعل‌اند) و تطبیق آن با پسوند اعلام‌شده.

export type FileKind = 'jpeg' | 'png' | 'webp' | 'pdf' | 'zip' | 'ole' | 'text';

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length &&
  bytes.every((b, i) => buf[offset + i] === b);

export function detectFileKind(buf: Buffer): FileKind | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'png';
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return 'webp';
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (
    startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buf, [0x50, 0x4b, 0x05, 0x06])
  )
    return 'zip';
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return 'ole';
  if (isPlainText(buf)) return 'text';
  return null;
}

/** متن ساده: UTF-8 معتبر و بدون بایت NUL/کنترلی غیرمجاز */
export function isPlainText(buf: Buffer): boolean {
  if (!buf.length) return false;
  for (const b of buf.subarray(0, Math.min(buf.length, 64 * 1024))) {
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** پسوند مجاز → نوع محتوای مورد انتظار و MIME امن و ثابت برای ذخیره/ارائه */
export const EXTENSION_RULES: Record<
  string,
  { kind: FileKind; mime: string; canonicalExt: string }
> = {
  jpg: { kind: 'jpeg', mime: 'image/jpeg', canonicalExt: 'jpg' },
  jpeg: { kind: 'jpeg', mime: 'image/jpeg', canonicalExt: 'jpg' },
  png: { kind: 'png', mime: 'image/png', canonicalExt: 'png' },
  webp: { kind: 'webp', mime: 'image/webp', canonicalExt: 'webp' },
  pdf: { kind: 'pdf', mime: 'application/pdf', canonicalExt: 'pdf' },
  docx: {
    kind: 'zip',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    canonicalExt: 'docx',
  },
  xlsx: {
    kind: 'zip',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    canonicalExt: 'xlsx',
  },
  zip: { kind: 'zip', mime: 'application/zip', canonicalExt: 'zip' },
  txt: { kind: 'text', mime: 'text/plain; charset=utf-8', canonicalExt: 'txt' },
};

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}
