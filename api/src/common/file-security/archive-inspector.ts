// api/src/common/file-security/archive-inspector.ts
//
// FPT_RVM_EXT.1.3 / FPT_RVM_EXT.1.4 / FPT_RVM_EXT.2.3 — بازرسی امن فایل فشرده (ZIP و همه‌ی
// قالب‌های مبتنی بر ZIP مثل docx/xlsx) «پیش از هرگونه استخراج»: فقط فهرست مرکزی (Central
// Directory) خوانده می‌شود و هیچ داده‌ای از حالت فشرده خارج نمی‌شود. موارد رد:
//   - تعداد فایل‌ها یا حجم کل پس از بازگشایی بیش از سقف (ZIP bomb / اتمام inode)
//   - نسبت فشرده‌سازی غیرعادی
//   - لینک نمادین (symlink)، مسیر مطلق، «..» یا نام‌های کنترلی (Zip Slip)
//   - رمزگذاری‌شده (قابل بازرسی نیست) و ZIP64/چندبخشی
// برنامه هیچ‌گاه آرشیو را روی دیسک استخراج نمی‌کند؛ مسیرهای داخل آرشیو هرگز در ساخت مسیر فایل
// سرور استفاده نمی‌شوند.

export interface ArchiveLimits {
  maxEntries: number;
  maxTotalUncompressed: number;
  maxEntryUncompressed: number;
  maxCompressionRatio: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 1000,
  maxTotalUncompressed: 100 * 1024 * 1024,
  maxEntryUncompressed: 50 * 1024 * 1024,
  maxCompressionRatio: 100,
};

export interface ArchiveEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
}

export class ArchiveRejectedError extends Error {
  constructor(
    readonly code:
      | 'ARCHIVE_INVALID'
      | 'ARCHIVE_TOO_MANY_ENTRIES'
      | 'ARCHIVE_TOO_LARGE'
      | 'ARCHIVE_RATIO'
      | 'ARCHIVE_SYMLINK'
      | 'ARCHIVE_PATH_TRAVERSAL'
      | 'ARCHIVE_ENCRYPTED'
      | 'ARCHIVE_UNSUPPORTED',
    message: string,
  ) {
    super(message);
  }
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

function findEocd(buf: Buffer): number {
  // رکورد انتهایی حداقل ۲۲ بایت + کامنت تا ۶۵۵۳۵ بایت
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

export function isUnsafeEntryName(name: string): boolean {
  if (!name || name.length > 512) return true;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return true;
  const n = name.replace(/\\/g, '/');
  if (n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return true;
  return n.split('/').some((part) => part === '..');
}

export function inspectZip(
  buf: Buffer,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): ArchiveEntry[] {
  if (buf.length < 22)
    throw new ArchiveRejectedError('ARCHIVE_INVALID', 'فایل فشرده معتبر نیست');
  const eocd = findEocd(buf);
  if (eocd < 0)
    throw new ArchiveRejectedError('ARCHIVE_INVALID', 'فایل فشرده معتبر نیست');

  const diskNo = buf.readUInt16LE(eocd + 4);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (diskNo !== 0 || totalEntries === 0xffff || cdOffset === 0xffffffff) {
    throw new ArchiveRejectedError(
      'ARCHIVE_UNSUPPORTED',
      'فایل فشرده‌ی چندبخشی یا ZIP64 پذیرفته نمی‌شود',
    );
  }
  if (totalEntries > limits.maxEntries) {
    throw new ArchiveRejectedError(
      'ARCHIVE_TOO_MANY_ENTRIES',
      'تعداد فایل‌های داخل فایل فشرده بیش از حد مجاز است',
    );
  }
  if (cdOffset + cdSize > eocd) {
    throw new ArchiveRejectedError(
      'ARCHIVE_INVALID',
      'ساختار فایل فشرده معتبر نیست',
    );
  }

  const entries: ArchiveEntry[] = [];
  let total = 0;
  let totalCompressed = 0;
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) {
      throw new ArchiveRejectedError(
        'ARCHIVE_INVALID',
        'ساختار فایل فشرده معتبر نیست',
      );
    }
    const madeBy = buf.readUInt16LE(p + 4) >> 8; // سیستم‌عامل سازنده
    const flags = buf.readUInt16LE(p + 8);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttr = buf.readUInt32LE(p + 38);
    const name = buf
      .subarray(p + 46, p + 46 + nameLen)
      .toString(flags & 0x800 ? 'utf8' : 'latin1');
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x1) {
      throw new ArchiveRejectedError(
        'ARCHIVE_ENCRYPTED',
        'فایل فشرده‌ی رمزدار قابل بررسی نیست و پذیرفته نمی‌شود',
      );
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ArchiveRejectedError(
        'ARCHIVE_UNSUPPORTED',
        'فایل فشرده‌ی ZIP64 پذیرفته نمی‌شود',
      );
    }
    // unix (3) و macOS (19): نوع فایل در ۱۶ بیت بالای external attributes
    const mode = (externalAttr >>> 16) & 0xffff;
    if ((madeBy === 3 || madeBy === 19) && (mode & S_IFMT) === S_IFLNK) {
      throw new ArchiveRejectedError(
        'ARCHIVE_SYMLINK',
        'فایل فشرده حاوی لینک نمادین (symlink) پذیرفته نمی‌شود',
      );
    }
    if (isUnsafeEntryName(name)) {
      throw new ArchiveRejectedError(
        'ARCHIVE_PATH_TRAVERSAL',
        'فایل فشرده حاوی مسیر نامعتبر است',
      );
    }
    if (uncompressedSize > limits.maxEntryUncompressed) {
      throw new ArchiveRejectedError(
        'ARCHIVE_TOO_LARGE',
        'حجم یکی از فایل‌های داخل فایل فشرده بیش از حد مجاز است',
      );
    }
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > limits.maxCompressionRatio
    ) {
      throw new ArchiveRejectedError(
        'ARCHIVE_RATIO',
        'نسبت فشرده‌سازی فایل غیرعادی است (احتمال ZIP bomb)',
      );
    }
    total += uncompressedSize;
    totalCompressed += compressedSize;
    if (total > limits.maxTotalUncompressed) {
      throw new ArchiveRejectedError(
        'ARCHIVE_TOO_LARGE',
        'حجم فایل فشرده پس از بازگشایی بیش از حد مجاز است',
      );
    }
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith('/'),
    });
  }
  if (
    totalCompressed > 0 &&
    total / totalCompressed > limits.maxCompressionRatio
  ) {
    throw new ArchiveRejectedError(
      'ARCHIVE_RATIO',
      'نسبت فشرده‌سازی فایل غیرعادی است (احتمال ZIP bomb)',
    );
  }
  return entries;
}
