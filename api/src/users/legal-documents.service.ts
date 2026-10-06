import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { resolve, sep } from 'path';
import {
  FileSecurityService,
  UploadActor,
} from '../common/file-security/file-security.service';
import { LEGAL_DOCUMENT_POLICY } from '../common/file-security/upload-policies';

// مدارک خارج از هر مسیر قابل‌سرویس وب (useStaticAssets) ذخیره و فقط از مسیر کنترل‌شده‌ی
// دانلود ادمین ارائه می‌شوند (FPT_RVM_EXT.2.1)
export const LEGAL_UPLOAD_DIR = resolve(
  process.cwd(),
  'uploads',
  'legal-documents',
);

/** FPT_RVM_EXT.2.2 — مسیر ذخیره‌شده باید داخل پوشه‌ی مدارک باشد (مقاوم در برابر دست‌کاری) */
export function assertInsideLegalDir(filePath: string): string {
  const full = resolve(filePath);
  if (!full.startsWith(LEGAL_UPLOAD_DIR + sep)) {
    throw new NotFoundException('فایل مدرک یافت نشد');
  }
  return full;
}

const ALLOWED_TYPES = [
  'INTRODUCTION_LETTER',
  'ARTICLES_OF_ASSOCIATION',
  'OTHER',
];

@Injectable()
export class LegalDocumentsService {
  private readonly logger = new Logger(LegalDocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private fileSecurity: FileSecurityService,
  ) {}

  async upload(
    userId: string,
    docType: string,
    file: Express.Multer.File,
    actor: UploadActor = {},
  ) {
    if (!ALLOWED_TYPES.includes(docType)) {
      throw new BadRequestException('نوع مدرک نامعتبر است');
    }
    const legalProfile = await this.prisma.legalProfile.findUnique({
      where: { userId },
    });
    if (!legalProfile) {
      throw new NotFoundException('ابتدا باید اطلاعات شرکت را ثبت کنید');
    }

    // بررسی نوع واقعی، پویش ضدبدافزار و حذف فراداده پیش از نوشتن روی دیسک
    const clean = await this.fileSecurity.process(
      file,
      LEGAL_DOCUMENT_POLICY,
      actor,
    );
    // FPT_RVM_EXT.2.2 — نام و پسوند فایل را سرور تعیین می‌کند؛ ایجاد اتمی (O_CREAT|O_EXCL)
    // تا فایل موجود هرگز بازنویسی نشود (FPT_SEP_EXT.1.2)
    await fs.mkdir(LEGAL_UPLOAD_DIR, { recursive: true });
    const filePath = resolve(LEGAL_UPLOAD_DIR, `${randomUUID()}.${clean.ext}`);
    await fs.writeFile(filePath, clean.buffer, { flag: 'wx', mode: 0o640 });

    const doc = await this.prisma.legalProfileDocument
      .create({
        data: {
          legalProfileId: legalProfile.id,
          type: docType,
          fileName: clean.displayName,
          filePath,
          fileSize: clean.size,
          mimeType: clean.mime,
        },
      })
      .catch(async (err: unknown) => {
        // رکورد ساخته نشد → فایل یتیم روی دیسک نمی‌ماند
        await fs.unlink(filePath).catch(() => undefined);
        throw err;
      });

    return {
      id: doc.id,
      type: doc.type,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt,
    };
  }

  async list(userId: string) {
    const legalProfile = await this.prisma.legalProfile.findUnique({
      where: { userId },
      include: { documents: { orderBy: { uploadedAt: 'desc' } } },
    });
    if (!legalProfile) return [];
    return legalProfile.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt,
    }));
  }

  async remove(userId: string, documentId: string) {
    const doc = await this.prisma.legalProfileDocument.findFirst({
      where: { id: documentId, legalProfile: { userId } },
    });
    if (!doc) throw new NotFoundException('مدرک یافت نشد');

    await this.prisma.legalProfileDocument.delete({ where: { id: doc.id } });
    let full: string;
    try {
      full = assertInsideLegalDir(doc.filePath);
    } catch {
      this.logger.warn(
        `مسیر فایل مدرک ${doc.id} خارج از پوشه‌ی مجاز است؛ حذف نشد`,
      );
      return { message: 'مدرک حذف شد' };
    }
    fs.unlink(full).catch(() => {
      this.logger.warn(`حذف فایل ${doc.filePath} ناموفق بود`);
    });

    return { message: 'مدرک حذف شد' };
  }

  // ── برای ادمین (بدون محدودیت userId) ──
  async getForAdmin(documentId: string) {
    const doc = await this.prisma.legalProfileDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('مدرک یافت نشد');
    return doc;
  }

  async listForAdmin(userId: string) {
    return this.list(userId);
  }
}
