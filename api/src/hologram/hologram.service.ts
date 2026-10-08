// api/src/hologram/hologram.service.ts
//
// هسته دامنه اصالت‌سنجی: تولید دسته/کد هولوگرام، تخصیص به سفارش، ابطال، جستجوی
// ادمین و استعلام عمومی اصالت. منطق انتقال مالکیت (درخواست/تأیید/رد) در
// HologramTransferService است — اینجا فقط نقطه ورودی assignCode با آن تعامل دارد.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { HologramTransferService } from './hologram-transfer.service';
import { HologramSecurityService } from './hologram-security.service';
import { Prisma } from '../generated/prisma/client';
import {
  generateHologramCode,
  isValidHologramCodeFormat,
  maskNationalCode,
} from './hologram-code.util';
import {
  ACTIVE_INCIDENT_STATUSES,
  assertNoActiveIncident,
  findActiveIncident,
  INCIDENT_STATUS_FA,
  INCIDENT_TYPE_FA,
} from './hologram-incident.util';
import {
  AssignHologramCodeDto,
  CreateHologramBatchDto,
  GetHologramCodesQueryDto,
  GetHologramInquiryLogsQueryDto,
  HologramInquiryChannel,
  HologramInquiryResult,
} from '@arkan-gold/shared';

const MAX_GENERATION_RETRIES_PER_CODE = 5;

export interface VerifyContext {
  ipAddress: string;
  userAgent?: string;
  channel: HologramInquiryChannel;
  userId?: string;
  /** کارشناس/نماینده‌ای که از پنل ادمین یا پرتال نماینده استعلام گرفته */
  adminUserId?: string;
  /** نماینده‌ی استعلام‌کننده — برای اعلام اینکه شمش در امانت همین نماینده است یا نه */
  agentId?: string;
  maskNationalCodeInResponse: boolean;
  /** کد ملی کامل مالک نمایش داده شود (فقط پنل ادمین) */
  revealNationalCode?: boolean;
}

/** هشدار سرقت/مفقودی در پاسخ استعلام */
export interface VerifyIncidentAlert {
  type: 'THEFT' | 'LOSS';
  typeLabel: string;
  status: 'OPEN' | 'CONFIRMED';
  statusLabel: string;
  reportNumber: string;
  reportedAt: string;
  message: string;
}

export interface VerifyResponse {
  status: 'INVALID_CODE' | 'VALID_UNASSIGNED' | 'VALID_ASSIGNED';
  message: string;
  product?: {
    weightGrams: string | null;
    purityKarat: string | null;
    factorySerialNumber: string | null;
    mintedAt: string | null;
    batchNumber: string;
  };
  owner?: {
    fullName: string;
    nationalCode: string;
    ownershipStartAt: string;
  } | null;
  /** فقط وقتی شمش گزارش سرقت/مفقودی فعال دارد */
  incident?: VerifyIncidentAlert | null;
  /** فقط در پرتال نماینده */
  custody?: { atThisAgent: boolean; atAnotherAgent: boolean };
}

@Injectable()
export class HologramService {
  private readonly logger = new Logger(HologramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentSequence: DocumentSequenceService,
    private readonly transferService: HologramTransferService,
    private readonly security: HologramSecurityService,
  ) {}

  // ══════════════════════════════════════════
  // دسته‌های هولوگرام (ادمین)
  // ══════════════════════════════════════════
  //
  // ⚠ تولید کدها عمداً در یک تراکنش تعاملی طولانی انجام نمی‌شود: Prisma
  // Accelerate تراکنش‌های تعاملی را به حداکثر ۱۵ ثانیه محدود می‌کند
  // (P6005)، و برای دسته‌های بزرگ (تا ۱۰٬۰۰۰ کد) ساخت یک‌به‌یک هر کد به‌صورت
  // sequential (هر کدام یک round-trip جدا) به‌سادگی از این سقف عبور می‌کند.
  // به‌جای آن: شماره دسته در یک تراکنش کوتاه گرفته می‌شود، رکورد دسته با یک
  // insert ساده ساخته می‌شود، و کدها دسته‌جمعی (createMany) درج می‌شوند —
  // برخورد با کد تکراری (که عملاً نادر است) با skipDuplicates + چند دور
  // تلاش مجدد پوشش داده می‌شود، بدون نیاز به هیچ تراکنش تعاملی.
  async createBatch(adminId: string, dto: CreateHologramBatchDto) {
    const batchNumber = await this.prisma.$transaction((tx) =>
      this.documentSequence.next(tx, 'HOLO'),
    );

    const batch = await this.prisma.hologramBatch.create({
      data: {
        batchNumber,
        quantity: dto.quantity,
        notes: dto.notes,
        createdByAdminId: adminId,
      },
    });

    const codes = await this.generateUniqueCodesForBatch(
      batch.id,
      dto.quantity,
    );

    this.logger.log(
      `[Hologram] دسته ${batch.batchNumber} با ${dto.quantity} کد توسط ادمین ${adminId} ساخته شد`,
    );

    return { ...batch, codes };
  }

