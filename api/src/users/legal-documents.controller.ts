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
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LegalDocumentsService } from './legal-documents.service';
import { OwnedResource } from '../common/audit/owned-resource.decorator';
import { LEGAL_DOCUMENT_POLICY } from '../common/file-security/upload-policies';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@UseGuards(JwtAuthGuard)
@Controller('users/me/legal-profile/documents')
export class LegalDocumentsController {
  constructor(private readonly service: LegalDocumentsService) {}

  @Post()
  @UseInterceptors(
    // فایل در حافظه نگه داشته می‌شود تا پیش از نوشتن روی دیسک بررسی و پاک‌سازی شود
    // (FileSecurityService)؛ سقف حجم پیش از بافر شدن اعمال می‌شود (FPT_RVM_EXT.1.1)
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: LEGAL_DOCUMENT_POLICY.maxBytes,
        files: 1,
        fields: 5,
        fieldSize: 1024,
      },
    }),
  )
  upload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    if (!file) throw new BadRequestException('فایلی ارسال نشده است');
    return this.service.upload(req.user.userId, type, file, {
      userId: req.user.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.userId);
  }

  @OwnedResource({
    model: 'legalProfileDocument',
    ownerPath: 'legalProfile.userId',
  })
  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.user.userId, id);
  }
}
