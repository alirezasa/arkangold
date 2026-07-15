import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  AccountingService,
  LedgerLineInput,
} from '../accounting/accounting.service';
import { Prisma } from '../generated/prisma/client';
import Redis from 'ioredis';
import {
  CreatePhysicalDeliveryDto,
  ShipPhysicalDeliveryDto,
  GetPhysicalDeliveriesQueryDto,
} from '@arkan-gold/shared';

const D0 = new Prisma.Decimal(0);
const HOLD_DURATION_DAYS = 30;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class PhysicalDeliveryService {
  private readonly logger = new Logger(PhysicalDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
    private accountingService: AccountingService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  // ══════════════════════════════════════════
  private async withIdempotency<T>(
    scope: string,
    key: string | undefined,
    exec: () => Promise<T>,
  ): Promise<T> {
    if (!key) return exec();
    const redisKey = `idemp:pd:${scope}:${key}`;
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

  // ══════════════════════════════════════════
  async getConfig(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { limits: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const [feePerGramRial, processingTime] = await Promise.all([
      this.systemConfig.getDecimal(
        'physical_delivery.fee_per_gram_rial',
        '250000',
      ),
      this.systemConfig.get(
        'physical_delivery.processing_time',
        '۳ تا ۷ روز کاری',
      ),
    ]);

    return {
      minGrams: Number(user.limits?.physicalDeliveryMinGrams ?? 1),
      maxGrams: Number(user.limits?.physicalDeliveryMaxGrams ?? 500),
      feePerGramToman: feePerGramRial.dividedBy(10).toString(),
      processingTime,
    };
  }

  // ══════════════════════════════════════════
  // ثبت درخواست
  // ══════════════════════════════════════════
  async create(
    userId: string,
    dto: CreatePhysicalDeliveryDto,
    idempotencyKey?: string,
  ) {
    return this.withIdempotency(
      'create',
      idempotencyKey ? `${userId}:${idempotencyKey}` : undefined,
      () => this.createInternal(userId, dto),
    );
  }

  private async createInternal(userId: string, dto: CreatePhysicalDeliveryDto) {
    await this.assertUserVerified(userId);

    if (!Number.isFinite(dto.amountGrams) || dto.amountGrams <= 0) {
      throw new BadRequestException('مقدار وارد شده نامعتبر است');
    }
    const amountGrams = new Prisma.Decimal(dto.amountGrams).toDecimalPlaces(4);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { limits: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const minGrams =
      user.limits?.physicalDeliveryMinGrams ?? new Prisma.Decimal(1);
    const maxGrams =
      user.limits?.physicalDeliveryMaxGrams ?? new Prisma.Decimal(500);

    if (amountGrams.lessThan(minGrams)) {
      throw new BadRequestException(
        `حداقل مقدار درخواست تحویل فیزیکی ${minGrams.toString()} گرم است`,
      );
    }
    if (amountGrams.greaterThan(maxGrams)) {
      throw new BadRequestException(
        `حداکثر مقدار درخواست تحویل فیزیکی ${maxGrams.toString()} گرم است`,
      );
    }

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });
    if (!address) throw new NotFoundException('آدرس یافت نشد');

    // محافظت مکمل idempotency برای کلاینت‌هایی که هدر نمی‌فرستند
    const recentDuplicate = await this.prisma.physicalDeliveryRequest.findFirst(
      {
        where: {
          userId,
          addressId: dto.addressId,
          amountGrams,
          status: 'PENDING',
          createdAt: { gte: new Date(Date.now() - 15_000) },
        },
        include: { address: true, shippings: true },
      },
    );
    if (recentDuplicate) return this.toDto(recentDuplicate);

    const holdExpiresAt = new Date(
      Date.now() + HOLD_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

          const activeHolds = await tx.walletHold.findMany({
            where: { walletId: wallet.id, expiresAt: { gt: new Date() } },
          });
          const heldGrams = activeHolds.reduce(
            (s, h) => s.plus(h.amountGrams ?? D0),
            D0,
          );
          const availableGrams = wallet.goldBalanceGrams.minus(heldGrams);

          if (availableGrams.lessThan(amountGrams)) {
            throw new BadRequestException(
              `موجودی طلای قابل استفاده کافی نیست. موجودی فعلی: ${availableGrams.toString()} گرم`,
            );
          }

          const request = await tx.physicalDeliveryRequest.create({
            data: {
              userId,
              addressId: dto.addressId,
              amountGrams,
              status: 'PENDING',
            },
            include: { address: true, shippings: true },
          });

          const hold = await tx.walletHold.create({
            data: {
              walletId: wallet.id,
              amountGrams,
              holdType: 'PHYSICAL_DELIVERY',
              referenceId: request.id,
              expiresAt: holdExpiresAt,
            },
          });

          await tx.transaction.create({
            data: {
              userId,
              walletId: wallet.id,
              type: 'PHYSICAL_DELIVERY',
              amountGrams,
              status: 'PENDING',
              description: `physical_delivery|request:${request.id}|hold:${hold.id}`,
              physicalDeliveryId: request.id,
            },
          });

          return request;
        },
        { maxWait: 5000, timeout: 10000 },
      );

      return this.toDto(result);
    } catch (err) {
      throw this.translateDbError(err, userId);
    }
  }

  // ══════════════════════════════════════════
  // لغو توسط کاربر (فقط pending)
  // ══════════════════════════════════════════
  async cancelByUser(userId: string, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "physical_delivery_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.physicalDeliveryRequest.findFirst({
        where: { id: requestId, userId },
      });
      if (!request) throw new NotFoundException('درخواست یافت نشد');

      if (request.status === 'CANCELLED') {
        return {
          message: 'این درخواست قبلاً لغو شده است',
          alreadyProcessed: true,
        };
      }
      if (request.status !== 'PENDING') {
        throw new ConflictException(
          'فقط درخواست‌های در انتظار بررسی توسط کاربر قابل لغو هستند',
        );
      }

      await tx.walletHold.deleteMany({
        where: { referenceId: request.id, holdType: 'PHYSICAL_DELIVERY' },
      });
      await tx.transaction.updateMany({
        where: { physicalDeliveryId: request.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      await tx.physicalDeliveryRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED', adminNotes: 'لغو شده توسط کاربر' },
      });

      return { message: 'درخواست با موفقیت لغو شد', alreadyProcessed: false };
    });
  }

  // ══════════════════════════════════════════
  // لیست و جزئیات (کاربر)
  // ══════════════════════════════════════════
  async list(userId: string, query: GetPhysicalDeliveriesQueryDto) {
    const where: Prisma.PhysicalDeliveryRequestWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.physicalDeliveryRequest.findMany({
        where,
        include: { address: true, shippings: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.physicalDeliveryRequest.count({ where }),
    ]);

    return {
      data: items.map((r) => this.toDto(r)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getOne(userId: string, id: string) {
    const request = await this.prisma.physicalDeliveryRequest.findFirst({
      where: { id, userId },
      include: { address: true, shippings: true },
    });
    if (!request) throw new NotFoundException('درخواست یافت نشد');
    return this.toDto(request);
  }

  // ══════════════════════════════════════════
  // (ادمین) لیست همه درخواست‌ها
  // ══════════════════════════════════════════
  async adminList(query: GetPhysicalDeliveriesQueryDto) {
    const where: Prisma.PhysicalDeliveryRequestWhereInput = query.status
      ? { status: query.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.physicalDeliveryRequest.findMany({
        where,
        include: {
          address: true,
          shippings: true,
          user: { select: { id: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.physicalDeliveryRequest.count({ where }),
    ]);

    return {
      data: items.map((r) => ({ ...this.toDto(r), user: r.user })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  // ══════════════════════════════════════════
  // (ادمین) تایید
  // ══════════════════════════════════════════
  async approve(adminId: string, requestId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "physical_delivery_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
        const request = await tx.physicalDeliveryRequest.findUnique({
          where: { id: requestId },
        });
        if (!request) throw new NotFoundException('درخواست یافت نشد');

        if (request.status === 'APPROVED') {
          return {
            message: 'این درخواست قبلاً تایید شده است',
            alreadyProcessed: true,
          };
        }
        if (request.status !== 'PENDING') {
          throw new ConflictException(
            'فقط درخواست‌های در انتظار بررسی قابل تایید هستند',
          );
        }

        const hold = await tx.walletHold.findFirst({
          where: { referenceId: request.id, holdType: 'PHYSICAL_DELIVERY' },
        });
        if (!hold) {
          throw new ConflictException(
            'رزرو موجودی این درخواست یافت نشد یا منقضی شده است',
          );
        }

        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${hold.walletId}::uuid FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({
          where: { id: hold.walletId },
        });
        if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

        if (wallet.goldBalanceGrams.lessThan(request.amountGrams)) {
          throw new BadRequestException(
            'موجودی طلای کاربر برای تکمیل این درخواست کافی نیست',
          );
        }

        const feePerGramRial = await this.systemConfig.getDecimal(
          'physical_delivery.fee_per_gram_rial',
          '250000',
        );
        const feeRial = feePerGramRial
          .times(request.amountGrams)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

        if (feeRial.greaterThan(0) && wallet.rialBalance.lessThan(feeRial)) {
          throw new BadRequestException(
            `موجودی ریالی کاربر برای پرداخت کارمزد بسته‌بندی (${feeRial.dividedBy(10).toString()} تومان) کافی نیست`,
          );
        }

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            goldBalanceGrams: { decrement: request.amountGrams },
            rialBalance: feeRial.greaterThan(0)
              ? { decrement: feeRial }
              : undefined,
          },
        });

        await tx.walletHold.delete({ where: { id: hold.id } });

        await tx.transaction.updateMany({
          where: { physicalDeliveryId: request.id, status: 'PENDING' },
          data: { status: 'COMPLETED', feeAmount: feeRial },
        });

        if (feeRial.greaterThan(0)) {
          await tx.transaction.create({
            data: {
              userId: request.userId,
              walletId: wallet.id,
              type: 'FEE',
              amountRial: feeRial,
              status: 'COMPLETED',
              description: `physical_delivery_fee:${request.id}`,
              physicalDeliveryId: request.id,
            },
          });
        }

        await tx.physicalDeliveryRequest.update({
          where: { id: request.id },
          data: { status: 'APPROVED', feeRial, approvedById: adminId },
        });

        await this.postAccounting(
          tx,
          request.id,
          request.amountGrams,
          feeRial,
          false,
        );
        await this.postVaultMovement(tx, request.id, [
          {
            type: 'PHYSICAL',
            delta: request.amountGrams.times(-1),
            note: 'رزرو برای تحویل فیزیکی',
          },
          {
            type: 'RESERVED',
            delta: request.amountGrams,
            note: 'رزرو برای تحویل فیزیکی',
          },
        ]);

        this.logger.log(
          `[PhysicalDelivery] درخواست ${request.id} توسط ادمین ${adminId} تایید شد`,
        );

        return {
          message: 'درخواست تایید شد',
          requestId: request.id,
          alreadyProcessed: false,
        };
      });
    } catch (err) {
      throw this.translateDbError(err, adminId);
    }
  }

  // ══════════════════════════════════════════
  // (ادمین) ارسال مرسوله
  // ══════════════════════════════════════════
  async ship(adminId: string, requestId: string, dto: ShipPhysicalDeliveryDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "physical_delivery_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
        const request = await tx.physicalDeliveryRequest.findUnique({
          where: { id: requestId },
          include: { shippings: true },
        });
        if (!request) throw new NotFoundException('درخواست یافت نشد');

        if (request.status === 'SHIPPED') {
          return {
            message: 'این مرسوله قبلاً ارسال ثبت شده است',
            trackingCode: request.trackingCode,
            alreadyProcessed: true,
          };
        }
        if (request.status !== 'APPROVED') {
          throw new ConflictException(
            'فقط درخواست‌های تایید شده قابل ارسال هستند',
          );
        }

        await tx.physicalDeliveryRequest.update({
          where: { id: requestId },
          data: { status: 'SHIPPED', trackingCode: dto.trackingCode },
        });

        await tx.shipping.create({
          data: {
            deliveryRequestId: requestId,
            trackingCode: dto.trackingCode,
            status: 'IN_TRANSIT',
          },
        });

        await this.postVaultMovement(tx, requestId, [
          {
            type: 'RESERVED',
            delta: request.amountGrams.times(-1),
            note: 'خروج از خزانه برای ارسال',
          },
          {
            type: 'IN_TRANSIT',
            delta: request.amountGrams,
            note: 'خروج از خزانه برای ارسال',
          },
        ]);

        return {
          message: 'اطلاعات ارسال ثبت شد',
          trackingCode: dto.trackingCode,
          alreadyProcessed: false,
        };
      });
    } catch (err) {
      throw this.translateDbError(err, adminId);
    }
  }

  // ══════════════════════════════════════════
  // (ادمین) تحویل نهایی
  // ══════════════════════════════════════════
  async deliver(adminId: string, requestId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "physical_delivery_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
        const request = await tx.physicalDeliveryRequest.findUnique({
          where: { id: requestId },
          include: { shippings: true },
        });
        if (!request) throw new NotFoundException('درخواست یافت نشد');

        if (request.status === 'DELIVERED') {
          return {
            message: 'این مرسوله قبلاً تحویل داده شده است',
            alreadyProcessed: true,
          };
        }
        if (request.status !== 'SHIPPED') {
          throw new ConflictException('این درخواست هنوز ارسال نشده است');
        }

        const latestShipping = request.shippings.at(-1);

        await tx.physicalDeliveryRequest.update({
          where: { id: requestId },
          data: { status: 'DELIVERED' },
        });
        if (latestShipping) {
          await tx.shipping.update({
            where: { id: latestShipping.id },
            data: { status: 'DELIVERED', deliveredAt: new Date() },
          });
        }

        await this.postVaultMovement(tx, requestId, [
          {
            type: 'IN_TRANSIT',
            delta: request.amountGrams.times(-1),
            note: 'تحویل نهایی به مشتری',
          },
        ]);

        return { message: 'تحویل با موفقیت ثبت شد', alreadyProcessed: false };
      });
    } catch (err) {
      throw this.translateDbError(err, adminId);
    }
  }

  // ══════════════════════════════════════════
  // (ادمین) لغو — از PENDING یا APPROVED
  // ══════════════════════════════════════════
  async adminCancel(adminId: string, requestId: string, reason?: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "physical_delivery_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
        const request = await tx.physicalDeliveryRequest.findUnique({
          where: { id: requestId },
        });
        if (!request) throw new NotFoundException('درخواست یافت نشد');

        if (request.status === 'CANCELLED') {
          return {
            message: 'این درخواست قبلاً لغو شده است',
            alreadyProcessed: true,
          };
        }
        if (request.status === 'SHIPPED' || request.status === 'DELIVERED') {
          throw new ConflictException(
            'مرسوله‌ی ارسال یا تحویل‌شده قابل لغو نیست',
          );
        }

        const noteText = reason
          ? `لغو شده توسط ادمین: ${reason}`
          : 'لغو شده توسط ادمین';

        if (request.status === 'PENDING') {
          await tx.walletHold.deleteMany({
            where: { referenceId: request.id, holdType: 'PHYSICAL_DELIVERY' },
          });
          await tx.transaction.updateMany({
            where: { physicalDeliveryId: request.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          });
        } else if (request.status === 'APPROVED') {
          await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${request.userId}::uuid FOR UPDATE`;
          const wallet = await tx.wallet.findUnique({
            where: { userId: request.userId },
          });
          if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              goldBalanceGrams: { increment: request.amountGrams },
              rialBalance: request.feeRial.greaterThan(0)
                ? { increment: request.feeRial }
                : undefined,
            },
          });

          await tx.transaction.updateMany({
            where: { physicalDeliveryId: request.id, status: 'COMPLETED' },
            data: { status: 'FAILED' },
          });

          if (request.feeRial.greaterThan(0)) {
            await tx.transaction.create({
              data: {
                userId: request.userId,
                walletId: wallet.id,
                type: 'REFUND',
                amountRial: request.feeRial,
                status: 'COMPLETED',
                description: `physical_delivery_fee_refund:${request.id}`,
                physicalDeliveryId: request.id,
              },
            });
          }

          await this.postAccounting(
            tx,
            request.id,
            request.amountGrams,
            request.feeRial,
            true,
          );
          await this.postVaultMovement(tx, request.id, [
            {
              type: 'RESERVED',
              delta: request.amountGrams.times(-1),
              note: 'لغو رزرو - بازگشت به خزانه',
            },
            {
              type: 'PHYSICAL',
              delta: request.amountGrams,
              note: 'لغو رزرو - بازگشت به خزانه',
            },
          ]);
        }

        await tx.physicalDeliveryRequest.update({
          where: { id: request.id },
          data: {
            status: 'CANCELLED',
            approvedById: adminId,
            adminNotes: noteText,
          },
        });

        this.logger.log(
          `[PhysicalDelivery] درخواست ${request.id} توسط ادمین ${adminId} لغو شد`,
        );

        return {
          message: 'درخواست لغو شد',
          requestId: request.id,
          alreadyProcessed: false,
        };
      });
    } catch (err) {
      throw this.translateDbError(err, adminId);
    }
  }

  // ══════════════════════════════════════════
  // پاکسازی خودکار درخواست‌های راکد (هر ساعت)
  // ══════════════════════════════════════════
  @Cron('0 * * * *', { name: 'expire-stale-physical-delivery-requests' })
  async expireStaleRequests(): Promise<void> {
    const staleHolds = await this.prisma.walletHold.findMany({
      where: { holdType: 'PHYSICAL_DELIVERY', expiresAt: { lt: new Date() } },
    });

    for (const hold of staleHolds) {
      if (!hold.referenceId) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          const request = await tx.physicalDeliveryRequest.findUnique({
            where: { id: hold.referenceId },
          });
          if (!request || request.status !== 'PENDING') return;

          await tx.walletHold
            .delete({ where: { id: hold.id } })
            .catch(() => {});
          await tx.transaction.updateMany({
            where: { physicalDeliveryId: request.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          });
          await tx.physicalDeliveryRequest.update({
            where: { id: request.id },
            data: {
              status: 'CANCELLED',
              adminNotes: 'لغو خودکار - عدم بررسی در مهلت مقرر',
            },
          });
        });
      } catch (err) {
        this.logger.error(
          `[PhysicalDelivery] خطا در پاکسازی خودکار hold ${hold.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // ══════════════════════════════════════════
  // helpers
  // ══════════════════════════════════════════
  private async postAccounting(
    tx: Prisma.TransactionClient,
    requestId: string,
    amountGrams: Prisma.Decimal,
    feeRial: Prisma.Decimal,
    reversed: boolean,
  ) {
    const lines: LedgerLineInput[] = reversed
      ? [
          { accountCode: '2020', side: 'CREDIT', amountGrams },
          { accountCode: '1020', side: 'DEBIT', amountGrams },
        ]
      : [
          { accountCode: '2020', side: 'DEBIT', amountGrams },
          { accountCode: '1020', side: 'CREDIT', amountGrams },
        ];

    if (feeRial.greaterThan(0)) {
      lines.push(
        {
          accountCode: '2010',
          side: reversed ? 'CREDIT' : 'DEBIT',
          amountRial: feeRial,
        },
        {
          accountCode: '4010',
          side: reversed ? 'DEBIT' : 'CREDIT',
          amountRial: feeRial,
        },
      );
    }

    await this.accountingService.postJournal(tx, {
      description: `${reversed ? 'لغو' : 'تایید'} تحویل فیزیکی طلا - درخواست ${requestId}`,
      totalRial: feeRial,
      totalGrams: amountGrams,
      lines,
    });
  }

  private async postVaultMovement(
    tx: Prisma.TransactionClient,
    requestId: string,
    moves: {
      type: 'PHYSICAL' | 'RESERVED' | 'IN_TRANSIT';
      delta: Prisma.Decimal;
      note: string;
    }[],
  ) {
    await tx.vaultGoldInventory.createMany({
      data: moves.map((m) => ({
        type: m.type,
        amountGrams: m.delta,
        referenceId: requestId,
        notes: m.note,
      })),
    });
  }

  private async assertUserVerified(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, identity: { select: { status: true } } },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('حساب کاربری شما فعال نیست');
    }
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException(
        'برای ثبت درخواست تحویل فیزیکی ابتدا باید احراز هویت کنید',
      );
    }
  }

  private toDto(r: {
    id: string;
    amountGrams: Prisma.Decimal;
    feeRial: Prisma.Decimal;
    status: string;
    trackingCode: string | null;
    adminNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    address: unknown;
    shippings: unknown[];
  }) {
    return {
      id: r.id,
      amountGrams: r.amountGrams.toString(),
      feeToman: r.feeRial.dividedBy(10).toString(),
      status: r.status,
      trackingCode: r.trackingCode,
      adminNotes: r.adminNotes,
      address: r.address,
      shippings: r.shippings,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private translateDbError(err: unknown, actorId: string): Error {
    if (
      err instanceof BadRequestException ||
      err instanceof NotFoundException ||
      err instanceof ForbiddenException ||
      err instanceof ConflictException
    ) {
      return err;
    }
    this.logger.error(
      `[PhysicalDelivery][UNEXPECTED] خطا برای ${actorId}:`,
      err instanceof Error ? err.stack : err,
    );
    return new BadRequestException(
      'خطایی در پردازش درخواست رخ داد. لطفاً مجدداً تلاش کنید',
    );
  }
}