  private async generateUniqueCodesForBatch(
    batchId: string,
    quantity: number,
  ): Promise<string[]> {
    const confirmed = new Set<string>();

    for (
      let round = 0;
      round < MAX_GENERATION_RETRIES_PER_CODE && confirmed.size < quantity;
      round++
    ) {
      const needed = quantity - confirmed.size;
      const candidates = new Set<string>();
      while (candidates.size < needed) {
        candidates.add(generateHologramCode());
      }

      await this.prisma.hologramCode.createMany({
        data: [...candidates].map((code) => ({ code, batchId })),
        skipDuplicates: true, // برخورد نادر با کدی که قبلاً (در دسته دیگر) ساخته شده
      });

      const inserted = await this.prisma.hologramCode.findMany({
        where: { batchId, code: { in: [...candidates] } },
        select: { code: true },
      });
      for (const row of inserted) confirmed.add(row.code);
    }

    if (confirmed.size < quantity) {
      throw new ConflictException(
        'تولید کدهای یکتای هولوگرام برای این دسته پس از چند تلاش ناموفق بود',
      );
    }

    return [...confirmed];
  }

  async listBatches(query: { page: number; limit: number }) {
    const [items, total] = await Promise.all([
      this.prisma.hologramBatch.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          createdByAdmin: { select: { id: true, fullName: true } },
          _count: { select: { codes: true } },
        },
      }),
      this.prisma.hologramBatch.count(),
    ]);
    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** خروجی قابل چاپ یک دسته (بند ۳.۱) */
  async getBatchPrintExport(batchId: string) {
    const batch = await this.prisma.hologramBatch.findUnique({
      where: { id: batchId },
      include: { codes: { orderBy: { createdAt: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('دسته یافت نشد');
    return {
      batchNumber: batch.batchNumber,
      quantity: batch.quantity,
      createdAt: batch.createdAt,
      codes: batch.codes.map((c) => c.code),
    };
  }

  // ══════════════════════════════════════════
  // کدهای هولوگرام (ادمین)
  // ══════════════════════════════════════════
  async listCodes(query: GetHologramCodesQueryDto) {
    const where: Prisma.HologramCodeWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.flagged
        ? {
            incidentReports: {
              some: { status: { in: [...ACTIVE_INCIDENT_STATUSES] } },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search } },
              {
                factorySerialNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                ownerships: {
                  some: {
                    status: 'ACTIVE',
                    OR: [
                      {
                        fullName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      { nationalCode: { contains: query.search } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.hologramCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          batch: { select: { id: true, batchNumber: true } },
          product: { select: { id: true, name: true } },
          variant: { select: { id: true, weightGrams: true } },
          ownerships: { where: { status: 'ACTIVE' }, take: 1 },
          agent: { select: { id: true, code: true, name: true } },
          incidentReports: {
            where: { status: { in: [...ACTIVE_INCIDENT_STATUSES] } },
            take: 1,
            select: {
              id: true,
              reportNumber: true,
              type: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.hologramCode.count({ where }),
    ]);

    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getCodeDetail(code: string) {
    const hologramCode = await this.prisma.hologramCode.findUnique({
      where: { code },
      include: {
        batch: true,
        product: true,
        variant: true,
        ownerships: { orderBy: { ownershipStartAt: 'desc' } },
        transferRequests: { orderBy: { requestedAt: 'desc' } },
        agent: { select: { id: true, code: true, name: true } },
        incidentReports: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            reportNumber: true,
            type: true,
            status: true,
            description: true,
            createdAt: true,
            closedAt: true,
          },
        },
        agentSales: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            saleNumber: true,
            status: true,
            totalRial: true,
            createdAt: true,
            agent: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!hologramCode) throw new NotFoundException('کد هولوگرام یافت نشد');
    return hologramCode;
  }

  // ══════════════════════════════════════════
  // تخصیص کد به سفارش (اپراتور ادمین، پیش از ارسال) — بند ۳.۲
  // ══════════════════════════════════════════
  async assignCode(adminId: string, code: string, dto: AssignHologramCodeDto) {
    if (!isValidHologramCodeFormat(code)) {
      throw new BadRequestException('کد هولوگرام معتبر نیست');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" = ${code} FOR UPDATE`;

        const hologramCode = await tx.hologramCode.findUnique({
          where: { code },
        });
        if (!hologramCode) throw new NotFoundException('کد هولوگرام یافت نشد');
        if (hologramCode.status !== 'UNASSIGNED') {
          throw new ConflictException(
            'این کد هولوگرام قبلاً تخصیص یافته یا باطل شده است',
          );
        }
        await assertNoActiveIncident(tx, hologramCode.id);

        const item = await tx.shopOrderItem.findUnique({
          where: { id: dto.shopOrderItemId },
          include: {
            order: true,
            hologramCode: true,
            variant: true,
            product: true,
          },
        });
        if (!item) throw new NotFoundException('آیتم سفارش یافت نشد');
        if (item.hologramCode) {
          throw new ConflictException(
            'برای این آیتم سفارش قبلاً یک کد هولوگرام تخصیص یافته است',
          );
        }

        await tx.hologramCode.update({
          where: { id: hologramCode.id },
          data: {
            productId: item.productId,
            variantId: item.variantId,
            weightGrams:
              item.selectedWeightGrams ?? item.variant?.weightGrams ?? null,
            purityKarat: item.product?.purityKarat ?? null,
            factorySerialNumber: dto.factorySerialNumber,
            mintedAt: dto.mintedAt ? new Date(dto.mintedAt) : null,
            shopOrderItemId: item.id,
            assignedByAdminId: adminId,
            assignedAt: new Date(),
          },
        });

        if (item.recipientType === 'OTHER') {
          if (!item.recipientPhoneNumber) {
            throw new BadRequestException(
              'شماره موبایل گیرنده برای این آیتم ثبت نشده است',
            );
          }
          await this.transferService.createAdminInitiated(tx, {
            hologramCodeId: hologramCode.id,
            shopOrderItemId: item.id,
            recipientPhoneNumber: item.recipientPhoneNumber,
            initiatedByAdminId: adminId,
          });
          await tx.hologramCode.update({
            where: { id: hologramCode.id },
            data: { status: 'TRANSFER_PENDING' },
          });
          return {
            status: 'TRANSFER_PENDING' as const,
            message: 'کد به آیتم تخصیص یافت و برای تأیید گیرنده ارسال شد',
          };
        }

        // خرید برای خود — نیازمند احراز هویت تکمیل‌شده خریدار برای snapshot نام/کدملی
        const buyer = await tx.user.findUnique({
          where: { id: item.order.userId },
          include: { identity: true },
        });
        if (!buyer?.identity || buyer.identity.status !== 'VERIFIED') {
          throw new ConflictException(
            'خریدار هنوز احراز هویت خود را تکمیل نکرده است',
          );
        }

        await tx.hologramOwnership.create({
          data: {
            hologramCodeId: hologramCode.id,
            ownerUserId: buyer.id,
            shopOrderId: item.orderId,
            fullName:
              `${buyer.identity.firstName ?? ''} ${buyer.identity.lastName ?? ''}`.trim(),
            nationalCode: buyer.identity.nationalCode ?? '',
            status: 'ACTIVE',
            transferType: 'INITIAL_PURCHASE',
          },
        });
        await tx.hologramCode.update({
          where: { id: hologramCode.id },
          data: { status: 'ASSIGNED' },
        });

        this.logger.log(
          `[Hologram] کد ${code} توسط ادمین ${adminId} به خریدار ${buyer.id} تخصیص یافت`,
        );
        return {
          status: 'ASSIGNED' as const,
          message: 'کد با موفقیت تخصیص یافت',
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  // ══════════════════════════════════════════
  // ابطال کد — فقط پیش از نهایی‌شدن مالکیت (چاپ اشتباه و مشابه)
  // ══════════════════════════════════════════
  async revokeCode(adminId: string, code: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" = ${code} FOR UPDATE`;
      const hologramCode = await tx.hologramCode.findUnique({
        where: { code },
      });
      if (!hologramCode) throw new NotFoundException('کد هولوگرام یافت نشد');
      if (hologramCode.status === 'REVOKED') {
        return { message: 'این کد قبلاً باطل شده است', alreadyProcessed: true };
      }
      if (hologramCode.status === 'ASSIGNED') {
        throw new ConflictException(
          'کد تخصیص‌یافته با مالک فعال را نمی‌توان مستقیماً باطل کرد؛ ابتدا از فرآیند انتقال مالکیت استفاده کنید',
        );
      }
      if (hologramCode.status === 'AT_AGENT') {
        throw new ConflictException(
          'این شمش به‌صورت امانی نزد نماینده است؛ ابتدا آن را از نماینده عودت بگیرید',
        );
      }

      if (hologramCode.status === 'TRANSFER_PENDING') {
        await this.transferService.cancelPendingForCode(
          tx,
          hologramCode.id,
          'ابطال کد توسط ادمین',
        );
      }

      await tx.hologramCode.update({
        where: { id: hologramCode.id },
        data: {
          status: 'REVOKED',
          revokedByAdminId: adminId,
          revokedAt: new Date(),
          revokeReason: reason,
        },
      });

      this.logger.log(
        `[Hologram] کد ${code} توسط ادمین ${adminId} باطل شد${reason ? ` (${reason})` : ''}`,
      );
      return { message: 'کد با موفقیت باطل شد', alreadyProcessed: false };
    });
  }

  // ══════════════════════════════════════════
  // استعلام عمومی اصالت — بند ۳.۶ / ۴.۱
  // ══════════════════════════════════════════
  async verify(rawCode: string, ctx: VerifyContext): Promise<VerifyResponse> {
    const start = Date.now();
    let result: HologramInquiryResult | undefined;
    let hologramCodeId: string | undefined;
    let incidentReportId: string | undefined;
    let response: VerifyResponse;

    try {
      if (!isValidHologramCodeFormat(rawCode)) {
        result = HologramInquiryResult.INVALID_CODE;
        response = {
          status: 'INVALID_CODE',
          message: 'کد وارد شده معتبر نیست',
        };
        return response;
      }

      const hologramCode = await this.prisma.hologramCode.findUnique({
        where: { code: rawCode },
        include: {
          batch: { select: { batchNumber: true } },
          ownerships: { where: { status: 'ACTIVE' }, take: 1 },
        },
      });

      if (!hologramCode) {
        result = HologramInquiryResult.INVALID_CODE;
        response = {
          status: 'INVALID_CODE',
          message: 'کد وارد شده معتبر نیست',
        };
        return response;
      }

      hologramCodeId = hologramCode.id;
      const activeOwnership = hologramCode.ownerships[0];
      const incident = await findActiveIncident(this.prisma, hologramCode.id);
      incidentReportId = incident?.id;
      const incidentAlert = incident ? this.toIncidentAlert(incident) : null;
      const custody = ctx.agentId
        ? {
            atThisAgent:
              hologramCode.status === 'AT_AGENT' &&
              hologramCode.agentId === ctx.agentId,
            atAnotherAgent:
              hologramCode.status === 'AT_AGENT' &&
              hologramCode.agentId !== ctx.agentId,
          }
        : undefined;

      if (!activeOwnership) {
        result = HologramInquiryResult.VALID_UNASSIGNED;
        response = {
          status: 'VALID_UNASSIGNED',
          message:
            incidentAlert?.message ?? 'این شمش هنوز به مالکی تخصیص نیافته است',
          incident: incidentAlert,
          ...(custody ? { custody } : {}),
        };
        return response;
      }

      const isOwner =
        !!ctx.userId && activeOwnership.ownerUserId === ctx.userId;
      result = HologramInquiryResult.VALID_ASSIGNED;
      response = {
        status: 'VALID_ASSIGNED',
        message: incidentAlert?.message ?? 'اصالت این شمش تأیید می‌شود',
        product: {
          weightGrams: hologramCode.weightGrams?.toString() ?? null,
          purityKarat: hologramCode.purityKarat,
          factorySerialNumber: hologramCode.factorySerialNumber,
          mintedAt: hologramCode.mintedAt?.toISOString() ?? null,
          batchNumber: hologramCode.batch.batchNumber,
        },
        owner: {
          fullName: activeOwnership.fullName,
          // FDP_ACC_EXT.1.5 — کد ملی کامل فقط به خود مالک (و کارشناس پنل ادمین) نشان
          // داده می‌شود؛ برای هر استعلام‌کننده‌ی دیگری (حتی کاربر واردشده) پوشانده است
          nationalCode:
            ctx.revealNationalCode ||
            (!ctx.maskNationalCodeInResponse && isOwner)
              ? activeOwnership.nationalCode
              : maskNationalCode(activeOwnership.nationalCode),
          ownershipStartAt: activeOwnership.ownershipStartAt.toISOString(),
        },
        incident: incidentAlert,
        ...(custody ? { custody } : {}),
      };
      return response;
    } finally {
      // این بلوک همیشه اجرا می‌شود، حتی اگر throw رخ دهد — تا لاگ append-only
      // و شمارش نرخ هیچ‌وقت به دلیل خطای غیرمنتظره از قلم نیفتد.
      const finalResult = result ?? HologramInquiryResult.INVALID_CODE;
      await Promise.allSettled([
        this.prisma.hologramInquiryLog.create({
          data: {
            code: rawCode,
            hologramCodeId,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            channel: ctx.channel,
            result: finalResult,
            userId: ctx.userId,
            adminUserId: ctx.adminUserId,
            incidentReportId,
          },
        }),
        // استعلام کارشناس/نماینده‌ی واردشده در شمارش brute-force عمومی لحاظ نمی‌شود
        ctx.adminUserId
          ? Promise.resolve()
          : this.security.recordAttempt(
              ctx.ipAddress,
              finalResult !== HologramInquiryResult.INVALID_CODE,
            ),
      ]);
      if (incidentReportId) {
        this.logger.warn(
          `[Hologram] استعلام شمش گزارش‌شده ${rawCode} — کانال ${ctx.channel}، IP ${ctx.ipAddress}` +
            (ctx.userId ? `، کاربر ${ctx.userId}` : '') +
            (ctx.adminUserId ? `، حساب پنل ${ctx.adminUserId}` : ''),
        );
      }
      if (!ctx.adminUserId) await this.padResponseTime(start);
    }
  }

  private toIncidentAlert(incident: {
    type: 'THEFT' | 'LOSS';
    status: string;
    reportNumber: string;
    createdAt: Date;
  }): VerifyIncidentAlert {
    const typeLabel = INCIDENT_TYPE_FA[incident.type];
    return {
      type: incident.type,
      typeLabel,
      status: incident.status as 'OPEN' | 'CONFIRMED',
      statusLabel: INCIDENT_STATUS_FA[incident.status],
      reportNumber: incident.reportNumber,
      reportedAt: incident.createdAt.toISOString(),
      message:
        incident.type === 'THEFT'
          ? 'هشدار: این شمش به‌عنوان «سرقتی» گزارش شده است. از خرید یا پذیرش آن خودداری کنید و موضوع را به آرکان گلد اطلاع دهید.'
          : 'هشدار: این شمش به‌عنوان «مفقودی» گزارش شده است. از خرید یا پذیرش آن خودداری کنید و موضوع را به آرکان گلد اطلاع دهید.',
    };
  }

  /**
   * استعلام کارشناس از پنل ادمین — همان پاسخ استعلام (با کد ملی کامل و هشدار سرقت/مفقودی)
   * به‌همراه پرونده‌ی کامل کد؛ در لاگ استعلام با کانال ADMIN_PANEL ثبت می‌شود.
   */
  async inquireAsAdmin(
    adminUserId: string,
    code: string,
    meta: { ipAddress: string; userAgent?: string },
  ) {
    const result = await this.verify(code, {
      ...meta,
      channel: HologramInquiryChannel.ADMIN_PANEL,
      adminUserId,
      maskNationalCodeInResponse: false,
      revealNationalCode: true,
    });
    const detail =
      result.status === 'INVALID_CODE' ? null : await this.getCodeDetail(code);
    return { ...result, detail };
  }

  /**
   * تدابیر ملایم ضد timing-attack: پاسخ همیشه حداقل MIN_RESPONSE_MS طول
   * می‌کشد تا تفاوت زمانی بین «نامعتبر»/«تخصیص‌نیافته»/«تخصیص‌یافته» قابل
   * اندازه‌گیری قابل‌اتکا نباشد. این یک تضمین رمزنگارانه نیست، صرفاً هزینه
   * حمله را افزایش می‌دهد.
   */
  private async padResponseTime(start: number, minMs = 300): Promise<void> {
    const elapsed = Date.now() - start;
    if (elapsed < minMs) {
      await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
    }
  }

  async getInquiryLogs(query: GetHologramInquiryLogsQueryDto) {
    const where: Prisma.HologramInquiryLogWhereInput = {
      ...(query.ipAddress ? { ipAddress: query.ipAddress } : {}),
      ...(query.result ? { result: query.result } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.flaggedOnly ? { incidentReportId: { not: null } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.hologramInquiryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { id: true, phone: true } },
          adminUser: {
            select: {
              id: true,
              fullName: true,
              agent: { select: { id: true, code: true, name: true } },
            },
          },
          incidentReport: {
            select: { id: true, reportNumber: true, type: true },
          },
        },
      }),
      this.prisma.hologramInquiryLog.count({ where }),
    ]);

    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }
}
