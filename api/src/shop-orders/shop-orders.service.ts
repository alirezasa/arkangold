/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

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
import { Prisma } from '../generated/prisma/client';
import Redis from 'ioredis';
import {
  CreateShopOrderDto,
  PayShopOrderDto,
  ShipShopOrderDto,
  CancelShopOrderDto,
  GetShopOrdersQueryDto,
} from '@arkan-gold/shared';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const PENDING_PAYMENT_TTL_MINUTES = 30;

@Injectable()
export class ShopOrdersService {
  private readonly logger = new Logger(ShopOrdersService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  // ══════════════════════════════════════════
  private async withIdempotency<T>(
    scope: string,
    key: string | undefined,
    exec: () => Promise<T>,
  ): Promise<T> {
    if (!key) return exec();
    const redisKey = `idemp:shop:${scope}:${key}`;
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
  // ثبت سفارش از روی سبد خرید
  // ══════════════════════════════════════════
  async checkout(
    userId: string,
    dto: CreateShopOrderDto,
    idempotencyKey?: string,
  ) {
    return this.withIdempotency(
      'checkout',
      idempotencyKey ? `${userId}:${idempotencyKey}` : undefined,
      () => this.checkoutInternal(userId, dto),
    );
  }

  private async checkoutInternal(userId: string, dto: CreateShopOrderDto) {
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });
    if (!address) throw new NotFoundException('آدرس یافت نشد');

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('سبد خرید شما خالی است');
    }

    const unavailable = cart.items.find(
      (i) => i.variant.product.status !== 'ACTIVE',
    );
    if (unavailable) {
      throw new BadRequestException(
        `محصول «${unavailable.variant.product.name}» دیگر در دسترس نیست`,
      );
    }

    // ترتیب ثابت قفل‌گیری روی واریانت‌ها بر اساس id - جلوگیری از deadlock
    // هنگامی که چند کاربر هم‌زمان سفارش با آیتم‌های مشترک ثبت می‌کنند
    const variantIds = [...new Set(cart.items.map((i) => i.variantId))].sort();

    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          for (const variantId of variantIds) {
            await tx.$executeRaw`SELECT 1 FROM "product_variants" WHERE "id" = ${variantId}::uuid FOR UPDATE`;
          }

