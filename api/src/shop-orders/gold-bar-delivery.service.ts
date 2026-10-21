// api/src/shop-orders/gold-bar-delivery.service.ts
//
// تحویل فیزیکی طلای آب‌شده = خرید شمش معادل از محصولات فروشگاه.
//
// کاربر طلای آب‌شده را میلی‌گرمی می‌خرد؛ وقتی موجودی قابل استفاده‌ی کیف طلایی‌اش به حداقل
// (پیش‌فرض ۵۰۰ سوت = ۰٫۵ گرم، physical_delivery.min_gold_grams) برسد، می‌تواند یکی از شمش‌های
// موجود فروشگاه را (فقط در وزن‌های تعریف‌شده) انتخاب کند:
//   ۱) معادل وزن شمش از کیف طلایی با نرخ لحظه‌ای طلای آب‌شده کسر می‌شود (اگر کمتر دارد، همه‌ی
//      موجودی قابل استفاده)؛
//   ۲) مابه‌التفاوت قیمت شمش (نرخ لحظه‌ای + سود/اجرت طبق موتور قیمت فروشگاه) با ارزش آن طلا
//      محاسبه و به کاربر نمایش داده می‌شود؛
//   ۳) باقی‌مانده به انتخاب کاربر از طلای اضافه‌ی کیف طلایی، کیف پول ریالی، درگاه پرداخت یا
//      ترکیبی از آن‌ها پرداخت می‌شود.
// خروجی یک سفارش عادی فروشگاه است (موجودی انبار، فاکتور، ارسال، کد تحویل، هولوگرام و اعلان پنل
// همان مسیر فروشگاه را طی می‌کنند) با fundingSource = MELTED_GOLD.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { GOLD_INGOT_CATEGORY_SLUG } from '../catalog/catalog.service';
import { PriceService } from '../market/price.service';
import { AccountingService } from '../accounting/accounting.service';
import { InventoryAccountingService } from '../accounting/inventory-accounting.service';
import { InvoiceService } from '../invoice/invoice.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { ShopOrdersService } from './shop-orders.service';
import { ShopOrderEventsService } from './shop-order-events.service';
import {
  PROVINCE_MISSING,
  ShippingSelection,
  ShippingService,
  UserShippingOption,
} from '../shipping/shipping.service';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const D0 = D(0);
const GOLD_DP = 4;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const HOLD_MINUTES = 15;

export type GatewayProviderKey = 'ZARINPAL' | 'BEHPARDAKHT';

export interface GoldBarPlanInput {
  priceRial: Prisma.Decimal;
  weightGrams: Prisma.Decimal;
  goldRateRial: Prisma.Decimal;
  goldAvailableGrams: Prisma.Decimal;
  rialAvailable: Prisma.Decimal;
  useExtraGold: boolean;
  useRialWallet: boolean;
  /** هزینه‌ی ارسال پیش‌پرداخت (به مابه‌التفاوت افزوده می‌شود؛ طلای وزن شمش صرف آن نمی‌شود) */
  shippingRial?: Prisma.Decimal;
}

export interface GoldBarPlan {
  /** طلای کسرشده بابت وزن شمش (حداکثر به اندازه‌ی وزن شمش) */
  goldForBarGrams: Prisma.Decimal;
  goldForBarRial: Prisma.Decimal;
  /** مابه‌التفاوت قیمت شمش با ارزش طلای بالا (اگر طلا کمتر از وزن شمش باشد، کسری هم شامل آن است) + هزینه ارسال */
  differenceRial: Prisma.Decimal;
  shippingRial: Prisma.Decimal;
  /** کسری طلای کاربر نسبت به وزن شمش */
  shortfallGrams: Prisma.Decimal;
  extraGoldGrams: Prisma.Decimal;
  extraGoldRial: Prisma.Decimal;
  rialWalletRial: Prisma.Decimal;
  gatewayRial: Prisma.Decimal;
  goldAppliedGrams: Prisma.Decimal;
  goldAppliedRial: Prisma.Decimal;
}

/**
 * محاسبه‌ی خالص نحوه‌ی پرداخت شمش (بدون I/O؛ قابل آزمون).
 * گرد کردن همیشه به نفع پایداری حساب‌هاست: ارزش طلا رو به پایین، طلای لازم رو به بالا.
 */
