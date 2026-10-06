// api/src/common/file-security/file-security.service.ts
//
// سازوکار متمرکز امنیت فایل‌های بارگذاری‌شده — هر آپلود از منبع نامعتبر از این مسیر عبور می‌کند:
//   FPT_RVM_EXT.1.1  سقف حجم (علاوه بر سقف multer پیش از بافر شدن)
//   FPT_RVM_EXT.1.2  پسوند از فهرست مجاز + تطبیق با بایت‌های جادویی + اعتبارسنجی تخصصی ساختار
//   FPT_RVM_EXT.3.2  پویش ضدبدافزار (ClamAV) پیش از هر پردازش/ذخیره
//   FPT_RVM_EXT.1.5  بررسی ابعاد پیکسلی تصویر از روی هدر، پیش از رمزگشایی کامل (pixel flood)
//   FDP_ACC_EXT.1.6  حذف فراداده‌ها: تصویر (EXIF/GPS/مدل دوربین) با بازانکود، PDF (Info/XMP)،
//                    اسناد آفیس (docProps: نویسنده، شرکت، تاریخ‌ها، نرم‌افزار)
//   FPT_RVM_EXT.1.3/1.4/2.3  بازرسی فایل فشرده پیش از بازگشایی، رد symlink و مسیرهای Zip Slip؛
//                    محتوای ZIP با نام‌های تولیدی سرور و پس از پاک‌سازی تک‌تک فایل‌ها دوباره ساخته می‌شود
//   FPT_RVM_EXT.2.1/2.2  پسوند و MIME خروجی را سرور تعیین می‌کند؛ نام ذخیره‌سازی هرگز از کاربر نیست
// محتوای فعال رد می‌شود: JavaScript/Launch/فایل جاسازی‌شده در PDF، ماکرو/ActiveX و قالب راه‌دور در آفیس.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { sharp, type Metadata } from './sharp';
import * as JSZip from 'jszip';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFStream,
} from 'pdf-lib';
import { SystemConfigService } from '../../system-config/system-config.service';
import { AuditService } from '../audit/audit.service';
import { AntivirusService, ScanResult } from './antivirus.service';
import {
  ArchiveLimits,
  ArchiveRejectedError,
  DEFAULT_ARCHIVE_LIMITS,
  inspectZip,
} from './archive-inspector';
import {
  EXTENSION_RULES,
  FileKind,
  detectFileKind,
  extensionOf,
} from './file-signature';
import {
  decodeUploadFilename,
  sanitizeDisplayName,
  withServerExtension,
} from './content-disposition';

export interface UploadPolicy {
  /** برای پیام‌ها و ممیزی */
  purpose:
    | 'legal_document'
    | 'ticket_attachment'
    | 'deposit_receipt'
    | 'catalog_image';
  allowedExtensions: string[];
  maxBytes: number;
  /** بیشینه‌ی طول/عرض تصویر خروجی (بزرگ‌تر کوچک می‌شود) */
  maxImageDimension?: number;
  /** پسوندهای مجاز داخل ZIP (فقط وقتی zip در allowedExtensions باشد) */
  archiveInnerExtensions?: string[];
  archiveLimits?: ArchiveLimits;
}

export interface UploadActor {
  userId?: string | null;
  adminUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface SanitizedFile {
  buffer: Buffer;
  /** پسوند تعیین‌شده توسط سرور (نه کاربر) */
  ext: string;
  /** MIME امن و ثابت */
  mime: string;
  /** نام نمایشی پاک‌سازی‌شده با پسوند سرور — فقط برای نمایش/Content-Disposition */
  displayName: string;
  size: number;
  sha256: string;
  scan: ScanResult;
}

interface IncomingFile {
  originalname: string;
  buffer: Buffer;
  size?: number;
}

const DEFAULT_MAX_PIXELS = 40_000_000;
const ACTIVE_PDF_KEYS = new Set([
  'JavaScript',
  'JS',
  'Launch',
  'EmbeddedFile',
  'EmbeddedFiles',
  'RichMedia',
  'XFA',
  'SubmitForm',
  'ImportData',
  'GoToR',
  'GoToE',
]);
const DANGEROUS_REL_TYPES =
  /attachedTemplate|oleObject|frame|subDocument|externalLinkPath/i;

const ACTIVE_PDF_ACTIONS = new Set([
  'JavaScript',
  'Launch',
  'ImportData',
  'SubmitForm',
]);

/** جست‌وجوی بازگشتی کلیدها/کنش‌های فعال در دیکشنری‌ها و آرایه‌های تودرتوی PDF */
function hasActivePdfContent(obj: PDFObject, depth = 0): boolean {
  if (depth > 32) return false;
  const dict =
    obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
  if (dict) {
    for (const [key, value] of dict.entries()) {
      if (ACTIVE_PDF_KEYS.has(key.decodeText())) return true;
      if (
        key.decodeText() === 'S' &&
        value instanceof PDFName &&
        ACTIVE_PDF_ACTIONS.has(value.decodeText())
      ) {
        return true;
      }
      if (hasActivePdfContent(value, depth + 1)) return true;
    }
    return false;
  }
  if (obj instanceof PDFArray) {
    for (const item of obj.asArray()) {
      if (hasActivePdfContent(item, depth + 1)) return true;
    }
  }
  return false;
}

export class FileRejectedError extends BadRequestException {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super({ message, error_code: reason });
  }
}