          const freshVariants = await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
          });
          const variantMap = new Map(freshVariants.map((v) => [v.id, v]));

          let totalRial = new Prisma.Decimal(0);
          const orderItemsData: {
            variantId: string;
            quantity: number;
            priceRial: Prisma.Decimal;
          }[] = [];

          for (const item of cart.items) {
            const fresh = variantMap.get(item.variantId);
            if (!fresh) throw new NotFoundException('تنوع محصول یافت نشد');
            if (fresh.stockQuantity < item.quantity) {
              throw new BadRequestException(
                `موجودی «${item.variant.product.name}» کافی نیست (موجودی: ${fresh.stockQuantity})`,
              );
            }
            const unitPrice = item.variant.product.basePriceRial.plus(
              item.variant.priceAdjustment,
            );
            totalRial = totalRial.plus(unitPrice.times(item.quantity));
            orderItemsData.push({
              variantId: item.variantId,
              quantity: item.quantity,
              priceRial: unitPrice,
            });
          }

          const newOrder = await tx.shopOrder.create({
            data: {
              userId,
              addressId: dto.addressId,
              totalRial,
              status: 'PENDING_PAYMENT',
            },
          });

          for (const oi of orderItemsData) {
            await tx.shopOrderItem.create({
              data: {
                orderId: newOrder.id,
                variantId: oi.variantId,
                quantity: oi.quantity,
                priceRial: oi.priceRial,
              },
            });
            await tx.productVariant.update({
              where: { id: oi.variantId },
              data: { stockQuantity: { decrement: oi.quantity } },
            });
          }

          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
          return newOrder;
        },
        { maxWait: 5000, timeout: 15000 },
      );

      return this.getOne(userId, order.id);
    } catch (err) {
      throw this.translateDbError(err, userId);
    }
  }

  // ══════════════════════════════════════════
  // پرداخت
  // ══════════════════════════════════════════
  async pay(
    userId: string,
    orderId: string,
    dto: PayShopOrderDto,
    idempotencyKey?: string,
  ) {
    return this.withIdempotency(
      'pay',
      idempotencyKey ? `${userId}:${orderId}:${idempotencyKey}` : undefined,
      () => this.payInternal(userId, orderId, dto),
    );
  }

  private async payInternal(
    userId: string,
    orderId: string,
    dto: PayShopOrderDto,
  ) {
    if (dto.method !== 'WALLET') {
      throw new BadRequestException(
        'در حال حاضر فقط پرداخت از کیف پول پشتیبانی می‌شود',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.shopOrder.findFirst({
          where: { id: orderId, userId },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد');

        if (order.status === 'PAID') {
          return {
            message: 'این سفارش قبلاً پرداخت شده است',
            status: order.status,
            alreadyProcessed: true,
          };
        }
        if (order.status !== 'PENDING_PAYMENT') {
          throw new ConflictException('این سفارش قابل پرداخت نیست');
        }

        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

        if (wallet.rialBalance.lessThan(order.totalRial)) {
          await tx.payment.create({
            data: {
              userId,
              orderId: order.id,
              amountRial: order.totalRial,
              method: 'WALLET',
              status: 'FAILED',
            },
          });
          throw new BadRequestException(
            `موجودی کیف پول کافی نیست. مبلغ فاکتور: ${order.totalRial.dividedBy(10).toString()} تومان`,
          );
        }

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { rialBalance: { decrement: order.totalRial } },
        });

        const payment = await tx.payment.create({
          data: {
            userId,
            orderId: order.id,
            amountRial: order.totalRial,
            method: 'WALLET',
            status: 'SUCCESS',
            paidAt: new Date(),
          },
        });

        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'SHOP_PURCHASE',
            amountRial: order.totalRial,
            status: 'COMPLETED',
            description: `shop_order:${order.id}`,
            shopOrderId: order.id,
          },
        });

        await tx.shopOrder.update({
          where: { id: order.id },
          data: { status: 'PAID' },
        });

        this.logger.log(`[ShopOrder] سفارش ${order.id} با موفقیت پرداخت شد`);

        return {
          message: 'پرداخت با موفقیت انجام شد',
          paymentId: payment.id,
          status: 'PAID',
          alreadyProcessed: false,
        };
      });
    } catch (err) {
      throw this.translateDbError(err, userId);
    }
  }

  // ══════════════════════════════════════════
  // لغو توسط کاربر (فقط قبل از پرداخت)
  // ══════════════════════════════════════════
  async cancelByUser(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.shopOrder.findFirst({
        where: { id: orderId, userId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('سفارش یافت نشد');

      if (order.status === 'CANCELLED') {
        return {
          message: 'این سفارش قبلاً لغو شده است',
          alreadyProcessed: true,
        };
      }
      if (order.status !== 'PENDING_PAYMENT') {
        throw new ConflictException(
          'فقط سفارش‌های پرداخت‌نشده قابل لغو توسط کاربر هستند',
        );
      }

      await this.releaseStock(tx, order.items);
      await tx.shopOrder.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });

      return { message: 'سفارش لغو شد', alreadyProcessed: false };
    });
  }

  // ══════════════════════════════════════════
  // لیست/جزئیات کاربر
  // ══════════════════════════════════════════
  async list(userId: string, query: GetShopOrdersQueryDto) {
    const where: Prisma.ShopOrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: {
          items: { include: { variant: { include: { product: true } } } },
          address: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);

    return {
      data: items.map((o) => this.toDto(o)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getOne(userId: string, id: string) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id, userId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        address: true,
        payments: true,
        shippings: true,
      },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return this.toDto(order);
  }

  // ══════════════════════════════════════════
  // (ادمین)
  // ══════════════════════════════════════════
  async adminList(query: GetShopOrdersQueryDto) {
    const where: Prisma.ShopOrderWhereInput = query.status
      ? { status: query.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: {
          items: { include: { variant: { include: { product: true } } } },
          address: true,
          user: { select: { id: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);

    return {
      data: items.map((o) => ({ ...this.toDto(o), user: o.user })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async process(orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.status === 'PROCESSING') {
      return {
        message: 'این سفارش قبلاً در حال پردازش است',
        alreadyProcessed: true,
      };
    }
    if (order.status !== 'PAID') {
      throw new ConflictException('فقط سفارش‌های پرداخت‌شده قابل پردازش هستند');
    }
    await this.prisma.shopOrder.update({
      where: { id: orderId },
      data: { status: 'PROCESSING' },
    });
    return {
      message: 'سفارش به حالت پردازش تغییر یافت',
      alreadyProcessed: false,
    };
  }

  async ship(orderId: string, dto: ShipShopOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.shopOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('سفارش یافت نشد');

      if (order.status === 'SHIPPED') {
        return {
          message: 'این سفارش قبلاً ارسال شده است',
          alreadyProcessed: true,
        };
      }
      if (order.status !== 'PROCESSING') {
        throw new ConflictException(
          'فقط سفارش‌های در حال پردازش قابل ارسال هستند',
        );
      }

      await tx.shopOrder.update({
        where: { id: orderId },
        data: {
          status: 'SHIPPED',
          trackingCode: dto.trackingCode ?? order.trackingCode,
        },
      });

      await tx.shipping.create({
        data: {
          shopOrderId: orderId,
          carrierName: dto.carrierName,
          trackingCode: dto.trackingCode,
          estimatedDelivery: dto.estimatedDelivery
            ? new Date(dto.estimatedDelivery)
            : null,
          status: 'IN_TRANSIT',
        },
      });

      return { message: 'اطلاعات ارسال ثبت شد', alreadyProcessed: false };
    });
  }

  async deliver(orderId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // --- اضافه کردن این خط در ابتدای همه متدهای ادمین ---
      await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      // --------------------------------------------------

      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: { shippings: { orderBy: { createdAt: 'asc' } } },
      });
      if (!order) throw new NotFoundException('سفارش یافت نشد');

      if (order.status === 'DELIVERED') {
        return {
          message: 'این سفارش قبلاً تحویل داده شده است',
          alreadyProcessed: true,
        };
      }
      if (order.status !== 'SHIPPED') {
        throw new ConflictException('این سفارش هنوز ارسال نشده است');
      }

      const latestShipping = order.shippings.at(-1);
      await tx.shopOrder.update({
        where: { id: orderId },
        data: { status: 'DELIVERED' },
      });
      if (latestShipping) {
        await tx.shipping.update({
          where: { id: latestShipping.id },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
      }

      return { message: 'تحویل با موفقیت ثبت شد', alreadyProcessed: false };
    });
  }

  async adminCancel(orderId: string, dto: CancelShopOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('سفارش یافت نشد');

      if (order.status === 'CANCELLED') {
        return {
          message: 'این سفارش قبلاً لغو شده است',
          alreadyProcessed: true,
        };
      }
      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new ConflictException('سفارش ارسال یا تحویل‌شده قابل لغو نیست');
      }

      await this.releaseStock(tx, order.items);

      if (order.status === 'PAID' || order.status === 'PROCESSING') {
        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${order.userId}::uuid FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({
          where: { userId: order.userId },
        });
        if (wallet) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { rialBalance: { increment: order.totalRial } },
          });
          await tx.transaction.create({
            data: {
              userId: order.userId,
              walletId: wallet.id,
              type: 'REFUND',
              amountRial: order.totalRial,
              status: 'COMPLETED',
              description: `shop_order_refund:${order.id}`,
              shopOrderId: order.id,
            },
          });
        }
      }

      await tx.shopOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      this.logger.log(
        `[ShopOrder] سفارش ${order.id} لغو شد${dto.reason ? ` (${dto.reason})` : ''}`,
      );

      return { message: 'سفارش لغو شد', alreadyProcessed: false };
    });
  }

  // ══════════════════════════════════════════
  // پاکسازی خودکار سفارش‌های پرداخت‌نشده راکد (هر ۱۰ دقیقه)
  // ══════════════════════════════════════════
  @Cron('*/10 * * * *', { name: 'expire-stale-shop-orders' })
  async expireStaleOrders(): Promise<void> {
    const cutoff = new Date(
      Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000,
    );
    const staleOrders = await this.prisma.shopOrder.findMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
      include: { items: true },
    });

    // داخل متد Cron Job شما
    for (const order of staleOrders) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // 1. قفل کردن رکورد تا هیچ متد دیگری (مثلا پرداخت) نتواند همزمان آن را تغییر دهد
          await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${order.id}::uuid FOR UPDATE`;

          // 2. واکشی مجدد وضعیت سفارش برای اطمینان
          const freshOrder = await tx.shopOrder.findUnique({
            where: { id: order.id },
          });

          // 3. اگر در این فاصله کسری از ثانیه سفارش پرداخت شده بود، بی‌خیال می‌شویم
          if (!freshOrder || freshOrder.status !== 'PENDING_PAYMENT') return;

          // 4. آزاد کردن موجودی و آپدیت وضعیت
          await this.releaseStock(tx, order.items);

          await tx.shopOrder.update({
            where: { id: order.id },
            data: { status: 'CANCELLED' },
          });
        });
      } catch (err) {
        this.logger.error(`Failed to cancel stale order ${order.id}`, err);
      }
    }
  }

  // ══════════════════════════════════════════
  // helpers
  // ══════════════════════════════════════════
  private async releaseStock(
    tx: Prisma.TransactionClient,
    items: { variantId: string; quantity: number }[],
  ) {
    for (const item of items) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }
  }

  private toDto(o: {
    id: string;
    status: string;
    totalRial: Prisma.Decimal;
    trackingCode: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: {
      id: string;
      quantity: number;
      priceRial: Prisma.Decimal;
      variant: {
        weightGrams: Prisma.Decimal;
        product: { name: string; slug: string };
      };
    }[];
    address?: unknown;
    payments?: unknown[];
    shippings?: unknown[];
  }) {
    return {
      id: o.id,
      status: o.status,
      totalToman: o.totalRial.dividedBy(10).toString(),
      trackingCode: o.trackingCode,
      address: o.address,
      payments: o.payments,
      shippings: o.shippings,
      items: o.items.map((i) => ({
        id: i.id,
        productName: i.variant.product.name,
        productSlug: i.variant.product.slug,
        weightGrams: i.variant.weightGrams.toString(),
        quantity: i.quantity,
        unitPriceToman: i.priceRial.dividedBy(10).toString(),
        lineTotalToman: i.priceRial.times(i.quantity).dividedBy(10).toString(),
      })),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
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
      `[ShopOrder][UNEXPECTED] خطا برای ${actorId}:`,
      err instanceof Error ? err.stack : err,
    );
    return new BadRequestException(
      'خطایی در پردازش سفارش رخ داد. لطفاً مجدداً تلاش کنید',
    );
  }
}
