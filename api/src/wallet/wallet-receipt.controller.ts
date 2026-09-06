// api/src/wallet/wallet-receipt.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Req,
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
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { WalletReceiptService } from './wallet-receipt.service';
import { IsOptional, IsString, IsUUID } from 'class-validator';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

const UPLOAD_DIR = './uploads/deposit-receipts';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png'];

class SubmitReceiptDto {
  @IsUUID()
  transactionId!: string;

  @IsOptional()
  @IsUUID()
  proformaId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('wallet/deposit-receipts')
export class WalletReceiptController {
  constructor(private readonly service: WalletReceiptService) {}

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
      limits: { fileSize: 8 * 1024 * 1024 }, // ۸ مگابایت
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          return cb(
            new BadRequestException('فرمت فایل مجاز نیست (فقط JPG، JPEG، PNG)'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  submit(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SubmitReceiptDto,
  ) {
    if (!file) throw new BadRequestException('تصویر فیش واریزی الزامی است');
    return this.service.submit(req.user.userId, file, dto);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.listForUser(req.user.userId);
  }
}
