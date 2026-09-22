// api/src/hologram/hologram-transfer.service.ts
//
// موتور واحد state machine درخواست انتقال مالکیت — هم برای تخصیص اولیه «خرید
// برای فرد دیگر» (initiator = ادمین، هنگام تخصیص کد به سفارش) و هم برای انتقال
// بعدی/فروش توسط خود مالک (initiator = کاربر) استفاده می‌شود (بند ۳.۵). هر دو
// مسیر به همین منطق هسته‌ای می‌رسند تا رفتار (انقضا، رد، تأیید با KYC) یکسان
// و در یک‌جا نگهداری شود.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { IdentityVerificationService } from '../integrations/services/identity-verification.service';
import { IdentityVerificationResult } from '../integrations/interfaces/identity-verification.interface';
import { Prisma } from '../generated/prisma/client';
import {
  ConfirmHologramTransferDto,
  GetHologramTransferRequestsQueryDto,
  InitiateHologramTransferDto,
} from '@arkan-gold/shared';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

interface CreateAdminInitiatedInput {
  hologramCodeId: string;
  shopOrderItemId: string;
  recipientPhoneNumber: string;
  initiatedByAdminId: string;
}

@Injectable()
export class HologramTransferService {
  private readonly logger = new Logger(HologramTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly identityVerification: IdentityVerificationService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private async withIdempotency<T>(
    scope: string,
    key: string | undefined,
    exec: () => Promise<T>,
  ): Promise<T> {
    if (!key) return exec();
    const redisKey = `idemp:hologram:${scope}:${key}`;
    const cached = await this.redis.get(redisKey);
    if (cached) return JSON.parse(cached) as T;

    const result = await exec();
    await this.redis
      .setex(redisKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(result))
      .catch(() =>
        this.logger.warn(`[Idempotency] ذخیره کلید ${redisKey} ناموفق بود`),
      );
    return result;
  }

  private async getExpiresAt(): Promise<Date> {
    const hours = await this.systemConfig.getNumber(
      'hologram.transfer.expiry_hours',
      72,
    );
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  // ══════════════════════════════════════════
  // ایجاد درخواست توسط ادمین — تخصیص اولیه «خرید برای فرد دیگر» (بند ۳.۲)
  // فراخوانی همیشه از داخل تراکنش HologramService.assignCode انجام می‌شود
  // ══════════════════════════════════════════
  async createAdminInitiated(
    tx: Prisma.TransactionClient,
    input: CreateAdminInitiatedInput,
  ) {
    const expiresAt = await this.getExpiresAt();
    const recipientUser = await tx.user.findUnique({
      where: { phone: input.recipientPhoneNumber },
    });

    return tx.ownershipTransferRequest.create({
      data: {
        hologramCodeId: input.hologramCodeId,
        shopOrderItemId: input.shopOrderItemId,
        initiatedByAdminId: input.initiatedByAdminId,
        recipientPhoneNumber: input.recipientPhoneNumber,
        recipientUserId: recipientUser?.id,
        status: 'PENDING',
        transferType: 'INITIAL_PURCHASE',
        expiresAt,
        requiresIdentityVerification: true,
      },
    });
  }

  /** لغو درخواست(های) در انتظار یک کد — مثلاً هنگام ابطال کد توسط ادمین */
  async cancelPendingForCode(
    tx: Prisma.TransactionClient,
    hologramCodeId: string,
    reason: string,
  ) {
    await tx.ownershipTransferRequest.updateMany({
      where: { hologramCodeId, status: 'PENDING' },
      data: { status: 'CANCELLED', rejectionReason: reason },
    });
  }

  // ══════════════════════════════════════════
  // آغاز انتقال توسط مالک فعلی — فروش/هدیه پس از خرید (بند ۳.۵)
  // ══════════════════════════════════════════
  async initiateByUser(
    userId: string,
    dto: InitiateHologramTransferDto,
    idempotencyKey?: string,
  ) {
    return this.withIdempotency(
      'initiate',
      idempotencyKey ? `${userId}:${idempotencyKey}` : undefined,
      () => this.initiateByUserInternal(userId, dto),
    );
  }

  private async initiateByUserInternal(
    userId: string,
    dto: InitiateHologramTransferDto,
  ) {
    const expiresAt = await this.getExpiresAt();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${dto.hologramCodeId}::uuid FOR UPDATE`;

        const code = await tx.hologramCode.findUnique({
          where: { id: dto.hologramCodeId },
          include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
        });
        if (!code) throw new NotFoundException('شمش یافت نشد');

        const activeOwnership = code.ownerships[0];
        if (!activeOwnership || activeOwnership.ownerUserId !== userId) {
          throw new ForbiddenException('شما مالک فعلی این شمش نیستید');
        }
        if (code.status !== 'ASSIGNED') {
          throw new ConflictException(
            'این شمش در حال حاضر قابل انتقال نیست (وضعیت فعلی: در انتظار تأیید انتقال دیگری)',
          );
        }

        const recipientUser = await tx.user.findUnique({
          where: { phone: dto.recipientPhoneNumber },
        });
        if (recipientUser?.id === userId) {
          throw new BadRequestException(
            'نمی‌توانید شمش را به خودتان منتقل کنید',
          );
        }

        const request = await tx.ownershipTransferRequest.create({
          data: {
            hologramCodeId: code.id,
            initiatedByUserId: userId,
            recipientPhoneNumber: dto.recipientPhoneNumber,
            recipientUserId: recipientUser?.id,
            status: 'PENDING',
            transferType: 'GIFT_TRANSFER',
            expiresAt,
            requiresIdentityVerification: true,
          },
        });

        await tx.hologramCode.update({
          where: { id: code.id },
          data: { status: 'TRANSFER_PENDING' },
        });

        this.logger.log(
          `[HologramTransfer] کاربر ${userId} انتقال شمش ${code.id} را آغاز کرد`,
        );
        return request;
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }

  // ══════════════════════════════════════════
  // لیست درخواست‌های ورودی برای گیرنده (بر اساس شماره موبایل حساب لاگین‌شده)
  // ══════════════════════════════════════════
  async listIncoming(recipientPhoneNumber: string) {
    return this.prisma.ownershipTransferRequest.findMany({
      where: { recipientPhoneNumber, status: 'PENDING' },
      orderBy: { requestedAt: 'desc' },
      include: {
        hologramCode: {
          include: { batch: { select: { batchNumber: true } } },
        },
      },
    });
  }

  async getOwn(userPhone: string, requestId: string) {
    const request = await this.prisma.ownershipTransferRequest.findUnique({
      where: { id: requestId },
      include: { hologramCode: true },
    });
    if (!request || request.recipientPhoneNumber !== userPhone) {
      throw new NotFoundException('درخواست انتقال یافت نشد');
    }
    return request;
  }

  // ══════════════════════════════════════════
  // تأیید انتقال توسط گیرنده — احراز هویت اجباری (بند ۳.۴)
  // ══════════════════════════════════════════
  async confirm(
    userId: string,
    userPhone: string,
    requestId: string,
    dto: ConfirmHologramTransferDto,
  ) {
    // ابتدا خارج از تراکنش دیتابیس اعتبارسنجی سبک انجام می‌شود تا فراخوانی
    // سرویس بیرونی احراز هویت هیچ‌وقت هنگام نگه‌داشتن قفل ردیف انجام نشود.
    const request = await this.prisma.ownershipTransferRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.recipientPhoneNumber !== userPhone) {
      throw new NotFoundException('درخواست انتقال یافت نشد');
    }
    if (request.status === 'CONFIRMED') {
      return {
        message: 'این انتقال قبلاً تأیید شده است',
        alreadyProcessed: true,
      };
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException('این درخواست دیگر قابل تأیید نیست');
    }
    if (request.expiresAt.getTime() < Date.now()) {
      await this.expireOne(request.id);
      throw new GoneException('مهلت تأیید این درخواست به پایان رسیده است');
    }

    let civilResult: IdentityVerificationResult;
    try {
      civilResult = await this.identityVerification.verifyIdentity({
        nationalCode: dto.nationalCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate,
      });
    } catch (err) {
      this.logger.error(
        '[HologramTransfer] خطا در ارتباط با سرویس احراز هویت',
        err,
      );
      throw new ConflictException(
        'سرویس احراز هویت موقتاً در دسترس نیست. لطفاً بعداً دوباره تلاش کنید',
      );
    }

    if (!civilResult.matched) {
      throw new BadRequestException(
        'اطلاعات هویتی وارد شده با سوابق ثبت احوال مطابقت ندارد',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "ownership_transfer_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
        const fresh = await tx.ownershipTransferRequest.findUnique({
          where: { id: requestId },
        });
        if (!fresh) throw new NotFoundException('درخواست انتقال یافت نشد');
        if (fresh.status === 'CONFIRMED') {
          return {
            message: 'این انتقال قبلاً تأیید شده است',
            alreadyProcessed: true,
          };
        }
        if (fresh.status !== 'PENDING') {
          throw new ConflictException('این درخواست دیگر قابل تأیید نیست');
        }
        if (fresh.expiresAt.getTime() < Date.now()) {
          throw new GoneException('مهلت تأیید این درخواست به پایان رسیده است');
        }

        // اگر مالکیت فعال قبلی وجود دارد (انتقال بعدی/فروش)، بسته می‌شود
        await tx.hologramOwnership.updateMany({
          where: { hologramCodeId: fresh.hologramCodeId, status: 'ACTIVE' },
          data: { status: 'TRANSFERRED', ownershipEndAt: new Date() },
        });

        await tx.hologramOwnership.create({
          data: {
            hologramCodeId: fresh.hologramCodeId,
            ownerUserId: userId,
            fullName:
              `${civilResult.firstName ?? dto.firstName} ${civilResult.lastName ?? dto.lastName}`.trim(),
            nationalCode: dto.nationalCode,
            status: 'ACTIVE',
            transferType: fresh.transferType,
          },
        });

        await tx.ownershipTransferRequest.update({
          where: { id: fresh.id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            recipientUserId: userId,
            identityVerificationRef:
              civilResult.providerRequestId ??
              civilResult.civilRegistryTrackingCode ??
              null,
          },
        });

        await tx.hologramCode.update({
          where: { id: fresh.hologramCodeId },
          data: { status: 'ASSIGNED' },
        });

        this.logger.log(
          `[HologramTransfer] درخواست ${fresh.id} توسط کاربر ${userId} تأیید شد`,
        );
        return {
          message: 'انتقال مالکیت با موفقیت تأیید شد',
          alreadyProcessed: false,
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  // ══════════════════════════════════════════
  // رد انتقال توسط گیرنده
  // ══════════════════════════════════════════
  async reject(userPhone: string, requestId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "ownership_transfer_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.ownershipTransferRequest.findUnique({
        where: { id: requestId },
      });
      if (!request || request.recipientPhoneNumber !== userPhone) {
        throw new NotFoundException('درخواست انتقال یافت نشد');
      }
      if (request.status === 'REJECTED') {
        return {
          message: 'این درخواست قبلاً رد شده است',
          alreadyProcessed: true,
        };
      }
      if (request.status !== 'PENDING') {
        throw new ConflictException('این درخواست دیگر قابل رد کردن نیست');
      }

      await tx.ownershipTransferRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED', rejectionReason: reason },
      });
      await this.revertCodeAfterNonConfirmation(tx, request);

      return { message: 'درخواست انتقال رد شد', alreadyProcessed: false };
    });
  }

  /**
   * وضعیت کد پس از رد/انقضای یک درخواست:
   *  - INITIAL_PURCHASE (تخصیص اولیه هنگام خرید توسط ادمین): کد به UNASSIGNED
   *    برمی‌گردد و از آیتم سفارش جدا می‌شود تا ادمین بتواند کد دیگری تخصیص دهد
   *    (پاسخ به سؤال باز ۷.۲ سند معماری — چون گیرنده هنوز هرگز مالک نبوده،
   *    بازگرداندن به فروشنده معنا ندارد و نیاز به دخالت دستی ادمین دارد).
   *  - GIFT_TRANSFER / SALE_TRANSFER (انتقال بعدی توسط مالک فعلی): مالکیت هرگز
   *    منتقل نشده بود، پس کد فقط به ASSIGNED برمی‌گردد و نزد همان مالک می‌ماند.
   */
  private async revertCodeAfterNonConfirmation(
    tx: Prisma.TransactionClient,
    request: {
      hologramCodeId: string;
      transferType: string;
      shopOrderItemId: string | null;
    },
  ) {
    if (request.transferType === 'INITIAL_PURCHASE') {
      await tx.hologramCode.update({
        where: { id: request.hologramCodeId },
        data: {
          status: 'UNASSIGNED',
          shopOrderItemId: null,
          assignedByAdminId: null,
          assignedAt: null,
        },
      });
    } else {
      await tx.hologramCode.update({
        where: { id: request.hologramCodeId },
        data: { status: 'ASSIGNED' },
      });
    }
  }

  async listForAdmin(query: GetHologramTransferRequestsQueryDto) {
    const where: Prisma.OwnershipTransferRequestWhereInput = query.status
      ? { status: query.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.ownershipTransferRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          hologramCode: { select: { id: true, code: true } },
          initiatedByUser: { select: { id: true, phone: true } },
          initiatedByAdmin: { select: { id: true, fullName: true } },
          recipientUser: { select: { id: true, phone: true } },
        },
      }),
      this.prisma.ownershipTransferRequest.count({ where }),
    ]);
    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  private async expireOne(requestId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "ownership_transfer_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.ownershipTransferRequest.findUnique({
        where: { id: requestId },
      });
      if (!request || request.status !== 'PENDING') return;

      await tx.ownershipTransferRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED' },
      });
      await this.revertCodeAfterNonConfirmation(tx, request);
    });
  }

  // ══════════════════════════════════════════
  // انقضای خودکار درخواست‌های بدون پاسخ (هر ساعت)
  // ══════════════════════════════════════════
  @Cron('30 * * * *', { name: 'expire-stale-hologram-transfer-requests' })
  async expireStaleRequests(): Promise<void> {
    const stale = await this.prisma.ownershipTransferRequest.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      select: { id: true },
    });
    for (const { id } of stale) {
      try {
        await this.expireOne(id);
      } catch (err) {
        this.logger.error(
          `[HologramTransfer] خطا در انقضای خودکار درخواست ${id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}
