import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import {
  CancelShopOrderDto,
  CreateShopOrderDto,
  GetShopOrdersQueryDto,
  PayShopOrderDto,
  ShipShopOrderDto,
} from '@arkan-gold/shared';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory';
import { SystemConfigService } from '../system-config/system-config.service';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const PENDING_PAYMENT_TTL_MINUTES = 30;

type OrderItemCreateData = {
  variantId?: string;
  productId?: string;
  selectedWeightGrams?: number;
  quantity: number;
  priceRial: number;
};

type ReleaseStockItem = {
  variantId: string | null;
  quantity: number;
};

type ShopOrderDtoItem = {
  id: string;
  quantity: number;
  priceRial: unknown;
  selectedWeightGrams: unknown;

  variant: {
    weightGrams: unknown;
    product: { name: string; slug: string };
  } | null;
  product?: { name: string; slug: string } | null;
};

type ShopOrderDtoSource = {
  id: string;
  status: string;
  totalRial: unknown;
  trackingCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: ShopOrderDtoItem[];
  address?: unknown;
  payments?: unknown[];
  shippings?: unknown[];
};

@Injectable()
export class ShopOrdersService {
  private readonly logger = new Logger(ShopOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly systemConfig: SystemConfigService,
  ) {}

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

  // api/src/shop-orders/shop-orders.service.ts
  // جایگزین متد checkoutInternal موجود کنید (بقیهٔ فایل بدون تغییر می‌ماند):

