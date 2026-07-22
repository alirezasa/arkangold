import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';

const ALLOWED_TYPES = [
  'INTRODUCTION_LETTER',
  'ARTICLES_OF_ASSOCIATION',
  'OTHER',
];

@Injectable()
export class LegalDocumentsService {
  private readonly logger = new Logger(LegalDocumentsService.name);

  constructor(private prisma: PrismaService) {}

  async upload(userId: string, docType: string, file: Express.Multer.File) {
    if (!ALLOWED_TYPES.includes(docType)) {
      throw new BadRequestException('نوع مدرک نامعتبر است');
    }
    const legalProfile = await this.prisma.legalProfile.findUnique({
      where: { userId },
    });
    if (!legalProfile) {
      throw new NotFoundException('ابتدا باید اطلاعات شرکت را ثبت کنید');
    }

    const doc = await this.prisma.legalProfileDocument.create({
      data: {
        legalProfileId: legalProfile.id,
        type: docType,
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
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
    fs.unlink(doc.filePath).catch(() => {
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