@Injectable()
export class FileSecurityService {
  private readonly logger = new Logger(FileSecurityService.name);

  constructor(
    private antivirus: AntivirusService,
    private systemConfig: SystemConfigService,
    private audit: AuditService,
  ) {}

  async maxImagePixels(): Promise<number> {
    const v = await this.systemConfig.getNumber(
      'upload.max_image_pixels',
      DEFAULT_MAX_PIXELS,
    );
    return Number.isFinite(v) && v >= 1_000_000 ? v : DEFAULT_MAX_PIXELS;
  }

  /** پردازش امن یک فایل؛ خروجی همان چیزی است که باید ذخیره شود */
  async process(
    file: IncomingFile,
    policy: UploadPolicy,
    actor: UploadActor = {},
  ): Promise<SanitizedFile> {
    // کدگشایی یک‌باره‌ی نام فایل پیش از هر بررسی (FPT_ITT_EXT.3.1)
    file = { ...file, originalname: decodeUploadFilename(file.originalname) };
    try {
      return await this.processInner(file, policy, actor);
    } catch (err) {
      if (err instanceof ArchiveRejectedError) {
        await this.logRejected(actor, policy, err.code, file.originalname);
        throw new FileRejectedError(err.code, err.message);
      }
      if (err instanceof FileRejectedError) {
        await this.logRejected(actor, policy, err.reason, file.originalname);
      }
      throw err;
    }
  }

  private async processInner(
    file: IncomingFile,
    policy: UploadPolicy,
    actor: UploadActor,
  ): Promise<SanitizedFile> {
    const buffer = file.buffer;
    if (!buffer?.length)
      throw new FileRejectedError('FILE_EMPTY', 'فایلی دریافت نشد');
    if (buffer.length > policy.maxBytes) {
      throw new FileRejectedError(
        'FILE_TOO_LARGE',
        `حجم فایل نباید بیشتر از ${Math.round(policy.maxBytes / 1024 / 1024).toLocaleString('fa-IR')} مگابایت باشد`,
      );
    }

    const ext = extensionOf(file.originalname);
    const rule = EXTENSION_RULES[ext];
    if (!rule || !policy.allowedExtensions.includes(ext)) {
      throw new FileRejectedError(
        'INVALID_FILE_EXTENSION',
        `فرمت فایل مجاز نیست (مجاز: ${policy.allowedExtensions.join('، ')})`,
      );
    }
    const kind = detectFileKind(buffer);
    if (kind !== rule.kind) {
      throw new FileRejectedError(
        'CONTENT_TYPE_MISMATCH',
        'محتوای فایل با پسوند آن مطابقت ندارد',
      );
    }

    // پویش ضدبدافزار روی فایل اصلی، پیش از هر پردازش
    const scan = await this.antivirus.scan(buffer);
    if (scan.status === 'infected') {
      await this.audit.logUser({
        userId: actor.userId ?? null,
        adminId: actor.adminUserId ?? null,
        action: 'upload.malware_detected',
        entityType: 'upload',
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        source: FileSecurityService.name,
        success: false,
        newValue: { purpose: policy.purpose, signature: scan.signature, ext },
      });
      throw new FileRejectedError(
        'MALWARE_DETECTED',
        'فایل حاوی محتوای مخرب شناخته‌شده است و پذیرفته نشد',
      );
    }

    const out = await this.sanitizeByType(buffer, ext, kind, policy, 0);
    return {
      buffer: out,
      ext: rule.canonicalExt,
      mime: rule.mime,
      displayName: withServerExtension(
        sanitizeDisplayName(file.originalname),
        rule.canonicalExt,
      ),
      size: out.length,
      sha256: createHash('sha256').update(out).digest('hex'),
      scan,
    };
  }

