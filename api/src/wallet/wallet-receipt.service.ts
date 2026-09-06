// api/src/wallet/wallet-receipt.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';

interface SubmitDto {
  transactionId: string;
  proformaId?: string;
  description?: string;
}

@Injectable()
export class WalletReceiptService {
  private readonly logger = new Logger(WalletReceiptService.name);

  constructor(private prisma: PrismaService) {}

  async submit(userId: string, file: Express.Multer.File, dto: SubmitDto) {
    // تراکنش باید متعلق به همین کاربر و هنوز PENDING باشد
    const tx = await this.prisma.transaction.findFirst({
      where: {
        id: dto.transactionId,
        userId,
        type: 'DEPOSIT',
        status: 'PENDING',
      },
    });
    if (!tx) {
      // فایل آپلودشده را پاک کن چون بی‌مصرف است
      await fs.unlink(file.path).catch(() => {});
      throw new NotFoundException(
        'تراکنش واریز یافت نشد یا قبلاً پردازش شده است',
      );
    }

    // جلوگیری از ارسال چندبارهٔ فیش برای یک تراکنش با وضعیت PENDING
    const existingPending = await this.prisma.depositReceipt.findFirst({
      where: { transactionId: tx.id, status: 'PENDING' },
    });
    if (existingPending) {
      await fs.unlink(file.path).catch(() => {});
      throw new ConflictException(
        'برای این تراکنش قبلاً فیش ارسال شده و در انتظار بررسی است',
      );
    }

    const receipt = await this.prisma.depositReceipt.create({
      data: {
        userId,
        transactionId: tx.id,
        proformaId: dto.proformaId,
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        description: dto.description,
      },
    });

    // description تراکنش را نشانه‌گذاری کن تا در لیست ادمین قابل فیلتر باشد
    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: {
        description: `${tx.description ?? ''}|receipt_submitted:${receipt.id}`,
      },
    });

    this.logger.log(
      `[DepositReceipt] فیش ${receipt.id} برای تراکنش ${tx.id} ثبت شد`,
    );

    return {
      id: receipt.id,
      status: receipt.status,
      message: 'فیش واریزی شما ثبت شد و در انتظار بررسی کارشناسان است',
    };
  }

  async listForUser(userId: string) {
    const items = await this.prisma.depositReceipt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      status: r.status,
      description: r.description,
      adminNotes: r.adminNotes,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