export function planGoldBarPayment(i: GoldBarPlanInput): GoldBarPlan {
  const floorG = (v: Prisma.Decimal) =>
    v.toDecimalPlaces(GOLD_DP, Prisma.Decimal.ROUND_DOWN);
  const floorR = (v: Prisma.Decimal) =>
    v.toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);
  const available = Prisma.Decimal.max(D0, floorG(i.goldAvailableGrams));

  const goldForBarGrams = Prisma.Decimal.min(available, i.weightGrams);
  // ارزش طلا هرگز از قیمت شمش بیشتر حساب نمی‌شود
  const goldForBarRial = Prisma.Decimal.min(
    floorR(goldForBarGrams.times(i.goldRateRial)),
    i.priceRial,
  );
  const shippingRial = Prisma.Decimal.max(D0, i.shippingRial ?? D0);
  const differenceRial = i.priceRial.minus(goldForBarRial).plus(shippingRial);
  const shortfallGrams = Prisma.Decimal.max(
    D0,
    i.weightGrams.minus(goldForBarGrams),
  );

  let remaining = differenceRial;
  let extraGoldGrams = D0;
  let extraGoldRial = D0;
  if (
    i.useExtraGold &&
    remaining.greaterThan(0) &&
    i.goldRateRial.greaterThan(0)
  ) {
    const extraAvailable = available.minus(goldForBarGrams);
    const needed = remaining
      .dividedBy(i.goldRateRial)
      .toDecimalPlaces(GOLD_DP, Prisma.Decimal.ROUND_UP);
    if (extraAvailable.greaterThanOrEqualTo(needed)) {
      extraGoldGrams = needed;
      extraGoldRial = remaining;
    } else if (extraAvailable.greaterThan(0)) {
      extraGoldGrams = extraAvailable;
      extraGoldRial = Prisma.Decimal.min(
        floorR(extraAvailable.times(i.goldRateRial)),
        remaining,
      );
    }
    remaining = remaining.minus(extraGoldRial);
  }

  let rialWalletRial = D0;
  if (i.useRialWallet && remaining.greaterThan(0)) {
    rialWalletRial = Prisma.Decimal.min(
      Prisma.Decimal.max(D0, floorR(i.rialAvailable)),
      remaining,
    );
    remaining = remaining.minus(rialWalletRial);
  }

  return {
    goldForBarGrams,
    goldForBarRial,
    differenceRial,
    shippingRial,
    shortfallGrams,
    extraGoldGrams,
    extraGoldRial,
    rialWalletRial,
    gatewayRial: remaining,
    goldAppliedGrams: goldForBarGrams.plus(extraGoldGrams),
    goldAppliedRial: goldForBarRial.plus(extraGoldRial),
  };
}

interface StoredQuote {
  id: string;
  userId: string;
  variantId: string;
  productId: string;
  productName: string;
  weightGrams: string;
  priceRial: string;
  goldRateRial: string;
  breakdown: unknown;
  expiresAt: string;
}

@Injectable()
export class GoldBarDeliveryService {
  private readonly logger = new Logger(GoldBarDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly systemConfig: SystemConfigService,
    private readonly pricingEngine: PricingEngineService,
    private readonly priceService: PriceService,
    private readonly accountingService: AccountingService,
    private readonly inventoryAccounting: InventoryAccountingService,
    private readonly invoiceService: InvoiceService,
    private readonly documentSequence: DocumentSequenceService,
    private readonly shopOrders: ShopOrdersService,
    private readonly events: ShopOrderEventsService,
    private readonly shipping: ShippingService,
  ) {}

  // ══════════════════════════════════════════
  // تنظیمات و نرخ
  // ══════════════════════════════════════════
  private minGoldGrams() {
    return this.systemConfig.getDecimal(
      'physical_delivery.min_gold_grams',
      '0.5',
    );
  }

  private async quoteTtlSeconds() {
    const s = await this.systemConfig.getNumber(
      'trade.lock_duration_seconds',
      120,
    );
    return Math.min(Math.max(s, 30), 600);
  }