  private async sanitizeByType(
    buffer: Buffer,
    ext: string,
    kind: FileKind,
    policy: UploadPolicy,
    depth: number,
  ): Promise<Buffer> {
    switch (kind) {
      case 'jpeg':
      case 'png':
      case 'webp':
        return this.sanitizeImage(
          buffer,
          kind,
          policy.maxImageDimension ?? 4000,
        );
      case 'pdf':
        return this.sanitizePdf(buffer);
      case 'text':
        return buffer;
      case 'zip':
        if (ext === 'docx' || ext === 'xlsx')
          return this.sanitizeOoxml(buffer, ext, policy);
        if (ext === 'zip' && depth === 0)
          return this.sanitizeZip(buffer, policy);
        throw new FileRejectedError(
          'NESTED_ARCHIVE',
          'فایل فشرده‌ی تودرتو پذیرفته نمی‌شود',
        );
      default:
        throw new FileRejectedError(
          'INVALID_FILE_TYPE',
          'نوع فایل پشتیبانی نمی‌شود',
        );
    }
  }

  /** FPT_RVM_EXT.1.5 + FDP_ACC_EXT.1.6 — ابعاد از هدر، سپس بازانکود بدون فراداده */
  async sanitizeImage(
    buffer: Buffer,
    kind: 'jpeg' | 'png' | 'webp',
    maxDim: number,
  ) {
    const maxPixels = await this.maxImagePixels();
    let meta: Metadata;
    try {
      meta = await sharp(buffer, { limitInputPixels: maxPixels }).metadata();
    } catch {
      throw new FileRejectedError(
        'IMAGE_INVALID',
        'فایل تصویر معتبر نیست یا ابعاد آن بیش از حد مجاز است',
      );
    }
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h || w * h > maxPixels || w > 20_000 || h > 20_000) {
      throw new FileRejectedError(
        'IMAGE_TOO_LARGE',
        'ابعاد تصویر بیش از حد مجاز است',
      );
    }
    if ((meta.pages ?? 1) > 1) {
      throw new FileRejectedError(
        'IMAGE_ANIMATED',
        'تصویر متحرک/چندصفحه‌ای پذیرفته نمی‌شود',
      );
    }
    try {
      // بدون withMetadata(): EXIF/GPS/XMP/ICC حذف می‌شود؛ rotate() جهت EXIF را پیش از حذف اعمال می‌کند
      const pipeline = sharp(buffer, {
        limitInputPixels: maxPixels,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: maxDim,
          height: maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        });
      if (kind === 'png')
        return await pipeline.png({ compressionLevel: 8 }).toBuffer();
      if (kind === 'webp')
        return await pipeline.webp({ quality: 88 }).toBuffer();
      return await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    } catch {
      throw new FileRejectedError(
        'IMAGE_INVALID',
        'فایل تصویر معتبر نیست یا آسیب دیده است',
      );
    }
  }

  /** رد محتوای فعال PDF و حذف Info/XMP */
  async sanitizePdf(buffer: Buffer): Promise<Buffer> {
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(buffer, { updateMetadata: false });
    } catch (err) {
      const encrypted = /encrypt/i.test((err as Error).message ?? '');
      throw new FileRejectedError(
        encrypted ? 'PDF_ENCRYPTED' : 'PDF_INVALID',
        encrypted
          ? 'فایل PDF رمزدار قابل بررسی نیست و پذیرفته نمی‌شود'
          : 'فایل PDF معتبر نیست یا آسیب دیده است',
      );
    }
    // همه‌ی اشیاء (مستقیم و تودرتو) بررسی می‌شوند
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (hasActivePdfContent(obj)) {
        throw new FileRejectedError(
          'PDF_ACTIVE_CONTENT',
          'فایل PDF حاوی محتوای فعال (اسکریپت/فایل جاسازی‌شده) است و پذیرفته نمی‌شود',
        );
      }
    }
    // حذف فراداده: Info (نویسنده، نرم‌افزار، تاریخ‌ها) و جریان XMP
    doc.context.trailerInfo.Info = undefined;
    doc.catalog.delete(PDFName.of('Metadata'));
    for (const page of doc.getPages()) page.node.delete(PDFName.of('Metadata'));
    try {
      return Buffer.from(await doc.save({ useObjectStreams: false }));
    } catch {
      throw new FileRejectedError(
        'PDF_INVALID',
        'فایل PDF معتبر نیست یا آسیب دیده است',
      );
    }
  }

  /** docx/xlsx: بازرسی آرشیو، رد ماکرو/ActiveX/قالب راه‌دور، حذف docProps */
  async sanitizeOoxml(
    buffer: Buffer,
    ext: 'docx' | 'xlsx',
    policy: UploadPolicy,
  ) {
    const entries = inspectZip(
      buffer,
      policy.archiveLimits ?? DEFAULT_ARCHIVE_LIMITS,
    );
    const names = new Set(entries.map((e) => e.name));
    const main = ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
    if (!names.has('[Content_Types].xml') || !names.has(main)) {
      throw new FileRejectedError(
        'OFFICE_INVALID',
        'ساختار فایل آفیس معتبر نیست',
      );
    }
    if (
      entries.some((e) =>
        /vbaProject\.bin$|\/activeX\/|\.(exe|dll|bat|cmd|js|vbs|ps1)$/i.test(
          e.name,
        ),
      )
    ) {
      throw new FileRejectedError(
        'OFFICE_ACTIVE_CONTENT',
        'فایل آفیس حاوی ماکرو یا محتوای اجرایی است و پذیرفته نمی‌شود',
      );
    }
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    const contentTypes = await zip.file('[Content_Types].xml').async('string');
    if (/macroEnabled|vbaProject/i.test(contentTypes)) {
      throw new FileRejectedError(
        'OFFICE_ACTIVE_CONTENT',
        'فایل آفیس دارای ماکرو پذیرفته نمی‌شود',
      );
    }
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith('.rels')) continue;
      const rels = await zip.file(name).async('string');
      for (const rel of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
        if (
          /TargetMode\s*=\s*"External"/i.test(rel) &&
          DANGEROUS_REL_TYPES.test(rel)
        ) {
          throw new FileRejectedError(
            'OFFICE_REMOTE_TEMPLATE',
            'فایل آفیس به قالب/شیء راه‌دور ارجاع می‌دهد و پذیرفته نمی‌شود',
          );
        }
      }
    }
    // FDP_ACC_EXT.1.6 — جایگزینی فراداده‌ی سند با نسخه‌ی خالی
    if (zip.file('docProps/core.xml')) {
      zip.file(
        'docProps/core.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>',
      );
    }
    if (zip.file('docProps/app.xml')) {
      zip.file(
        'docProps/app.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>',
      );
    }
    if (zip.file('docProps/custom.xml')) {
      zip.file(
        'docProps/custom.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>',
      );
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  /**
   * ZIP عمومی: بازرسی فهرست مرکزی پیش از بازگشایی، سپس هر فایل داخلی جداگانه اعتبارسنجی و
   * پاک‌سازی و در یک ZIP تازه با نام‌های تولیدی سرور (بدون پوشه/مسیر) قرار می‌گیرد.
   */
  async sanitizeZip(buffer: Buffer, policy: UploadPolicy) {
    const limits = policy.archiveLimits ?? DEFAULT_ARCHIVE_LIMITS;
    const entries = inspectZip(buffer, limits);
    const inner = policy.archiveInnerExtensions ?? [];
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    const out = new JSZip();
    const used = new Set<string>();
    let index = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const ext = extensionOf(entry.name);
      const rule = EXTENSION_RULES[ext];
      if (!rule || !inner.includes(ext)) {
        throw new FileRejectedError(
          'ARCHIVE_ENTRY_NOT_ALLOWED',
          `فایل فشرده حاوی نوع فایل غیرمجاز است (مجاز: ${inner.join('، ')})`,
        );
      }
      const data = await zip.file(entry.name).async('nodebuffer');
      if (data.length > limits.maxEntryUncompressed) {
        throw new FileRejectedError(
          'ARCHIVE_TOO_LARGE',
          'حجم فایل فشرده پس از بازگشایی بیش از حد مجاز است',
        );
      }
      const kind = detectFileKind(data);
      if (kind !== rule.kind) {
        throw new FileRejectedError(
          'ARCHIVE_ENTRY_MISMATCH',
          'محتوای یکی از فایل‌های داخل فایل فشرده با پسوندش مطابقت ندارد',
        );
      }
      const clean = await this.sanitizeByType(data, ext, kind, policy, 1);
      // FPT_RVM_EXT.2.3 — مسیر داخل آرشیو نادیده گرفته می‌شود؛ فقط نام پایه‌ی پاک‌سازی‌شده
      let name = withServerExtension(
        sanitizeDisplayName(entry.name, `file-${++index}`),
        rule.canonicalExt,
      );
      while (used.has(name.toLowerCase())) name = `${++index}-${name}`;
      used.add(name.toLowerCase());
      out.file(name, clean, { date: new Date(0) });
    }
    if (!used.size)
      throw new FileRejectedError('ARCHIVE_EMPTY', 'فایل فشرده خالی است');
    return out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  private async logRejected(
    actor: UploadActor,
    policy: UploadPolicy,
    reason: string,
    name: string,
  ) {
    this.logger.warn(`[Upload] فایل رد شد (${policy.purpose}): ${reason}`);
    await this.audit.logUser({
      userId: actor.userId ?? null,
      adminId: actor.adminUserId ?? null,
      action: 'upload.rejected',
      entityType: 'upload',
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
      source: FileSecurityService.name,
      success: false,
      newValue: { purpose: policy.purpose, reason, ext: extensionOf(name) },
    });
  }
}
