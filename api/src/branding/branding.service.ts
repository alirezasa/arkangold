// api/src/branding/branding.service.ts
//
// هویت بصری قابل تنظیم از پنل مدیریت: لوگو (عمومی — صفحات ورود و پنل‌ها)، مهر و امضای شرکت
// (فقط روی فاکتور/پیش‌فاکتور). فایل‌ها پس از بررسی امنیتی و بازانکود (FileSecurityService) با نام
// تولیدی سرور در uploads/branding نوشته می‌شوند که به‌صورت ایستا منتشر نمی‌شود؛ لوگو از endpoint
// عمومی و مهر/امضا فقط داخل داده‌ی سند (data URI) به کاربر مجاز تحویل داده می‌شوند.
// مقدار تنظیم: «branding:<نام فایل>». فایل‌های قبلی حذف نمی‌شوند تا اسناد صادرشده‌ی قبلی
// (که مرجع فایل را در snapshot نگه می‌دارند) همان مهر/امضای لحظه‌ی صدور را نشان دهند.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { join, resolve } from 'path';
import { SystemConfigService } from '../system-config/system-config.service';
import { FileSecurityService } from '../common/file-security/file-security.service';
import { BRANDING_IMAGE_POLICY } from '../common/file-security/upload-policies';
import { writeSanitizedFile } from '../common/file-security/local-file-store';

export type BrandingKind = 'logo' | 'seal' | 'signature';

export const BRANDING_KINDS: BrandingKind[] = ['logo', 'seal', 'signature'];

export const BRANDING_CONFIG_KEYS: Record<BrandingKind, string> = {
  logo: 'company.logo_path',
  seal: 'company.seal_image_path',
  signature: 'company.signature_image_path',
};

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'branding');
const REF_PREFIX = 'branding:';
/** فقط نام‌های تولیدی سرور (UUID + پسوند) — هیچ مسیر دلخواهی از تنظیمات خوانده نمی‌شود */
const FILE_NAME_RE = /^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i;
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export interface BrandingFile {
  buffer: Buffer;
  mime: string;
}

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private systemConfig: SystemConfigService,
    private fileSecurity: FileSecurityService,
  ) {}

  static isKind(v: string): v is BrandingKind {
    return (BRANDING_KINDS as string[]).includes(v);
  }

  /** آیا مقدار تنظیم به فایل بارگذاری‌شده از پنل اشاره می‌کند؟ */
  static isUploadedRef(ref: string | null | undefined): boolean {
    return !!ref && ref.startsWith(REF_PREFIX);
  }

  async upload(kind: BrandingKind, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('فایل تصویر را انتخاب کنید');
    const clean = await this.fileSecurity.process(file, BRANDING_IMAGE_POLICY);
    const { filename } = await writeSanitizedFile(UPLOAD_DIR, clean);
    await this.systemConfig.set(BRANDING_CONFIG_KEYS[kind], `${REF_PREFIX}${filename}`);
    await this.systemConfig.invalidateCache();
    return { message: 'تصویر ذخیره شد', kind };
  }

  /** حذف از تنظیمات (فایل برای اسناد صادرشده‌ی قبلی نگه داشته می‌شود) */
  async remove(kind: BrandingKind) {
    await this.systemConfig.set(BRANDING_CONFIG_KEYS[kind], '');
    await this.systemConfig.invalidateCache();
    return { message: 'تصویر حذف شد', kind };
  }

  /** خواندن فایل از روی مرجع تنظیم؛ مرجع نامعتبر/ناموجود → null */
  async readRef(ref: string | null | undefined): Promise<BrandingFile | null> {
    if (!BrandingService.isUploadedRef(ref)) return null;
    const name = ref!.slice(REF_PREFIX.length);
    if (!FILE_NAME_RE.test(name)) return null;
    const base = resolve(UPLOAD_DIR);
    const full = resolve(base, name);
    if (!full.startsWith(base)) return null;
    try {
      const buffer = await fs.readFile(full);
      const ext = name.split('.').pop()!.toLowerCase();
      return { buffer, mime: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
    } catch {
      this.logger.warn(`[Branding] فایل ${name} یافت نشد`);
      return null;
    }
  }

  async readCurrent(kind: BrandingKind): Promise<BrandingFile | null> {
    return this.readRef(await this.systemConfig.get(BRANDING_CONFIG_KEYS[kind], ''));
  }

  /** لوگوی عمومی (صفحات ورود/پنل‌ها) */
  async getPublicLogo(): Promise<BrandingFile> {
    const file = await this.readCurrent('logo');
    if (!file) throw new NotFoundException('لوگو تنظیم نشده است');
    return file;
  }

  static toDataUri(file: BrandingFile | null): string {
    return file ? `data:${file.mime};base64,${file.buffer.toString('base64')}` : '';
  }

  /** پیش‌نمایش هر سه تصویر برای پنل مدیریت */
  async getAdminPreview() {
    const [logo, seal, signature] = await Promise.all(
      BRANDING_KINDS.map((k) => this.readCurrent(k)),
    );
    return {
      logo: BrandingService.toDataUri(logo) || null,
      seal: BrandingService.toDataUri(seal) || null,
      signature: BrandingService.toDataUri(signature) || null,
    };
  }

  /**
   * تصویر سند: مرجع snapshot لحظه‌ی صدور؛ اگر سند قبل از امکان بارگذاری صادر شده باشد
   * (مسیر قدیمی یا خالی)، تصویر فعلی تنظیمات.
   */
  async resolveDocumentImage(
    kind: BrandingKind,
    snapshotRef: string | null | undefined,
  ): Promise<string> {
    if (BrandingService.isUploadedRef(snapshotRef)) {
      return BrandingService.toDataUri(await this.readRef(snapshotRef));
    }
    return BrandingService.toDataUri(await this.readCurrent(kind));
  }
}