  /**
   * نرخ هر گرم طلای آب‌شده‌ی کاربر: قیمت لحظه‌ای با همان اسپرد فروش (بدون کارمزد معامله، چون
   * طلا نقد نمی‌شود). قیمت کهنه پذیرفته نمی‌شود.
   */
  private async goldRateRial(): Promise<Prisma.Decimal> {
    const [quote, spread, maxAge] = await Promise.all([
      this.priceService.getTradableGoldQuote(),
      this.systemConfig.getDecimal('trade.gold.spread_percent', '0'),
      this.systemConfig.getNumber('trade.gold.max_price_age_seconds', 180),
    ]);
    if (!quote || quote.priceRial.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'قیمت لحظه‌ای در دسترس نیست. لطفاً چند لحظه دیگر تلاش کنید',
      );
    }
    if (
      (Date.now() - quote.fetchedAt.getTime()) / 1000 >
      Math.max(maxAge, 60)
    ) {
      throw new BadRequestException(
        'قیمت بازار در حال به‌روزرسانی است. لطفاً چند لحظه دیگر تلاش کنید',
      );
    }
    return quote.priceRial
      .times(D(1).minus(spread.dividedBy(100)))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);
  }

  private async assertEligibleUser(userId: string) {
    const [user, enabled] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, identity: { select: { status: true } } },
      }),
      this.systemConfig.getBoolean('service.gold_ingot.enabled', true),
    ]);
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('حساب کاربری شما فعال نیست');
    }
    if (user.identity?.status !== 'VERIFIED') {
      throw new ForbiddenException(
        'برای درخواست تحویل فیزیکی ابتدا باید احراز هویت کنید',
      );
    }
    if (!enabled) {
      throw new ForbiddenException('فروش شمش در حال حاضر غیرفعال است');
    }
  }

  /** موجودی قابل استفاده (پس از کسر رزروهای فعال) */
  private async balances(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
  ) {
    const wallet = await db.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');
    const holds = await db.walletHold.findMany({
      where: { walletId: wallet.id, expiresAt: { gt: new Date() } },
    });
    const heldGrams = holds.reduce((s, h) => s.plus(h.amountGrams ?? D0), D0);
    const heldRial = holds.reduce((s, h) => s.plus(h.amountRial ?? D0), D0);
    return {
      wallet,
      goldAvailable: Prisma.Decimal.max(
        D0,
        wallet.goldBalanceGrams.minus(heldGrams),
      ),
      rialAvailable: Prisma.Decimal.max(D0, wallet.rialBalance.minus(heldRial)),
    };
  }

  private async priceVariant(variant: {
    id: string;
    productId: string;
    weightGrams: Prisma.Decimal;
    priceAdjustment: Prisma.Decimal;
  }) {
    const result = await this.pricingEngine.calculateForProduct(
      variant.productId,
      variant.weightGrams,
    );
    const base = D(String(result.finalPriceRial ?? 0));
    const price = base.plus(variant.priceAdjustment).toDecimalPlaces(0);
    if (price.lessThanOrEqualTo(0)) {
      throw new BadRequestException('قیمت این شمش در دسترس نیست');
    }
    return { priceRial: price, breakdown: result.lines ?? null };
  }

  private availableBarsWhere(): Prisma.ProductVariantWhereInput {
    return {
      stockQuantity: { gt: 0 },
      product: {
        status: 'ACTIVE',
        category: { slug: GOLD_INGOT_CATEGORY_SLUG, isActive: true },
      },
    };
  }

  private toToman(v: Prisma.Decimal) {
    return v
      .dividedBy(10)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toString();
  }

  private planView(plan: GoldBarPlan) {
    return {
      goldForBarGrams: plan.goldForBarGrams.toString(),
      goldForBarToman: this.toToman(plan.goldForBarRial),
      differenceToman: this.toToman(plan.differenceRial),
      shippingToman: this.toToman(plan.shippingRial),
      shortfallGrams: plan.shortfallGrams.toString(),
      extraGoldGrams: plan.extraGoldGrams.toString(),
      extraGoldToman: this.toToman(plan.extraGoldRial),
      rialWalletToman: this.toToman(plan.rialWalletRial),
      gatewayToman: this.toToman(plan.gatewayRial),
      goldAppliedGrams: plan.goldAppliedGrams.toString(),
      goldAppliedToman: this.toToman(plan.goldAppliedRial),
    };
  }

  /** گزینه‌های ارسال شمش برای آدرس؛ خطای انتخاب روش به‌جای شکستن پیش‌فاکتور برگردانده می‌شود */
  private async shippingForQuote(
    userId: string,
    p: {
      addressId?: string;
      shippingMethodId?: string;
      shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
      weightGrams: Prisma.Decimal;
      priceRial: Prisma.Decimal;
    },
  ) {
    const enabled = await this.shipping.isEnabled();
    const empty = {
      enabled,
      options: [] as UserShippingOption[],
      selection: null as ShippingSelection | null,
      error: null as string | null,
    };
    if (!enabled || !p.addressId) return empty;
    const address = await this.shipping.getUserAddress(userId, p.addressId);
    const parcel = {
      itemsWeightGrams: p.weightGrams.toNumber(),
      valueRial: p.priceRial.toNumber(),
    };
    const { options, provinceMissing } = await this.shipping.quoteForAddress(
      address,
      parcel,
    );
    const result = {
      ...empty,
      options: options.map((o) => this.shipping.toUserOption(o)),
      error: provinceMissing ? PROVINCE_MISSING : null,
    };
    if (!p.shippingMethodId) return result;
    try {
      result.selection = await this.shipping.resolveForCheckout({
        address,
        ...parcel,
        methodId: p.shippingMethodId,
        feePayment: p.shippingFeePayment,
      });
    } catch (err) {
      result.error = (err as Error).message;
    }
    return result;
  }

  private selectionView(s: ShippingSelection | null) {
    return s
      ? {
          methodId: s.methodId,
          name: s.methodName,
          chargedToman: this.toToman(D(s.charge.shippingRial)),
          estimateToman: this.toToman(D(s.charge.estimateRial)),
          payOnDelivery: s.charge.payOnDelivery,
          free: s.charge.waivedRial > 0,
        }
      : null;
  }

  // ══════════════════════════════════════════
  // فهرست شمش‌های قابل انتخاب + خلاصه‌ی موجودی
  // ══════════════════════════════════════════
  async listBars(userId: string) {
    await this.assertEligibleUser(userId);
    const [minGold, rate, bal, variants] = await Promise.all([
      this.minGoldGrams(),
      this.goldRateRial(),
      this.balances(this.prisma, userId),
      this.prisma.productVariant.findMany({
        where: this.availableBarsWhere(),
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { weightGrams: 'asc' },
      }),
    ]);

    const bars = [];
    for (const v of variants) {
      try {
        const { priceRial } = await this.priceVariant(v);
        const plan = planGoldBarPayment({
          priceRial,
          weightGrams: v.weightGrams,
          goldRateRial: rate,
          goldAvailableGrams: bal.goldAvailable,
          rialAvailable: bal.rialAvailable,
          useExtraGold: false,
          useRialWallet: false,
        });
        bars.push({
          variantId: v.id,
          productId: v.product.id,
          productName: v.product.name,
          productSlug: v.product.slug,
          imageUrl: v.product.images[0]?.url ?? null,
          weightGrams: v.weightGrams.toString(),
          stock: v.stockQuantity,
          priceToman: this.toToman(priceRial),
          ...this.planView(plan),
        });
      } catch (err) {
        this.logger.warn(
          `[GoldBar] قیمت تنوع ${v.id} محاسبه نشد: ${(err as Error).message}`,
        );
      }
    }

    return {
      minGoldGrams: minGold.toString(),
      eligible: bal.goldAvailable.greaterThanOrEqualTo(minGold),
      goldAvailableGrams: bal.goldAvailable.toString(),
      rialAvailableToman: this.toToman(bal.rialAvailable),
      goldRateToman: this.toToman(rate),
      bars,
    };
  }

  // ══════════════════════════════════════════
  // سفارش‌های شمش (تحویل فیزیکی) کاربر
  // ══════════════════════════════════════════
  async listOrders(userId: string) {
    const orders = await this.prisma.shopOrder.findMany({
      where: { userId, fundingSource: 'MELTED_GOLD' },
      include: {
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return orders.map((o) => {
      const item = o.items[0];
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        productName: item?.variant?.product.name ?? '',
        weightGrams: item?.variant?.weightGrams.toString() ?? '0',
        totalToman: this.toToman(o.totalRial),
        goldAppliedGrams: o.goldAppliedGrams.toString(),
        goldAppliedToman: this.toToman(o.goldAppliedRial),
        paidToman: this.toToman(o.totalRial.minus(o.goldAppliedRial)),
        createdAt: o.createdAt.toISOString(),
      };
    });
  }

  // ══════════════════════════════════════════
  // قفل قیمت شمش انتخابی (پیش‌فاکتور)
  // ══════════════════════════════════════════
  async quote(
    userId: string,
    dto: {
      variantId: string;
      useExtraGold?: boolean;
      useRialWallet?: boolean;
      addressId?: string;
      shippingMethodId?: string;
      shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
    },
  ) {
    await this.assertEligibleUser(userId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, ...this.availableBarsWhere() },
      include: { product: { select: { id: true, name: true } } },
    });
    if (!variant) {
      throw new NotFoundException('این شمش موجود نیست؛ شمش دیگری انتخاب کنید');
    }
    const [minGold, rate, bal, priced, ttl] = await Promise.all([
      this.minGoldGrams(),
      this.goldRateRial(),
      this.balances(this.prisma, userId),
      this.priceVariant(variant),
      this.quoteTtlSeconds(),
    ]);
    if (bal.goldAvailable.lessThan(minGold)) {
      throw new BadRequestException(
        `برای تحویل فیزیکی حداقل ${minGold.times(1000).toString()} سوت (${minGold.toString()} گرم) طلای قابل استفاده لازم است`,
      );
    }

    const expiresAt = new Date(Date.now() + ttl * 1000);
    const stored: StoredQuote = {
      id: randomUUID(),
      userId,
      variantId: variant.id,
      productId: variant.product.id,
      productName: variant.product.name,
      weightGrams: variant.weightGrams.toString(),
      priceRial: priced.priceRial.toString(),
      goldRateRial: rate.toString(),
      breakdown: priced.breakdown,
      expiresAt: expiresAt.toISOString(),
    };
    await this.redis.setex(
      `gold-bar-quote:${stored.id}`,
      ttl,
      JSON.stringify(stored),
    );

    // گزینه‌های ارسال برای آدرس انتخابی؛ روش انتخاب‌شده (اگر معتبر باشد) در پیش‌فاکتور لحاظ می‌شود
    const shipping = await this.shippingForQuote(userId, {
      addressId: dto.addressId,
      shippingMethodId: dto.shippingMethodId,
      shippingFeePayment: dto.shippingFeePayment,
      weightGrams: variant.weightGrams,
      priceRial: priced.priceRial,
    });

    const plan = planGoldBarPayment({
      priceRial: priced.priceRial,
      weightGrams: variant.weightGrams,
      goldRateRial: rate,
      goldAvailableGrams: bal.goldAvailable,
      rialAvailable: bal.rialAvailable,
      useExtraGold: dto.useExtraGold ?? true,
      useRialWallet: dto.useRialWallet ?? true,
      shippingRial: D(shipping.selection?.charge.shippingRial ?? 0),
    });

    return {
      shipping: {
        enabled: shipping.enabled,
        options: shipping.options,
        selected: this.selectionView(shipping.selection),
        error: shipping.error,
      },
      quoteId: stored.id,
      expiresAt: stored.expiresAt,
      expiresInSeconds: ttl,
      variantId: variant.id,
      productName: variant.product.name,
      weightGrams: variant.weightGrams.toString(),
      priceToman: this.toToman(priced.priceRial),
      goldRateToman: this.toToman(rate),
      goldAvailableGrams: bal.goldAvailable.toString(),
      rialAvailableToman: this.toToman(bal.rialAvailable),
      ...this.planView(plan),
    };
  }

  private async readQuote(
    userId: string,
    quoteId: string,
  ): Promise<StoredQuote> {
    const raw = await this.redis.get(`gold-bar-quote:${quoteId}`);
    const q = raw ? (JSON.parse(raw) as StoredQuote) : null;
    if (!q || q.userId !== userId || new Date(q.expiresAt) <= new Date()) {
      throw new BadRequestException(
        'مهلت قیمت قفل‌شده به پایان رسیده است؛ دوباره شمش را انتخاب کنید',
      );
    }
    return q;
  }

  // ══════════════════════════════════════════
  // ثبت سفارش شمش با طلای آب‌شده
  // ══════════════════════════════════════════
  async order(
    userId: string,
    dto: {
      quoteId: string;
      addressId: string;
      useExtraGold: boolean;
      useRialWallet: boolean;
      gatewayProvider?: GatewayProviderKey;
      shippingMethodId?: string;
      shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
    },
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) return this.orderInternal(userId, dto);
    const key = `idemp:gold-bar:${userId}:${idempotencyKey}`;
    const cached = await this.redis.get(key);
    if (cached)
      return JSON.parse(cached) as Awaited<
        ReturnType<typeof this.orderInternal>
      >;
    const result = await this.orderInternal(userId, dto);
    await this.redis
      .setex(key, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(result))
      .catch(() =>
        this.logger.warn(`[Idempotency] ذخیره کلید ${key} ناموفق بود`),
      );
    return result;
  }

  private async orderInternal(
    userId: string,
    dto: {
      quoteId: string;
      addressId: string;
      useExtraGold: boolean;
      useRialWallet: boolean;
      gatewayProvider?: GatewayProviderKey;
      shippingMethodId?: string;
      shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
    },
  ) {
    await this.assertEligibleUser(userId);
    const q = await this.readQuote(userId, dto.quoteId);
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId, deletedAt: null },
    });
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    const minGold = await this.minGoldGrams();

    const priceRial = D(q.priceRial);
    const weightGrams = D(q.weightGrams);
    const goldRateRial = D(q.goldRateRial);
    const shipping = await this.shipping.resolveForCheckout({
      address,
      itemsWeightGrams: weightGrams.toNumber(),
      valueRial: priceRial.toNumber(),
      methodId: dto.shippingMethodId,
      feePayment: dto.shippingFeePayment,
    });
    const shippingRial = D(shipping?.charge.shippingRial ?? 0);

    const created = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "product_variants" WHERE "id" = ${q.variantId}::uuid FOR UPDATE`;
        const variant = await tx.productVariant.findFirst({
          where: { id: q.variantId, ...this.availableBarsWhere() },
        });
        if (!variant) {
          throw new ConflictException(
            'موجودی این شمش به پایان رسید؛ شمش دیگری انتخاب کنید',
          );
        }

        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
        const bal = await this.balances(tx, userId);
        if (bal.goldAvailable.lessThan(minGold)) {
          throw new BadRequestException(
            `برای تحویل فیزیکی حداقل ${minGold.times(1000).toString()} سوت (${minGold.toString()} گرم) طلای قابل استفاده لازم است`,
          );
        }
        const plan = planGoldBarPayment({
          priceRial,
          weightGrams,
          goldRateRial,
          goldAvailableGrams: bal.goldAvailable,
          rialAvailable: bal.rialAvailable,
          useExtraGold: dto.useExtraGold,
          useRialWallet: dto.useRialWallet,
          shippingRial,
        });
        if (plan.gatewayRial.greaterThan(0) && !dto.gatewayProvider) {
          throw new BadRequestException(
            'برای پرداخت باقی‌مانده یک درگاه پرداخت انتخاب کنید',
          );
        }

        const order = await tx.shopOrder.create({
          data: {
            orderNumber: await this.documentSequence.next(tx, 'SHO'),
            userId,
            addressId: dto.addressId,
            subtotalRial: priceRial,
            discountRial: 0,
            packagingRial: 0,
            packagingWaivedRial: 0,
            totalRial: priceRial.plus(shippingRial),
            ...this.shipping.orderShippingData(address, shipping),
            fundingSource: 'MELTED_GOLD',
            goldAppliedGrams: plan.goldAppliedGrams,
            goldAppliedRial: plan.goldAppliedRial,
            goldRateRial,
            status: 'PENDING_PAYMENT',
          },
        });
        await tx.shopOrderItem.create({
          data: {
            orderId: order.id,
            variantId: variant.id,
            quantity: 1,
            priceRial,
            priceBreakdown:
              (q.breakdown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
            recipientType: 'SELF',
          },
        });
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { stockQuantity: { decrement: 1 } },
        });
        await this.events.recordStatus(
          tx,
          order.id,
          null,
          'PENDING_PAYMENT',
          { type: 'USER', id: userId },
          'درخواست تحویل فیزیکی طلای آب‌شده (خرید شمش)',
        );

        if (plan.gatewayRial.lessThanOrEqualTo(0)) {
          await this.captureWithoutGateway(
            tx,
            order.id,
            userId,
            bal.wallet.id,
            plan,
          );
          return { orderId: order.id, plan, paid: true };
        }

        // پرداخت با درگاه: طلا و سهم کیف ریالی تا نتیجه‌ی درگاه رزرو می‌شوند
        const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
        await tx.walletHold.create({
          data: {
            walletId: bal.wallet.id,
            amountGrams: plan.goldAppliedGrams,
            holdType: 'ORDER_GOLD',
            referenceId: order.id,
            expiresAt,
          },
        });
        if (plan.rialWalletRial.greaterThan(0)) {
          await tx.walletHold.create({
            data: {
              walletId: bal.wallet.id,
              amountRial: plan.rialWalletRial,
              holdType: 'ORDER',
              referenceId: order.id,
              expiresAt,
            },
          });
          await tx.payment.create({
            data: {
              userId,
              orderId: order.id,
              amountRial: plan.rialWalletRial,
              method: 'WALLET',
              status: 'PENDING',
            },
          });
        }
        return { orderId: order.id, plan, paid: false };
      },
      { maxWait: 5000, timeout: 20000 },
    );

    await this.redis.del(`gold-bar-quote:${q.id}`).catch(() => undefined);
    void this.events.notify(created.orderId, 'CREATED');

    if (created.paid) {
      void this.events.notify(created.orderId, 'PAID');
      return {
        orderId: created.orderId,
        status: 'PAID',
        requiresRedirect: false,
        message: 'درخواست تحویل فیزیکی ثبت و پرداخت شد',
        ...this.planView(created.plan),
      };
    }

    try {
      const redirectUrl = await this.shopOrders.beginGatewayPayment(
        userId,
        created.orderId,
        created.plan.gatewayRial.toNumber(),
        dto.gatewayProvider,
      );
      return {
        orderId: created.orderId,
        status: 'PENDING_PAYMENT',
        requiresRedirect: true,
        redirectUrl,
        message: 'در حال انتقال به درگاه برای پرداخت مابه‌التفاوت',
        ...this.planView(created.plan),
      };
    } catch (err) {
      await this.shopOrders
        .cancelUnpaidGoldOrder(created.orderId, 'شروع پرداخت درگاه ناموفق بود')
        .catch(() => undefined);
      throw err;
    }
  }

  /** نهایی‌سازی فوری وقتی طلا (+ کیف ریالی) کل مبلغ را پوشش می‌دهد */
  private async captureWithoutGateway(
    tx: Prisma.TransactionClient,
    orderId: string,
    userId: string,
    walletId: string,
    plan: GoldBarPlan,
  ) {
    const order = await tx.shopOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    await this.shopOrders.captureGoldLeg(tx, order, { requireHold: false });

    const rial = plan.rialWalletRial;
    if (rial.greaterThan(0)) {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { id: walletId },
      });
      if (wallet.rialBalance.lessThan(rial)) {
        throw new BadRequestException('موجودی کیف پول ریالی کافی نیست');
      }
      await tx.wallet.update({
        where: { id: walletId },
        data: { rialBalance: { decrement: rial } },
      });
      await tx.payment.create({
        data: {
          userId,
          orderId,
          amountRial: rial,
          method: 'WALLET',
          status: 'SUCCESS',
          paidAt: new Date(),
        },
      });
      await tx.transaction.create({
        data: {
          userId,
          walletId,
          type: 'SHOP_PURCHASE',
          amountRial: rial,
          status: 'COMPLETED',
          description: `shop_order:${orderId}|gold_to_bar`,
          shopOrderId: orderId,
        },
      });
    }

    const subtotalRial = order.subtotalRial.toNumber();
    const shippingRial = order.shippingRial.toNumber();
    await this.accountingService.postJournal(tx, {
      description: `فروش شمش با طلای آب‌شده (تحویل فیزیکی) - سفارش ${orderId}`,
      totalRial: subtotalRial + shippingRial,
      totalGrams: 0,
      lines: this.shopOrders.buildSaleJournalLines({
        walletRial: rial.plus(order.goldAppliedRial).toNumber(),
        gatewayRial: 0,
        discountRial: 0,
        subtotalRial,
        packagingRial: 0,
        shippingRial,
      }),
    });
    await this.inventoryAccounting.postShopCogs(tx, orderId);
    await tx.shopOrder.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await this.events.recordStatus(
      tx,
      orderId,
      'PENDING_PAYMENT',
      'PAID',
      { type: 'USER', id: userId },
      'پرداخت با کیف طلایی' + (rial.greaterThan(0) ? ' و کیف پول ریالی' : ''),
    );
    await this.invoiceService.issueForShopOrder(tx, orderId);
  }
}
