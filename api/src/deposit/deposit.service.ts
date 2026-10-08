// api/src/deposit/deposit.service.ts

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { StorageService } from '../common/storage/storage.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { InvoiceService } from '../invoice/invoice.service';
import { DepositTrackingService } from './deposit-tracking.service';
import {
  assertTransition,
  MAX_REJECTIONS,
  STATUS_LABEL,
} from './deposit.state';
import type { DepositStatusValue } from './deposit.state';
import {
  addWorkingDays,
  formatJalaliDate,
  formatJalaliDateTime,
  parseHolidays,
} from '../common/utils/jalali.util';
import type { ProformaExtraData } from '../invoice/invoice.types';
import { businessRuleViolation } from '../common/audit/business-rule.util';

export type ManualDepositMethod = 'CARD_TO_CARD' | 'BANK_TRANSFER';

/** پیشوند کلیدهای تنظیمات سیستم برای هر روش (deposit.<key>.enabled و ...) */
const MANUAL_CONFIG_KEY: Record<ManualDepositMethod, string> = {
  CARD_TO_CARD: 'card_to_card',
  BANK_TRANSFER: 'bank_transfer',
};

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly storage: StorageService,
    private readonly sequence: DocumentSequenceService,
    private readonly invoiceService: InvoiceService,
    private readonly tracking: DepositTrackingService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // ── ایجاد درخواست واریز + پیش‌فاکتور ──
  // ═══════════════════════════════════════════════════════════

  async create(userId: string, amountRial: number, idempotencyKey?: string) {
    if (!Number.isSafeInteger(amountRial) || amountRial <= 0) {
      throw new BadRequestException('مبلغ معتبر نیست');
    }

    // Idempotency در سطح دیتابیس — بدون وابستگی به Redis
    if (idempotencyKey) {
      const existing = await this.prisma.depositRequest.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (existing.userId !== userId) {
          throw businessRuleViolation(
            new ForbiddenException('کلید درخواست معتبر نیست'),
            'deposit.idempotency_key_foreign',
          );
        }
        return this.getOne(userId, existing.id);
      }
    }

    // روش «مبالغ بالا (پیش‌فاکتور)» از پنل ادمین قابل غیرفعال‌سازی است
    const largeTransferEnabled = await this.systemConfig.getBoolean(
      'deposit.large_transfer.enabled',
      true,
    );
    if (!largeTransferEnabled) {
      throw new ForbiddenException(
        'واریز مبالغ بالا در حال حاضر غیرفعال است. لطفاً از روش دیگری استفاده کنید',
      );
    }

    await this.assertIdentityVerified(userId);

    const minAmount = await this.systemConfig.getNumber(
      'deposit.large_transfer.min_amount',
      4_000_000_000,
    );
    if (amountRial < minAmount) {
      throw new BadRequestException(
        `حداقل مبلغ این روش ${(minAmount / 10).toLocaleString('fa-IR')} تومان است`,
      );
    }

    const [
      owner,
      bank,
      accountNumber,
      sheba,
      subject,
      clausesRaw,
      validDays,
      holidaysRaw,
    ] = await Promise.all([
      this.systemConfig.get('deposit.large_transfer.destination_owner'),
      this.systemConfig.get('deposit.large_transfer.destination_bank'),
      this.systemConfig.get('deposit.large_transfer.destination_account'),
      this.systemConfig.get('deposit.large_transfer.destination_sheba'),
      this.systemConfig.get('proforma.subject_text'),
      this.systemConfig.get('proforma.legal_clauses'),
      this.systemConfig.getNumber('proforma.validity_working_days', 2),
      this.systemConfig.get('calendar.holidays'),
    ]);

    // نام صاحب حساب باید دقیقاً با نام روی شبا یکی باشد، وگرنه بانک واریز را رد می‌کند
    if (!owner || !sheba) {
      throw new BadRequestException(
        'اطلاعات حساب مقصد در تنظیمات سیستم کامل نشده است',
      );
    }

    const expiresAt = addWorkingDays(
      new Date(),
      validDays,
      parseHolidays(holidaysRaw),
    );

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

        const requestNumber = await this.sequence.next(tx, 'DEP');
        const depositTrackingId = await this.tracking.generate(tx);

        const destinationSnapshot = { owner, bank, accountNumber, sheba };

        const deposit = await tx.depositRequest.create({
          data: {
            requestNumber,
            userId,
            walletId: wallet.id,
            amountRial,
            method: 'LARGE_TRANSFER',
            status: 'PENDING_PAYMENT',
            depositTrackingId,
            destinationSnapshot,
            idempotencyKey: idempotencyKey ?? null,
            expiresAt,
          },
        });

        const extra: ProformaExtraData = {
          depositTrackingId,
          destination: destinationSnapshot,
          subject,
          legalClauses: clausesRaw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          depositRequestId: deposit.id,
          requestNumber,
        };

        const proforma = await this.invoiceService.issue(tx, {
          kind: 'PROFORMA',
          sourceType: 'DEPOSIT',
          sourceId: deposit.id,
          userId,
          expiresAt,
          extraData: extra,
          items: [
            {
              rowNo: 1,
              title: subject,
              unit: 'فقره',
              quantity: 1,
              unitPriceRial: amountRial,
              totalRial: amountRial,
            },
          ],
        });

        await tx.depositRequest.update({
          where: { id: deposit.id },
          data: { proformaInvoiceId: proforma.id },
        });

        return { depositId: deposit.id };
      });

      this.logger.log(
        `[Deposit] درخواست واریز ایجاد شد — کاربر ${userId} مبلغ ${amountRial}`,
      );
      return this.getOne(userId, created.depositId);
    } catch (err) {
      // برخورد همزمان روی idempotencyKey — همان پاسخ قبلی برگردانده می‌شود
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        idempotencyKey
      ) {
        const existing = await this.prisma.depositRequest.findUnique({
          where: { idempotencyKey },
        });
        if (existing) return this.getOne(userId, existing.id);
      }
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ── واریز کارت به کارت / حساب به حساب ──
  // ═══════════════════════════════════════════════════════════
  //
  // کاربر ابتدا فقط اطلاعات حساب مقصد را می‌بیند (prepareManual — هیچ رکوردی ساخته
  // نمی‌شود). پس از انجام واریز و ارسال فیش، یک DepositRequest با همان ماشین وضعیت
  // واریز مبالغ بالا ساخته می‌شود و پس از بررسی و تأیید کارشناس کیف پول شارژ و سند
  // حسابداری ثبت می‌شود. تا پیش از تأیید هیچ تراکنشی در «تراکنش‌ها»ی کاربر ثبت نمی‌شود.

  /** اعتبارسنجی و اطلاعات مقصد — بدون نوشتن در دیتابیس */
  async prepareManual(
    userId: string,
    method: ManualDepositMethod,
    sourceCardId: string,
    amountRial?: number,
  ) {
    const key = MANUAL_CONFIG_KEY[method];
    const enabled = await this.systemConfig.getBoolean(
      `deposit.${key}.enabled`,
      true,
    );
    if (!enabled) {
      throw new ForbiddenException(
        'این روش واریز در حال حاضر غیرفعال است. لطفاً از روش دیگری استفاده کنید',
      );
    }
    await this.assertIdentityVerified(
      userId,
      'برای واریز وجه ابتدا احراز هویت خود را تکمیل کنید',
    );

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: sourceCardId, userId },
    });
    if (!bankAccount) throw new NotFoundException('کارت بانکی یافت نشد');
    if (!bankAccount.isVerified) {
      throw new BadRequestException(
        'واریز فقط از کارت/حساب تأییدشده‌ی خودتان امکان‌پذیر است',
      );
    }

    const destination = await this.manualDestination(method);

    if (amountRial !== undefined) {
      await this.assertManualAmount(userId, method, amountRial);
    }

    return { bankAccount, destination };
  }

  async createManual(
    userId: string,
    dto: {
      method: ManualDepositMethod;
      amountRial: number;
      sourceCardId: string;
    },
    idempotencyKey?: string,
  ) {
    if (!Number.isSafeInteger(dto.amountRial) || dto.amountRial <= 0) {
      throw new BadRequestException('مبلغ معتبر نیست');
    }

    if (idempotencyKey) {
      const existing = await this.prisma.depositRequest.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (existing.userId !== userId) {
          throw businessRuleViolation(
            new ForbiddenException('کلید درخواست معتبر نیست'),
            'deposit.idempotency_key_foreign',
          );
        }
        return this.getOne(userId, existing.id);
      }
    }

    const { bankAccount, destination } = await this.prepareManual(
      userId,
      dto.method,
      dto.sourceCardId,
      dto.amountRial,
    );

    const windowHours = Math.max(
      1,
      await this.systemConfig.getNumber(
        'deposit.manual.receipt_window_hours',
        24,
      ),
    );
    const expiresAt = new Date(Date.now() + windowHours * 60 * 60 * 1000);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

        const deposit = await tx.depositRequest.create({
          data: {
            requestNumber: await this.sequence.next(tx, 'DEP'),
            userId,
            walletId: wallet.id,
            amountRial: dto.amountRial,
            method: dto.method,
            status: 'PENDING_PAYMENT',
            depositTrackingId: await this.tracking.generate(tx),
            destinationSnapshot: {
              ...destination,
              source: {
                bankName: bankAccount.bankName,
                cardNumber: bankAccount.cardNumber,
                sheba: bankAccount.sheba,
              },
            },
            idempotencyKey: idempotencyKey ?? null,
            expiresAt,
          },
        });
        return deposit.id;
      });

      this.logger.log(
        `[Deposit] درخواست واریز ${dto.method} ایجاد شد — کاربر ${userId} مبلغ ${dto.amountRial}`,
      );
      return this.getOne(userId, created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        idempotencyKey
      ) {
        const existing = await this.prisma.depositRequest.findUnique({
          where: { idempotencyKey },
        });
        if (existing) return this.getOne(userId, existing.id);
      }
      throw err;
    }
  }

  private async manualDestination(method: ManualDepositMethod) {
    if (method === 'CARD_TO_CARD') {
      const [card, owner] = await Promise.all([
        this.systemConfig.get('deposit.card_to_card.destination_card'),
        this.systemConfig.get('deposit.card_to_card.destination_owner'),
      ]);
      if (!card) {
        throw new BadRequestException(
          'اطلاعات کارت مقصد در تنظیمات سیستم کامل نشده است',
        );
      }
      return { owner, bank: '', accountNumber: '', sheba: '', card };
    }
    const [owner, accountNumber, sheba] = await Promise.all([
      this.systemConfig.get('deposit.bank_transfer.destination_owner'),
      this.systemConfig.get('deposit.bank_transfer.destination_account'),
      this.systemConfig.get('deposit.bank_transfer.destination_sheba'),
    ]);
    if (!sheba && !accountNumber) {
      throw new BadRequestException(
        'اطلاعات حساب مقصد در تنظیمات سیستم کامل نشده است',
      );
    }
    return { owner, bank: '', accountNumber, sheba, card: '' };
  }

  /** حداقل/حداکثر و سقف روزانه — بر اساس درخواست‌های واریز همین روش، نه متن تراکنش */
  private async assertManualAmount(
    userId: string,
    method: ManualDepositMethod,
    amountRial: number,
  ) {
    const key = MANUAL_CONFIG_KEY[method];
    const [min, max, dailyLimit] = await Promise.all([
      this.systemConfig.getNumber(`deposit.${key}.min_amount`, 100_000),
      this.systemConfig.getNumber(
        `deposit.${key}.max_amount`,
        method === 'CARD_TO_CARD' ? 150_000_000 : 0,
      ),
      this.systemConfig.getNumber(`deposit.${key}.daily_limit`, 0),
    ]);
    const toman = (rial: number) => (rial / 10).toLocaleString('fa-IR');

    if (amountRial < min) {
      throw new BadRequestException(`حداقل مبلغ ${toman(min)} تومان است`);
    }
    if (max > 0 && amountRial > max) {
      throw new BadRequestException(`حداکثر مبلغ ${toman(max)} تومان است`);
    }
    if (dailyLimit <= 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const used = await this.prisma.depositRequest.aggregate({
      where: {
        userId,
        method,
        createdAt: { gte: today },
        status: {
          in: [
            'PENDING_PAYMENT',
            'RECEIPT_UPLOADED',
            'UNDER_REVIEW',
            'APPROVED',
          ],
        },
      },
      _sum: { amountRial: true },
    });
    const usedRial = Number(used._sum.amountRial ?? 0);
    if (usedRial + amountRial > dailyLimit) {
      throw new BadRequestException(
        `سقف واریز روزانه این روش ${toman(dailyLimit)} تومان است. باقی‌مانده: ${toman(Math.max(0, dailyLimit - usedRial))} تومان`,
      );
    }
  }

  private async assertIdentityVerified(
    userId: string,
    message = 'برای واریز مبالغ بالا ابتدا احراز هویت خود را تکمیل کنید',
  ) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (identity?.status !== 'VERIFIED') {
      throw new ForbiddenException(message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ── بارگذاری رسید ──
  // ═══════════════════════════════════════════════════════════

  async uploadReceipt(
    userId: string,
    depositId: string,
    file: Express.Multer.File,
    userNote?: string,
  ) {
    const deposit = await this.prisma.depositRequest.findFirst({
      where: { id: depositId, userId },
    });
    if (!deposit) throw new NotFoundException('درخواست واریز یافت نشد');

    assertTransition(deposit.status, 'RECEIPT_UPLOADED');

    if (deposit.rejectionCount >= MAX_REJECTIONS) {
      throw new BadRequestException(
        'تعداد دفعات ارسال رسید به حداکثر رسیده است. با پشتیبانی تماس بگیرید',
      );
    }

    // آپلود خارج از تراکنش: عملیات شبکه‌ای طولانی نباید تراکنش DB را باز نگه دارد
    const stored = await this.storage.uploadReceiptImage(
      file,
      `deposits/${userId}/${depositId}`,
    );

    // سیگنال ضدتقلب — همان تصویر فیش برای دو درخواست مختلف
    const duplicate = await this.prisma.depositReceipt.findFirst({
      where: {
        checksumSha256: stored.checksumSha256,
        depositRequestId: { not: depositId },
      },
      select: { depositRequestId: true },
    });
    if (duplicate) {
      this.logger.warn(
        `[Deposit][ALERT] رسید تکراری — کاربر ${userId}، درخواست ${depositId}، ` +
          `تصویر قبلاً برای ${duplicate.depositRequestId} استفاده شده`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;
      const fresh = await tx.depositRequest.findUnique({
        where: { id: depositId },
      });
      if (!fresh) throw new NotFoundException('درخواست واریز یافت نشد');

      assertTransition(fresh.status, 'RECEIPT_UPLOADED');

      await tx.depositReceipt.create({
        data: {
          depositRequestId: depositId,
          storageKey: stored.storageKey,
          bucket: stored.bucket,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          checksumSha256: stored.checksumSha256,
          userNote: userNote?.trim()?.slice(0, 500) || null,
        },
      });

      await tx.depositRequest.update({
        where: { id: depositId },
        data: { status: 'RECEIPT_UPLOADED' },
      });
    });

    return {
      message: 'رسید با موفقیت ارسال شد و در صف بررسی قرار گرفت',
      duplicateSuspected: Boolean(duplicate),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ── لغو توسط کاربر ──
  // ═══════════════════════════════════════════════════════════

  async cancel(userId: string, depositId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;
      const deposit = await tx.depositRequest.findFirst({
        where: { id: depositId, userId },
      });
      if (!deposit) throw new NotFoundException('درخواست واریز یافت نشد');

      if (deposit.status === 'CANCELLED') {
        return {
          message: 'این درخواست قبلاً لغو شده است',
          alreadyProcessed: true,
        };
      }
      assertTransition(deposit.status, 'CANCELLED');

      await tx.depositRequest.update({
        where: { id: depositId },
        data: { status: 'CANCELLED' },
      });

      if (deposit.proformaInvoiceId) {
        await tx.invoice.update({
          where: { id: deposit.proformaInvoiceId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'لغو درخواست واریز توسط کاربر',
          },
        });
      }

      return { message: 'درخواست واریز لغو شد', alreadyProcessed: false };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ── خواندن ──
  // ═══════════════════════════════════════════════════════════

  async list(
    userId: string,
    query: { status?: DepositStatusValue; page?: number; limit?: number },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const where: Prisma.DepositRequestWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.depositRequest.count({ where }),
      this.prisma.depositRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          proformaInvoice: { select: { id: true, invoiceNumber: true } },
          _count: { select: { receipts: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      items: rows.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        amountRial: r.amountRial.toString(),
        method: r.method,
        status: r.status,
        statusLabel: STATUS_LABEL[r.status],
        depositTrackingId: r.depositTrackingId,
        proformaInvoiceId: r.proformaInvoice?.id ?? null,
        receiptCount: r._count.receipts,
        createdAtJalali: formatJalaliDate(r.createdAt),
        expiresAtJalali: formatJalaliDateTime(r.expiresAt),
      })),
    };
  }

  async getOne(userId: string, depositId: string) {
    const d = await this.prisma.depositRequest.findFirst({
      where: { id: depositId, userId },
      include: {
        proformaInvoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
        receipts: {
          orderBy: { uploadedAt: 'desc' },
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            userNote: true,
            uploadedAt: true,
          },
        },
      },
    });
    if (!d) throw new NotFoundException('درخواست واریز یافت نشد');

    return {
      id: d.id,
      requestNumber: d.requestNumber,
      amountRial: d.amountRial.toString(),
      method: d.method,
      status: d.status,
      statusLabel: STATUS_LABEL[d.status],
      depositTrackingId: d.depositTrackingId,
      destination: d.destinationSnapshot,
      proformaInvoiceId: d.proformaInvoice?.id ?? null,
      proformaInvoiceNumber: d.proformaInvoice?.invoiceNumber ?? null,
      rejectionReason: d.rejectionReason,
      rejectionCount: d.rejectionCount,
      canUploadReceipt:
        ['PENDING_PAYMENT', 'REJECTED'].includes(d.status) &&
        d.rejectionCount < MAX_REJECTIONS,
      canCancel: ['PENDING_PAYMENT', 'RECEIPT_UPLOADED'].includes(d.status),
      createdAt: d.createdAt.toISOString(),
      createdAtJalali: formatJalaliDateTime(d.createdAt),
      expiresAt: d.expiresAt.toISOString(),
      expiresAtJalali: formatJalaliDateTime(d.expiresAt),
      reviewedAtJalali: d.reviewedAt
        ? formatJalaliDateTime(d.reviewedAt)
        : null,
      receipts: d.receipts.map((r) => ({
        ...r,
        uploadedAtJalali: formatJalaliDateTime(r.uploadedAt),
      })),
    };
  }

  /** URL امضاشده رسید برای خود کاربر (ادمین مسیر جداگانه دارد). */
  async getReceiptUrl(userId: string, depositId: string, receiptId: string) {
    const receipt = await this.prisma.depositReceipt.findFirst({
      where: {
        id: receiptId,
        depositRequestId: depositId,
        depositRequest: { userId },
      },
    });
    if (!receipt) throw new NotFoundException('رسید یافت نشد');

    return {
      url: await this.storage.getSignedReadUrl(receipt.storageKey, 120),
      expiresInSeconds: 120,
    };
  }
}