  private async checkoutInternal(userId: string, dto: CreateShopOrderDto) {
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });
    if (!address) throw new NotFoundException('آدرس یافت نشد');

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { variant: { include: { product: true } }, product: true },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('سبد خرید شما خالی است');
    }

    const now = new Date();
    const expiredItem = cart.items.find(
      (item) => !item.priceExpiresAt || item.priceExpiresAt < now,
    );
    if (expiredItem) {
      throw new BadRequestException(
        'قیمت قفل‌شدهٔ برخی آیتم‌های سبد منقضی شده است. لطفاً سبد را دوباره بررسی کنید',
      );
    }

    const unavailable = cart.items.find((item) => {
      const product = item.variant?.product ?? item.product;
      return !product || product.status !== 'ACTIVE';
    });
    if (unavailable) {
      const name =
        unavailable.variant?.product.name ?? unavailable.product?.name;
      throw new BadRequestException(`محصول «${name}» دیگر در دسترس نیست`);
    }

    const variantIds = [
      ...new Set(
        cart.items
          .map((item) => item.variantId)
          .filter((v): v is string => Boolean(v)),
      ),
    ].sort();

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

          let totalRial = 0;
          const orderItemsData: {
            variantId?: string;
            productId?: string;
            selectedWeightGrams?: number;
            quantity: number;
            priceRial: number;
            priceBreakdown: Prisma.InputJsonValue | typeof Prisma.JsonNull;
          }[] = [];

          for (const item of cart.items) {
            // ⬅️ نکتهٔ کلیدی: قیمت از lockedUnitPriceRial خوانده می‌شود، نه محاسبهٔ زنده
            const unitPriceRial = this.toNumber(item.lockedUnitPriceRial);
            if (unitPriceRial <= 0) {
              throw new BadRequestException(
                'قیمت قفل‌شدهٔ یکی از آیتم‌های سبد نامعتبر است، لطفاً دوباره امتحان کنید',
              );
            }

            if (item.variantId) {
              const fresh = variantMap.get(item.variantId);
              const product = item.variant?.product;
              if (!fresh || !product)
                throw new NotFoundException('تنوع محصول یافت نشد');
              if (fresh.stockQuantity < item.quantity) {
                throw new BadRequestException(
                  `موجودی «${product.name}» کافی نیست (موجودی: ${fresh.stockQuantity})`,
                );
              }
              totalRial += unitPriceRial * item.quantity;
              orderItemsData.push({
                variantId: item.variantId,
                quantity: item.quantity,
                priceRial: unitPriceRial,
                priceBreakdown:
                  (item.lockedBreakdown as Prisma.InputJsonValue) ??
                  Prisma.JsonNull,
              });
              continue;
            }

            const product = item.product;
            if (!product) throw new NotFoundException('محصول یافت نشد');

            totalRial += unitPriceRial * item.quantity;
            orderItemsData.push({
              productId: product.id,
              selectedWeightGrams: this.toNumber(item.selectedWeightGrams),
              quantity: item.quantity,
              priceRial: unitPriceRial,
              priceBreakdown:
                (item.lockedBreakdown as Prisma.InputJsonValue) ??
                Prisma.JsonNull,
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

          for (const orderItem of orderItemsData) {
            await tx.shopOrderItem.create({
              data: {
                orderId: newOrder.id,
                variantId: orderItem.variantId,
                productId: orderItem.productId,
                selectedWeightGrams: orderItem.selectedWeightGrams,
                quantity: orderItem.quantity,
                priceRial: orderItem.priceRial,
                priceBreakdown: orderItem.priceBreakdown,
              },
            });
            if (orderItem.variantId) {
              await tx.productVariant.update({
                where: { id: orderItem.variantId },
                data: { stockQuantity: { decrement: orderItem.quantity } },
              });
            }
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
    const order = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.status === 'PAID') {
      return {
        message: 'این سفارش قبلاً پرداخت شده است',
        alreadyProcessed: true,
        requiresRedirect: false,
      };
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException('این سفارش قابل پرداخت نیست');
    }

    const totalRial = this.toNumber(order.totalRial);

    if (dto.mode === 'WALLET') {
      await this.captureWalletOnly(userId, orderId, totalRial);
      return {
        message: 'پرداخت با موفقیت انجام شد',
        status: 'PAID',
        alreadyProcessed: false,
        requiresRedirect: false,
      };
    }

    if (dto.mode === 'GATEWAY') {
      const redirectUrl = await this.beginGatewayPayment(
        userId,
        orderId,
        totalRial,
        dto.gatewayProvider!,
      );
      return {
        message: 'در حال انتقال به درگاه پرداخت',
        requiresRedirect: true,
        redirectUrl,
        alreadyProcessed: false,
      };
    }

    // SPLIT
    const walletAmount = Number(dto.walletAmountRial);
    const gatewayAmount = Number(dto.gatewayAmountRial);
    if (walletAmount + gatewayAmount !== totalRial) {
      throw new BadRequestException(
        'جمع مبلغ کیف‌پول و درگاه باید برابر مبلغ فاکتور باشد',
      );
    }
    if (walletAmount <= 0 || gatewayAmount <= 0) {
      throw new BadRequestException(
        'برای پرداخت ترکیبی هر دو مبلغ باید بزرگتر از صفر باشند',
      );
    }

    await this.reserveWalletHold(userId, orderId, walletAmount);
    const redirectUrl = await this.beginGatewayPayment(
      userId,
      orderId,
      gatewayAmount,
      dto.gatewayProvider!,
      walletAmount,
    );
    return {
      message: 'در حال انتقال به درگاه پرداخت',
      requiresRedirect: true,
      redirectUrl,
      alreadyProcessed: false,
    };
  }

  // ── پرداخت ۱۰۰٪ کیف‌پول: فوری، بدون درگاه ──
  private async captureWalletOnly(
    userId: string,
    orderId: string,
    amountRial: number,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

        if (this.toNumber(wallet.rialBalance) < amountRial) {
          throw new BadRequestException(
            `موجودی کیف پول کافی نیست. مبلغ فاکتور: ${this.rialToTomanString(amountRial)} تومان`,
          );
        }

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { rialBalance: { decrement: amountRial } },
        });

        await tx.payment.create({
          data: {
            userId,
            orderId,
            amountRial,
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
            amountRial,
            status: 'COMPLETED',
            description: `shop_order:${orderId}`,
            shopOrderId: orderId,
          },
        });

        await tx.shopOrder.update({
          where: { id: orderId },
          data: { status: 'PAID' },
        });
        this.logger.log(
          `[ShopOrder] سفارش ${orderId} با موفقیت پرداخت شد (کیف‌پول)`,
        );
      });
    } catch (err) {
      throw this.translateDbError(err, userId);
    }
  }

  // ── رزرو (hold) سهم کیف‌پول برای پرداخت ترکیبی؛ کسر واقعی فقط بعد از موفقیت درگاه ──
  private async reserveWalletHold(
    userId: string,
    orderId: string,
    amountRial: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

      const activeHolds = await tx.walletHold.findMany({
        where: { walletId: wallet.id, expiresAt: { gt: new Date() } },
      });
      const heldRial = activeHolds.reduce(
        (s, h) => s + this.toNumber(h.amountRial ?? 0),
        0,
      );
      const availableRial = this.toNumber(wallet.rialBalance) - heldRial;

      if (availableRial < amountRial) {
        throw new BadRequestException(
          `موجودی قابل استفاده کیف پول کافی نیست. موجودی قابل استفاده: ${this.rialToTomanString(availableRial)} تومان`,
        );
      }

      // اگر hold فعالی از قبل برای همین سفارش هست (تلاش مجدد)، حذفش کن تا دوباره ساخته شود
      await tx.walletHold.deleteMany({
        where: { referenceId: orderId, holdType: 'ORDER' },
      });

      await tx.walletHold.create({
        data: {
          walletId: wallet.id,
          amountRial,
          holdType: 'ORDER',
          referenceId: orderId,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // ۱۵ دقیقه فرصت برای تکمیل درگاه
        },
      });

      await tx.payment
        .upsert({
          where: {
            id:
              (
                await tx.payment.findFirst({
                  where: { orderId, method: 'WALLET', status: 'PENDING' },
                })
              )?.id ?? '00000000-0000-0000-0000-000000000000',
          },
          create: {
            userId,
            orderId,
            amountRial,
            method: 'WALLET',
            status: 'PENDING',
          },
          update: { amountRial },
        })
        .catch(async () => {
          // اگر رکورد قبلی نبود upsert با id ساختگی fail می‌شود، پس ساده create کن
          await tx.payment.create({
            data: {
              userId,
              orderId,
              amountRial,
              method: 'WALLET',
              status: 'PENDING',
            },
          });
        });
    });
  }

  // ── شروع پرداخت درگاهی (تنها یا بخشی از SPLIT) ──
  private async beginGatewayPayment(
    userId: string,
    orderId: string,
    amountRial: number,
    providerKey: 'ZARINPAL' | 'BEHPARDAKHT',
    walletPortionRial?: number,
  ) {
    const provider = this.gatewayFactory.get(providerKey);
    if (!(await provider.isEnabled())) {
      throw new BadRequestException('این درگاه پرداخت در حال حاضر فعال نیست');
    }

    const baseUrl = await this.systemConfig.get(
      'payment.gateway.callback_base_url',
      'http://localhost:3000',
    );
    const callbackUrl = `${baseUrl}/api/orders/shop/payment/callback/${providerKey.toLowerCase()}`;

    const result = await provider.requestPayment({
      amountRial: String(amountRial),
      orderId,
      userId,
      description: `پرداخت سفارش ${orderId}`,
      callbackUrl,
    });

    await this.prisma.payment.create({
      data: {
        userId,
        orderId,
        amountRial,
        method: 'BANK_GATEWAY',
        status: 'PENDING',
        gatewayProvider: providerKey,
        gatewayProviderRef: result.providerRef,
      },
    });

    return result.redirectUrl;
  }

  // ── پردازش بازگشت از درگاه ──
  async handleGatewayCallback(
    providerKey: 'ZARINPAL' | 'BEHPARDAKHT',
    providerRef: string,
    query: Record<string, string>,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { gatewayProvider: providerKey, gatewayProviderRef: providerRef },
      include: { order: true },
    });
    if (!payment || !payment.orderId) {
      throw new NotFoundException('تراکنش پرداخت یافت نشد');
    }

    // idempotent: اگر قبلاً نهایی شده، فقط نتیجه را برگردان
    if (payment.status === 'SUCCESS') {
      return {
        orderId: payment.orderId,
        success: true,
        alreadyProcessed: true,
      };
    }
    if (payment.status === 'FAILED') {
      return {
        orderId: payment.orderId,
        success: false,
        alreadyProcessed: true,
      };
    }

    const provider = this.gatewayFactory.get(providerKey);
    const verifyResult = await provider.verifyPayment({
      providerRef,
      amountRial: String(this.toNumber(payment.amountRial)),
      callbackQuery: query,
    });

    if (!verifyResult.success) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
        // اگر leg کیف‌پولی هم برای همین سفارش وجود داشت، آزادش کن
        await this.releaseOrderWalletHold(tx, payment.orderId!);
      });
      return {
        orderId: payment.orderId,
        success: false,
        alreadyProcessed: false,
        reason: verifyResult.failureReason,
      };
    }

    // موفق: در یک تراکنش، leg درگاه را finalize کن + اگر leg کیف‌پولی هم بود capture کن
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${payment.orderId}::uuid FOR UPDATE`;

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            paidAt: new Date(),
            gatewayTrackingCode: verifyResult.trackingCode,
          },
        });

        const walletLeg = await tx.payment.findFirst({
          where: {
            orderId: payment.orderId,
            method: 'WALLET',
            status: 'PENDING',
          },
        });

        if (walletLeg) {
          const hold = await tx.walletHold.findFirst({
            where: { referenceId: payment.orderId!, holdType: 'ORDER' },
          });
          if (!hold)
            throw new ConflictException(
              'رزرو کیف‌پول این سفارش یافت نشد یا منقضی شده است',
            );

          const wallet = await tx.wallet.findUnique({
            where: { id: hold.walletId },
          });
          if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              rialBalance: { decrement: this.toNumber(hold.amountRial ?? 0) },
            },
          });
          await tx.walletHold.delete({ where: { id: hold.id } });
          await tx.payment.update({
            where: { id: walletLeg.id },
            data: { status: 'SUCCESS', paidAt: new Date() },
          });
        }

        const order = await tx.shopOrder.findUnique({
          where: { id: payment.orderId! },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد');

        const wallet = await tx.wallet.findUnique({
          where: { userId: payment.userId },
        });
        await tx.transaction.create({
          data: {
            userId: payment.userId,
            walletId: wallet!.id,
            type: 'SHOP_PURCHASE',
            amountRial: this.toNumber(order.totalRial),
            status: 'COMPLETED',
            description: `shop_order:${order.id}|gateway:${providerKey}`,
            shopOrderId: order.id,
          },
        });

        await tx.shopOrder.update({
          where: { id: order.id },
          data: { status: 'PAID' },
        });
      });

      this.logger.log(
        `[ShopOrder] سفارش ${payment.orderId} از طریق ${providerKey} پرداخت شد`,
      );
      return {
        orderId: payment.orderId,
        success: true,
        alreadyProcessed: false,
      };
    } catch (err) {
      throw this.translateDbError(err, payment.userId);
    }
  }

  private async releaseOrderWalletHold(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const hold = await tx.walletHold.findFirst({
      where: { referenceId: orderId, holdType: 'ORDER' },
    });
    if (hold) await tx.walletHold.delete({ where: { id: hold.id } });
    await tx.payment.updateMany({
      where: { orderId, method: 'WALLET', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  }

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

  async list(userId: string, query: GetShopOrdersQueryDto) {
    const where: Prisma.ShopOrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: {
          items: {
            include: {
              variant: { include: { product: true } },
              product: true,
            },
          },
          address: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);

    return {
      data: items.map((order) => this.toDto(order)),
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
        items: {
          include: {
            variant: { include: { product: true } },
            product: true,
          },
        },
        address: true,
        payments: true,
        shippings: true,
      },
    });

    if (!order) throw new NotFoundException('سفارش یافت نشد');

    return this.toDto(order);
  }

  async adminList(query: GetShopOrdersQueryDto) {
    const where: Prisma.ShopOrderWhereInput = query.status
      ? { status: query.status }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: {
          items: {
            include: {
              variant: { include: { product: true } },
              product: true,
            },
          },
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
      data: items.map((order) => ({
        ...this.toDto(order),
        user: order.user,
      })),
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
      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
      });

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
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;

      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: {
          shippings: {
            orderBy: { createdAt: 'asc' },
          },
        },
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
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
          },
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
          const refundRial = this.toNumber(order.totalRial);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { rialBalance: { increment: refundRial } },
          });

          await tx.transaction.create({
            data: {
              userId: order.userId,
              walletId: wallet.id,
              type: 'REFUND',
              amountRial: refundRial,
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

  @Cron('*/10 * * * *', { name: 'expire-stale-shop-orders' })
  async expireStaleOrders(): Promise<void> {
    const cutoff = new Date(
      Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000,
    );

    const staleOrders = await this.prisma.shopOrder.findMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
      include: { items: true },
    });

    for (const order of staleOrders) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${order.id}::uuid FOR UPDATE`;
          const freshOrder = await tx.shopOrder.findUnique({
            where: { id: order.id },
          });
          if (!freshOrder || freshOrder.status !== 'PENDING_PAYMENT') return;

          await this.releaseStock(tx, order.items);
          await this.releaseOrderWalletHold(tx, order.id);
          await tx.payment.updateMany({
            where: { orderId: order.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          });

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

  private async releaseStock(
    tx: Prisma.TransactionClient,
    items: ReleaseStockItem[],
  ): Promise<void> {
    for (const item of items) {
      if (!item.variantId) continue;

      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }
  }

  private toDto(order: ShopOrderDtoSource) {
    return {
      id: order.id,
      status: order.status,
      totalToman: this.rialToTomanString(order.totalRial),
      trackingCode: order.trackingCode,
      address: order.address,
      payments: order.payments,
      shippings: order.shippings,
      items: order.items.map((item) => {
        const productName =
          item.variant?.product.name ?? item.product?.name ?? '';
        const productSlug =
          item.variant?.product.slug ?? item.product?.slug ?? '';
        const weightGrams = this.toNumber(
          item.variant?.weightGrams ?? item.selectedWeightGrams ?? 0,
        );
        const unitPriceRial = this.toNumber(item.priceRial);
        const lineTotalRial = unitPriceRial * item.quantity;

        return {
          id: item.id,
          productName,
          productSlug,
          weightGrams: weightGrams.toString(),
          quantity: item.quantity,
          unitPriceToman: this.rialToTomanString(unitPriceRial),
          lineTotalToman: this.rialToTomanString(lineTotalRial),
        };
      }),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  // اضافه‌کردن helper:
  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private rialToTomanString(value: unknown): string {
    return (this.toNumber(value) / 10).toString();
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
