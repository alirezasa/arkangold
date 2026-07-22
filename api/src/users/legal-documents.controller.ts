import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Req,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LegalDocumentsService } from './legal-documents.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

// ⚠️ فعلاً ذخیره روی دیسک محلی سرور - در آینده جایگزین با S3 می‌شود
const UPLOAD_DIR = './uploads/legal-documents';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

@UseGuards(JwtAuthGuard)
@Controller('users/me/legal-profile/documents')
export class LegalDocumentsController {
  constructor(private readonly service: LegalDocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // ۱۰ مگابایت
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          return cb(
            new BadRequestException('فرمت فایل مجاز نیست (فقط PDF یا تصویر)'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    if (!file) throw new BadRequestException('فایلی ارسال نشده است');
    return this.service.upload(req.user.userId, type, file);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.userId);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.user.userId, id);
  }
}
