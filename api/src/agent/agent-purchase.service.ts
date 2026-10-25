// api/src/agent/agent-purchase.service.ts
//
// سفارش خرید شمش نماینده از شرکت (بیع قطعی — ماده ۲-۲ قرارداد):
//   ۱) ثبت سفارش از فهرست قیمت نمایندگی؛ قیمت لحظه‌ای فقط تا {priceLockMinutes} دقیقه قفل است
//   ۲) پرداخت در مهلت: کیف پول ریالی، درگاه (مازاد بر موجودی کیف پول)، یا واریز بانکی/حساب به حساب
//      با پیش‌فاکتور (مشخصات واریز باید در مهلت ثبت شود و مالی تأیید کند)؛ یا خرید اعتباری
//      برای نمایندگان دارای مجوز و در سقف اعتبار
//   ۳) تأیید مالی/انبار: تخصیص شمش‌های کددار خزانه، صدور صورتحساب فروش به نام نماینده
//      (با کد هولوگرام هر شمش)، حواله‌ی تحویل و سند درآمد و بهای تمام‌شده
//   ۴) تحویل و تأیید رسید توسط نماینده (بند ۶-۳) — از این پس شمش ملک نماینده است و با ثبت
//      فروش در پنل فقط «اصالت/مالکیت» مشتری نهایی در سامانه ثبت می‌شود
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { InvoiceService } from '../invoice/invoice.service';
import { formatJalaliDateTime } from '../common/utils/jalali.util';
import { AgentAccountingService, agentTag } from './agent-accounting.service';
import { AgentWalletService } from './agent-wallet.service';
import { AgentOrderPaymentService } from './agent-order-payment.service';
import { AgentFundsService } from './agent-funds.service';
import {
  AgentPriceItemDto,
  ApprovePurchaseOrderDto,
  CreatePurchaseOrderDto,
  PayOrderDto,
  SubmitOrderTransferDto,
  TradingListQueryDto,
  UpdateAgentPriceItemDto,
} from './agent-trading.dto';

const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

/** گرد کردن به نزدیک‌ترین تومان (۱۰ ریال) */
const roundToman = (v: Decimal) =>
  v.dividedBy(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(10);

const toman = (rial: Decimal.Value | Prisma.Decimal) =>
  new Decimal(rial.toString())
    .dividedBy(10)
    .toDecimalPlaces(0)
    .toNumber()
    .toLocaleString('fa-IR');

export const PURCHASE_STATUS_FA: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAYMENT_REVIEW: 'در انتظار تأیید واریز',
  PAID: 'پرداخت‌شده — در انتظار تأیید و تخصیص شمش',
  APPROVED: 'تأییدشده — حواله آماده‌ی تحویل',
  DELIVERED: 'تحویل‌شده',
  CANCELLED: 'لغوشده',
  EXPIRED: 'منقضی (عدم پرداخت در مهلت)',
};

export const PURCHASE_METHOD_FA: Record<string, string> = {
  WALLET: 'کیف پول نمایندگی',
  GATEWAY: 'درگاه پرداخت اینترنتی',
  BANK_TRANSFER: 'واریز بانکی / حساب به حساب',
  CREDIT: 'خرید اعتباری',
};

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

export interface PricedItem {
  id: string;
  title: string;
  weightGrams: string;
  purityKarat: 'K18' | 'K24';
  pricePerGramRial: string;
  unitGoldValueRial: string;
  unitPremiumRial: string;
  /** قیمت نمایندگی هر واحد */
  unitPriceRial: string;
  /** سقف قیمت فروش به مصرف‌کننده (بند ۸-۳ قرارداد) */
  consumerMaxPriceRial: string;
  maxPerOrder: number | null;
  productId: string | null;
}

@Injectable()
export class AgentPurchaseService {
  private readonly logger = new Logger(AgentPurchaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: DocumentSequenceService,
    private readonly systemConfig: SystemConfigService,
    private readonly sms: SmsTemplateService,
    private readonly pricing: PricingEngineService,
    private readonly invoices: InvoiceService,
    private readonly agentAccounting: AgentAccountingService,
    private readonly wallet: AgentWalletService,
    private readonly orderPayment: AgentOrderPaymentService,
    private readonly funds: AgentFundsService,
  ) {}

  // ══════════════════════════════════════════
  // ── فهرست قیمت نمایندگی ──
  // ══════════════════════════════════════════

  private async pricePerGram(purity: 'K18' | 'K24') {
    return (await this.pricing.getGoldPricePerGram(purity)).toDecimalPlaces(
      0,
      Decimal.ROUND_HALF_UP,
    );
  }

  /** قیمت لحظه‌ای هر قلم: وزن × قیمت گرم × (۱ + درصد افزوده) + اجرت */
  async priceItems(items: Prisma.AgentPriceItemGetPayload<object>[]) {
    const [markup, consumerMarkup] = await Promise.all([
      this.systemConfig.getNumber('agent.purchase.markup_percent', 0),
      this.systemConfig.getNumber('agent.consumer.max_markup_percent', 3),
    ]);
    const cache = new Map<string, Decimal>();
    const out: PricedItem[] = [];
    for (const it of items) {
      if (!cache.has(it.purityKarat)) {
        cache.set(it.purityKarat, await this.pricePerGram(it.purityKarat));
      }
      const ppg = cache.get(it.purityKarat);
      const weight = d(it.weightGrams);
      const goldValue = roundToman(weight.times(ppg).times(1 + markup / 100));
      const premium = d(it.premiumRial);
      const unit = goldValue.plus(premium);
      const consumerCap = Decimal.max(
        roundToman(weight.times(ppg).times(1 + consumerMarkup / 100)).plus(
          d(it.consumerPremiumRial),
        ),
        unit,
      );
      out.push({
        id: it.id,
        title: it.title,
        weightGrams: weight.toString(),
        purityKarat: it.purityKarat,
        pricePerGramRial: ppg.toFixed(0),
        unitGoldValueRial: goldValue.toFixed(0),
        unitPremiumRial: premium.toFixed(0),
        unitPriceRial: unit.toFixed(0),
        consumerMaxPriceRial: consumerCap.toFixed(0),
        maxPerOrder: it.maxPerOrder,
        productId: it.productId,
      });
    }
    return out;
  }

  async priceList() {
    const rows = await this.prisma.agentPriceItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { weightGrams: 'asc' }],
    });
    const lockMinutes = await this.lockMinutes();
    return {
      items: await this.priceItems(rows),
      priceLockMinutes: lockMinutes,
      gatewayMaxRial: (await this.funds.gatewayMaxRial()).toString(),
      generatedAt: new Date().toISOString(),
    };
  }

  async adminPriceItems() {
    const rows = await this.prisma.agentPriceItem.findMany({
      orderBy: [
        { isActive: 'desc' },
        { sortOrder: 'asc' },
        { weightGrams: 'asc' },
      ],
    });
    const priced = await this.priceItems(rows);
    return rows.map((r, i) => ({ ...r, live: priced[i] }));
  }

  async createPriceItem(dto: AgentPriceItemDto) {
    return this.prisma.agentPriceItem.create({
      data: {
        title: dto.title.trim(),
        weightGrams: dto.weightGrams,
        purityKarat: dto.purityKarat,
        premiumRial: dto.premiumRial,
        consumerPremiumRial: dto.consumerPremiumRial,
        productId: dto.productId ?? null,
        maxPerOrder: dto.maxPerOrder ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updatePriceItem(id: string, dto: UpdateAgentPriceItemDto) {
    const row = await this.prisma.agentPriceItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قلم فهرست قیمت یافت نشد');
    return this.prisma.agentPriceItem.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        premiumRial: dto.premiumRial,
        consumerPremiumRial: dto.consumerPremiumRial,
        productId: dto.productId,
        maxPerOrder: dto.maxPerOrder,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  /** سقف قیمت مصرف‌کننده برای یک شمش (وزن/عیار) — مبنای کنترل بند ۸-۳ در ثبت فروش */
  async consumerCapFor(weightGrams: Decimal, purity: 'K18' | 'K24') {
    const item = await this.prisma.agentPriceItem.findFirst({
      where: { weightGrams: weightGrams.toString(), purityKarat: purity },
      orderBy: { isActive: 'desc' },
    });
    const consumerMarkup = await this.systemConfig.getNumber(
      'agent.consumer.max_markup_percent',
      3,
    );
    const ppg = await this.pricePerGram(purity);
    return roundToman(
      weightGrams.times(ppg).times(1 + consumerMarkup / 100),
    ).plus(d(item?.consumerPremiumRial));
  }

  private async lockMinutes() {
    return Math.max(
      2,
      await this.systemConfig.getNumber(
        'agent.purchase.price_lock_minutes',
        15,
      ),
    );
  }

  // ══════════════════════════════════════════
  // ── ثبت سفارش ──
  // ══════════════════════════════════════════

  /** بدهی اعتباری سررسیدگذشته‌ی نماینده (مانع خرید اعتباری جدید) */
  async overdueCredit(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { balanceRial: true },
    });
    if (!agent || d(agent.balanceRial).lte(0)) return null;
    return this.prisma.agentPurchaseOrder.findFirst({
      where: {
        agentId,
        paymentMethod: 'CREDIT',
        status: { in: ['APPROVED', 'DELIVERED'] },
        creditDueAt: { lt: new Date() },
      },
      orderBy: { creditDueAt: 'asc' },
      select: { orderNumber: true, creditDueAt: true },
    });
  }

  async createOrder(
    agentId: string,
    actorId: string,
    dto: CreatePurchaseOrderDto,
  ) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');
    if (agent.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'حساب نمایندگی شما فعال نیست و امکان ثبت سفارش ندارد',
      );
    }
    if (
      agent.businessLicenseExpiresAt &&
      agent.businessLicenseExpiresAt < new Date()
    ) {
      throw new ForbiddenException(
        'اعتبار پروانه کسب ثبت‌شده‌ی شما به پایان رسیده است (بند ۸-۱ قرارداد)؛ پروانه‌ی معتبر را به شرکت اعلام کنید',
      );
    }
    const requireContract = await this.systemConfig.getBoolean(
      'agent.purchase.require_signed_contract',
      true,
    );
    if (requireContract) {
      // قرارداد فقط با امضای هر دو طرف (نماینده با کد پیامکی و شرکت در پنل) کامل است
      const signed = await this.prisma.agentContract.count({
        where: {
          agentId,
          status: 'SIGNED',
          companySignedAt: { not: null },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
      });
      if (!signed) {
        throw new ForbiddenException(
          'برای ثبت سفارش خرید، قرارداد نمایندگی معتبر و امضاشده توسط هر دو طرف لازم است',
        );
      }
    }

    // ── اقلام و قیمت لحظه‌ای ──
    const ids = [...new Set(dto.items.map((i) => i.priceItemId))];
    if (ids.length !== dto.items.length) {
      throw new BadRequestException('هر قلم فقط یک‌بار در سفارش وارد شود');
    }
    const rows = await this.prisma.agentPriceItem.findMany({
      where: { id: { in: ids }, isActive: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException(
        'برخی اقلام سفارش در فهرست قیمت فعال نیستند',
      );
    }
    const priced = await this.priceItems(rows);
    const lines = dto.items.map((i) => {
      const p = priced.find((x) => x.id === i.priceItemId);
      if (p.maxPerOrder && i.quantity > p.maxPerOrder) {
        throw new BadRequestException(
          `حداکثر تعداد «${p.title}» در هر سفارش ${p.maxPerOrder.toLocaleString('fa-IR')} عدد است`,
        );
      }
      return { ...p, quantity: i.quantity };
    });
    const goldValue = lines.reduce(
      (s, l) => s.plus(d(l.unitGoldValueRial).times(l.quantity)),
      new Decimal(0),
    );
    const premium = lines.reduce(
      (s, l) => s.plus(d(l.unitPremiumRial).times(l.quantity)),
      new Decimal(0),
    );
    const total = goldValue.plus(premium);
    const grams = lines.reduce(
      (s, l) => s.plus(d(l.weightGrams).times(l.quantity)),
      new Decimal(0),
    );
    const minOrder = await this.systemConfig.getNumber(
      'agent.purchase.min_order_rial',
      0,
    );
    if (minOrder > 0 && total.lessThan(minOrder)) {
      throw new BadRequestException(
        `حداقل مبلغ سفارش ${toman(minOrder)} تومان است`,
      );
    }

    // ── قواعد روش پرداخت ──
    if (dto.paymentMethod === 'CREDIT') {
      if (!agent.creditPurchaseEnabled) {
        throw new ForbiddenException(
          'خرید اعتباری برای نمایندگی شما فعال نیست؛ از کیف پول، درگاه یا واریز بانکی استفاده کنید',
        );
      }
      if (!agent.creditLimitRial) {
        throw new ForbiddenException('سقف اعتبار خرید برای شما تعیین نشده است');
      }
      if (
        d(agent.balanceRial).plus(total).greaterThan(d(agent.creditLimitRial))
      ) {
        throw new ConflictException(
          `مبلغ سفارش از اعتبار باقی‌مانده‌ی شما (${toman(
            Decimal.max(
              d(agent.creditLimitRial).minus(d(agent.balanceRial)),
              0,
            ),
          )} تومان) بیشتر است`,
        );
      }
      const overdue = await this.overdueCredit(agentId);
      if (overdue) {
        throw new ConflictException(
          `بدهی سفارش اعتباری ${overdue.orderNumber} سررسید گذشته است؛ ابتدا آن را تسویه کنید`,
        );
      }
    }

    const lockMinutes = await this.lockMinutes();
    const lockedUntil = new Date(Date.now() + lockMinutes * 60_000);

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.sequence.next(tx, 'AGO');
      const created = await tx.agentPurchaseOrder.create({
        data: {
          orderNumber,
          agentId,
          status: dto.paymentMethod === 'CREDIT' ? 'PAID' : 'PENDING_PAYMENT',
          paymentMethod: dto.paymentMethod,
          totalWeightGrams: grams.toString(),
          goldValueRial: goldValue.toFixed(0),
          premiumRial: premium.toFixed(0),
          totalRial: total.toFixed(0),
          priceLockedUntil: lockedUntil,
          deliveryMethod: dto.deliveryMethod,
          deliveryAddress:
            dto.deliveryMethod === 'SHIPPING' ? dto.deliveryAddress : null,
          note: dto.note,
          createdById: actorId,
          items: {
            create: lines.map((l) => ({
              priceItemId: l.id,
              title: l.title,
              weightGrams: l.weightGrams,
              purityKarat: l.purityKarat,
              quantity: l.quantity,
              pricePerGramRial: l.pricePerGramRial,
              unitGoldValueRial: l.unitGoldValueRial,
              unitPremiumRial: l.unitPremiumRial,
              unitPriceRial: l.unitPriceRial,
              lineTotalRial: d(l.unitPriceRial).times(l.quantity).toFixed(0),
            })),
          },
        },
      });
      if (dto.paymentMethod === 'WALLET') {
        await this.orderPayment.payFromWallet(tx, created.id, actorId);
      }
      if (dto.paymentMethod === 'BANK_TRANSFER') {
        const proforma = await this.invoices.issueAgentPurchaseProforma(
          tx,
          created.id,
          await this.funds.companyDestination(),
        );
        await tx.agentPurchaseOrder.update({
          where: { id: created.id },
          data: { proformaInvoiceId: proforma.id },
        });
      }
      return created;
    }, TX_OPTIONS);

    let redirectUrl: string | null = null;
    if (dto.paymentMethod === 'GATEWAY') {
      redirectUrl = await this.startGateway(
        agentId,
        actorId,
        order.id,
        dto.gateway,
      );
    }
    this.logger.log(
      `[AgentOrder] سفارش ${order.orderNumber} (${dto.paymentMethod}) برای نماینده ${agent.code} ثبت شد — ${total.toFixed(0)} ریال`,
    );
    return {
      message:
        dto.paymentMethod === 'WALLET'
          ? 'سفارش ثبت و از کیف پول پرداخت شد؛ پس از تأیید، صورتحساب و حواله صادر می‌شود'
          : dto.paymentMethod === 'CREDIT'
            ? 'سفارش اعتباری ثبت شد و پس از تأیید، صورتحساب و حواله صادر می‌شود'
            : dto.paymentMethod === 'BANK_TRANSFER'
              ? `پیش‌فاکتور صادر شد؛ واریز را تا ${formatJalaliDateTime(lockedUntil)} انجام و مشخصات آن را ثبت کنید`
              : 'در حال انتقال به درگاه پرداخت',
      order: await this.getOrder(order.id, agentId),
      redirectUrl,
    };
  }

  /** پرداخت درگاهی: مازاد مبلغ سفارش بر موجودی کیف پول از درگاه واریز می‌شود */
  private async startGateway(
    agentId: string,
    actorId: string,
    orderId: string,
    gateway?: 'ZARINPAL' | 'BEHPARDAKHT',
  ) {
    const order = await this.prisma.agentPurchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    const w = await this.wallet.summary(agentId);
    const remaining = d(order.totalRial).minus(d(w.availableRial));
    if (remaining.lte(0)) {
      // موجودی کیف پول کافی است — بدون درگاه پرداخت می‌شود
      await this.prisma.$transaction(
        (tx) => this.orderPayment.payFromWallet(tx, orderId, actorId),
        TX_OPTIONS,
      );
      return null;
    }
    const amount = Decimal.max(remaining, 10_000);
    const res = await this.funds.createDeposit(
      agentId,
      actorId,
      {
        amountRial: amount.toNumber(),
        method: 'GATEWAY',
        gateway: gateway ?? 'ZARINPAL',
        note: `پرداخت سفارش ${order.orderNumber}`,
      },
      order.id,
    );
    return 'redirectUrl' in res ? (res.redirectUrl ?? null) : null;
  }

  async payOrder(
    agentId: string,
    actorId: string,
    orderId: string,
    dto: PayOrderDto,
  ) {
    const order = await this.ownOrder(agentId, orderId);
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException('این سفارش در انتظار پرداخت نیست');
    }
    if (order.priceLockedUntil < new Date()) {
      throw new ConflictException(
        'مهلت اعتبار قیمت این سفارش گذشته است؛ سفارش جدید ثبت کنید',
      );
    }
    if (dto.method === 'WALLET') {
      await this.prisma.$transaction(
        (tx) => this.orderPayment.payFromWallet(tx, orderId, actorId),
        TX_OPTIONS,
      );
      return { message: 'سفارش از کیف پول پرداخت شد', redirectUrl: null };
    }
    const redirectUrl = await this.startGateway(
      agentId,
      actorId,
      orderId,
      dto.gateway,
    );
    return {
      message: redirectUrl
        ? 'در حال انتقال به درگاه پرداخت'
        : 'سفارش از موجودی کیف پول پرداخت شد',
      redirectUrl,
    };
  }

  /** ثبت مشخصات واریز بانکی سفارش در مهلت قفل قیمت */
  async submitTransfer(
    agentId: string,
    actorId: string,
    orderId: string,
    dto: SubmitOrderTransferDto,
  ) {
    const order = await this.ownOrder(agentId, orderId);
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException('این سفارش در انتظار پرداخت نیست');
    }
    if (order.priceLockedUntil < new Date()) {
      throw new ConflictException(
        'مهلت ثبت پرداخت این سفارش گذشته است و سفارش لغو می‌شود',
      );
    }
    const res = await this.funds.createDeposit(
      agentId,
      actorId,
      {
        amountRial: d(order.totalRial).toNumber(),
        method: 'BANK_TRANSFER',
        transferType: dto.transferType,
        sourceBankAccountId: dto.sourceBankAccountId,
        bankReference: dto.bankReference,
        paidAt: dto.paidAt,
        note: `پرداخت سفارش ${order.orderNumber}`,
      },
      order.id,
    );
    await this.prisma.agentPurchaseOrder.updateMany({
      where: { id: order.id, status: 'PENDING_PAYMENT' },
      data: {
        status: 'PAYMENT_REVIEW',
        paymentReference: dto.bankReference.trim(),
      },
    });
    return {
      message:
        'مشخصات واریز ثبت شد؛ پس از تأیید واحد مالی، سفارش پرداخت‌شده محسوب و تأیید می‌شود',
      deposit: 'deposit' in res ? res.deposit : null,
    };
  }

  async cancelByAgent(agentId: string, orderId: string) {
    const res = await this.prisma.agentPurchaseOrder.updateMany({
      where: { id: orderId, agentId, status: 'PENDING_PAYMENT' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'لغو توسط نماینده پیش از پرداخت',
      },
    });
    if (!res.count) {
      throw new ConflictException(
        'فقط سفارش پرداخت‌نشده توسط نماینده قابل لغو است',
      );
    }
    await this.expireProforma(orderId, 'لغو سفارش توسط نماینده');
    return { message: 'سفارش لغو شد' };
  }

  // ══════════════════════════════════════════
  // ── مدیریت: تأیید، تخصیص، تحویل، لغو ──
  // ══════════════════════════════════════════

  /**
   * تأیید سفارش پرداخت‌شده: تخصیص شمش‌های کددار خزانه (وزن و عیار باید دقیقاً با اقلام
   * بخواند)، صورتحساب فروش به نام نماینده، حواله‌ی تحویل و سند درآمد/بهای تمام‌شده.
   * صدور صورتحساب اجباری است؛ اگر ممکن نباشد (تنظیمات ناقص شرکت) تأیید انجام نمی‌شود.
   */
  async approve(
    orderId: string,
    adminId: string,
    dto: ApprovePurchaseOrderDto,
  ) {
    const codes = dto.codes.map((c) => c.trim());
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) throw new BadRequestException(`کد ${dup} تکراری است`);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_purchase_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.agentPurchaseOrder.findUnique({
        where: { id: orderId },
        include: { items: true, agent: true },
      });
      if (!order) throw new NotFoundException('سفارش خرید یافت نشد');
      if (order.status !== 'PAID') {
        throw new ConflictException(
          'فقط سفارش پرداخت‌شده (یا اعتباری ثبت‌شده) قابل تأیید است',
        );
      }
      const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
      if (codes.length !== totalQty) {
        throw new BadRequestException(
          `تعداد کدها (${codes.length.toLocaleString('fa-IR')}) با تعداد شمش سفارش (${totalQty.toLocaleString('fa-IR')}) برابر نیست`,
        );
      }

      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" IN (${Prisma.join(codes)}) FOR UPDATE`;
      const bars = await tx.hologramCode.findMany({
        where: { code: { in: codes } },
        include: {
          ownerships: { where: { status: 'ACTIVE' }, take: 1 },
          incidentReports: {
            where: { status: { in: ['OPEN', 'CONFIRMED'] } },
            take: 1,
          },
        },
      });
      const missing = codes.filter((c) => !bars.some((b) => b.code === c));
      if (missing.length) {
        throw new NotFoundException(`کد(های) یافت نشد: ${missing.join('، ')}`);
      }
      const bad = bars.filter(
        (b) =>
          b.status !== 'UNASSIGNED' ||
          !b.weightGrams ||
          !b.purityKarat ||
          b.shopOrderItemId !== null ||
          b.ownerships.length > 0 ||
          b.incidentReports.length > 0,
      );
      if (bad.length) {
        throw new ConflictException(
          `این کدها شمش کددار آزاد خزانه نیستند (کدگذاری‌نشده، فروخته‌شده، امانی یا گزارش‌شده): ${bad
            .map((b) => b.code)
            .join('، ')}`,
        );
      }
      // تطبیق وزن/عیار با اقلام سفارش
      for (const item of order.items) {
        const matching = bars.filter(
          (b) =>
            b.purityKarat === item.purityKarat &&
            d(b.weightGrams).equals(d(item.weightGrams)),
        ).length;
        const needed = order.items
          .filter(
            (x) =>
              x.purityKarat === item.purityKarat &&
              d(x.weightGrams).equals(d(item.weightGrams)),
          )
          .reduce((s, x) => s + x.quantity, 0);
        if (matching !== needed) {
          throw new BadRequestException(
            `برای «${item.title}» باید ${needed.toLocaleString('fa-IR')} شمش ${d(item.weightGrams).toString()} گرمی عیار ${
              item.purityKarat === 'K24' ? '۲۴' : '۱۸'
            } تخصیص داده شود (تخصیص فعلی: ${matching.toLocaleString('fa-IR')})`,
          );
        }
      }

      const now = new Date();
      const voucherNumber = await this.sequence.next(tx, 'AGV');
      for (const item of order.items) {
        const ids = bars
          .filter(
            (b) =>
              b.purityKarat === item.purityKarat &&
              d(b.weightGrams).equals(d(item.weightGrams)),
          )
          .map((b) => b.id);
        await tx.hologramCode.updateMany({
          where: { id: { in: ids }, status: 'UNASSIGNED' },
          data: {
            status: 'AGENT_OWNED',
            agentId: order.agentId,
            agentAllocatedAt: now,
            agentPremiumRial: item.unitPremiumRial,
          },
        });
      }
      const changed = await tx.hologramCode.count({
        where: {
          id: { in: bars.map((b) => b.id) },
          status: 'AGENT_OWNED',
          agentId: order.agentId,
        },
      });
      if (changed !== bars.length) {
        throw new ConflictException(
          'وضعیت برخی شمش‌ها هم‌زمان تغییر کرد؛ دوباره تلاش کنید',
        );
      }

      const grams = bars.reduce(
        (s, b) => s.plus(d(b.weightGrams)),
        new Decimal(0),
      );
      const credit = order.paymentMethod === 'CREDIT';
      const journal = await this.agentAccounting.journalPurchaseSale(tx, {
        agentTag: agentTag(order.agent.code),
        orderNumber: order.orderNumber,
        goldValueRial: d(order.goldValueRial),
        premiumRial: d(order.premiumRial),
        totalGrams: grams,
        credit,
      });
      await tx.agentStockMovement.createMany({
        data: bars.map((b) => ({
          voucherNumber,
          agentId: order.agentId,
          hologramCodeId: b.id,
          type: 'PURCHASE' as const,
          weightGrams: b.weightGrams ?? 0,
          referenceId: order.id,
          journalEntryId: journal.id,
          performedByAdminId: adminId,
          note: `فروش قطعی به نماینده — سفارش ${order.orderNumber}`,
        })),
      });
      if (credit) {
        await this.agentAccounting.postLedger(tx, {
          agentId: order.agentId,
          type: 'PURCHASE',
          debitRial: d(order.totalRial),
          description: `خرید اعتباری شمش — سفارش ${order.orderNumber}`,
          referenceType: 'AGENT_PURCHASE',
          referenceId: order.id,
          referenceNumber: order.orderNumber,
          journalEntryId: journal.id,
          createdByAdminId: adminId,
        });
      }

      const paymentLabel = credit
        ? `خرید اعتباری — سررسید پرداخت ${order.agent.creditDays ?? 0} روز پس از تحویل`
        : `${PURCHASE_METHOD_FA[order.paymentMethod]} — پرداخت کامل پیش از تحویل${
            order.paymentReference ? ` (مرجع ${order.paymentReference})` : ''
          }`;
      const invoice = await this.invoices.issueAgentPurchaseInvoice(
        tx,
        order.id,
        bars.map((b) => ({
          code: b.code,
          weightGrams: d(b.weightGrams).toString(),
          purityKarat: b.purityKarat,
        })),
        paymentLabel,
      );
      if (order.proformaInvoiceId) {
        await tx.invoice.updateMany({
          where: { id: order.proformaInvoiceId, status: 'ISSUED' },
          data: { status: 'CONSUMED' },
        });
      }
      const updated = await tx.agentPurchaseOrder.update({
        where: { id: order.id },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          approvedById: adminId,
          voucherNumber,
          invoiceId: invoice.id,
          saleJournalId: journal.id,
          adminNote: dto.adminNote,
          creditDueAt: credit
            ? new Date(
                now.getTime() + (order.agent.creditDays ?? 0) * 86_400_000,
              )
            : null,
        },
      });
      return { order: updated, agent: order.agent };
    }, TX_OPTIONS);

    void this.sms
      .send(
        'AGENT_ORDER_APPROVED',
        result.agent.phone,
        {
          agentName: result.agent.name,
          requestNumber: result.order.orderNumber,
        },
        { referenceType: 'AGENT_PURCHASE', referenceId: result.order.id },
      )
      .catch(() => undefined);
    return {
      message:
        'سفارش تأیید شد؛ شمش‌ها تخصیص یافت، صورتحساب به نام نماینده و حواله صادر شد',
      order: await this.getOrder(result.order.id),
    };
  }

  /** ثبت تحویل فیزیکی (حضوری یا تحویل به متصدی حمل) توسط شرکت */
  async markDelivered(orderId: string, adminId: string, note?: string) {
    const order = await this.prisma.agentPurchaseOrder.findUnique({
      where: { id: orderId },
      include: { agent: { select: { creditDays: true } } },
    });
    if (!order) throw new NotFoundException('سفارش خرید یافت نشد');
    if (order.status !== 'APPROVED' || order.deliveredAt) {
      throw new ConflictException('این سفارش در وضعیت ثبت تحویل نیست');
    }
    const now = new Date();
    await this.prisma.agentPurchaseOrder.update({
      where: { id: order.id },
      data: {
        deliveredAt: now,
        adminNote: note
          ? `${order.adminNote ? `${order.adminNote}\n` : ''}تحویل: ${note}`
          : undefined,
        // سررسید اعتبار از تاریخ تحویل (بند ۵-۲)
        ...(order.paymentMethod === 'CREDIT'
          ? {
              creditDueAt: new Date(
                now.getTime() + (order.agent.creditDays ?? 0) * 86_400_000,
              ),
            }
          : {}),
      },
    });
    this.logger.log(
      `[AgentOrder] تحویل سفارش ${order.orderNumber} توسط ${adminId} ثبت شد`,
    );
    return {
      message:
        'تحویل ثبت شد؛ نماینده باید دریافت شمش‌ها را در پنل تأیید کند (بند ۶-۳ قرارداد)',
    };
  }

  /**
   * تأیید رسید: نماینده تعداد، وزن درج‌شده، سلامت بسته‌بندی و هولوگرام را بررسی و تأیید می‌کند.
   * مدیر هم می‌تواند با رسید کتبی امضاشده‌ی نماینده آن را ثبت کند.
   */
  async confirmReceipt(
    orderId: string,
    actor: { adminUserId: string; agentId?: string },
  ) {
    const order = await this.prisma.agentPurchaseOrder.findUnique({
      where: { id: orderId },
    });
    if (!order || (actor.agentId && order.agentId !== actor.agentId)) {
      throw new NotFoundException('سفارش خرید یافت نشد');
    }
    if (order.status !== 'APPROVED') {
      throw new ConflictException('این سفارش در انتظار تأیید رسید نیست');
    }
    const now = new Date();
    await this.prisma.agentPurchaseOrder.update({
      where: { id: order.id },
      data: {
        status: 'DELIVERED',
        deliveredAt: order.deliveredAt ?? now,
        receiptConfirmedAt: now,
        receiptConfirmedBy: actor.adminUserId,
      },
    });
    return { message: 'دریافت شمش‌ها تأیید شد' };
  }

  /**
   * لغو سفارش توسط مدیریت پیش از تأیید. وجه سفارش پرداخت‌شده به کیف پول نماینده برمی‌گردد
   * (بد 2080 / بس 2070). سفارش تأییدشده لغو نمی‌شود (بیع قطعی) — فقط با فروش شمش به شرکت.
   */
  async adminCancel(orderId: string, reason: string, adminId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_purchase_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.agentPurchaseOrder.findUnique({
        where: { id: orderId },
        include: { agent: true },
      });
      if (!order) throw new NotFoundException('سفارش خرید یافت نشد');
      if (
        !['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID'].includes(order.status)
      ) {
        throw new ConflictException(
          'سفارش تأییدشده بیع قطعی است و لغو نمی‌شود؛ در صورت توافق، شمش‌ها از مسیر «فروش شمش به شرکت» بازگردانده شوند',
        );
      }
      let refunded = false;
      if (order.status === 'PAID' && order.paymentMethod !== 'CREDIT') {
        const amount = d(order.totalRial);
        const journal = await this.agentAccounting.journalOrderPayment(tx, {
          agentTag: agentTag(order.agent.code),
          orderNumber: order.orderNumber,
          amountRial: amount,
          refund: true,
        });
        await this.wallet.post(tx, {
          agentId: order.agentId,
          type: 'PURCHASE_REFUND',
          creditRial: amount,
          description: `برگشت وجه سفارش لغوشده ${order.orderNumber}: ${reason.trim()}`,
          referenceType: 'AGENT_PURCHASE',
          referenceId: order.id,
          referenceNumber: order.orderNumber,
          journalEntryId: journal.id,
          createdByAdminId: adminId,
        });
        refunded = true;
      }
      await tx.agentPurchaseOrder.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason.trim(),
        },
      });
      return { order, refunded };
    }, TX_OPTIONS);
    await this.expireProforma(orderId, `لغو سفارش: ${reason.trim()}`);
    void this.sms
      .send(
        'AGENT_ORDER_CANCELLED',
        result.order.agent.phone,
        {
          agentName: result.order.agent.name,
          requestNumber: result.order.orderNumber,
          reason: reason.trim(),
        },
        { referenceType: 'AGENT_PURCHASE', referenceId: result.order.id },
      )
      .catch(() => undefined);
    return {
      message: result.refunded
        ? 'سفارش لغو و وجه آن به کیف پول نماینده برگشت داده شد'
        : 'سفارش لغو شد',
    };
  }

  private async expireProforma(orderId: string, reason: string) {
    const order = await this.prisma.agentPurchaseOrder.findUnique({
      where: { id: orderId },
      select: { proformaInvoiceId: true },
    });
    if (!order?.proformaInvoiceId) return;
    await this.prisma.invoice
      .updateMany({
        where: { id: order.proformaInvoiceId, status: 'ISSUED' },
        data: { status: 'EXPIRED', cancelReason: reason },
      })
      .catch(() => undefined);
  }

  /** سفارش‌های پرداخت‌نشده پس از پایان مهلت قفل قیمت خودبه‌خود لغو می‌شوند (بند ۴-۲) */
  @Cron('*/2 * * * *', { name: 'expire-agent-purchase-orders' })
  async expireOverdue() {
    try {
      const rows = await this.prisma.agentPurchaseOrder.findMany({
        where: {
          status: 'PENDING_PAYMENT',
          priceLockedUntil: { lt: new Date() },
        },
        select: { id: true },
        take: 200,
      });
      for (const r of rows) {
        // درگاهی که هنوز در جریان است (کاربر در صفحه‌ی بانک) تا منقضی شدن واریز صبر می‌کند
        const pendingGateway = await this.prisma.agentDepositRequest.count({
          where: {
            purchaseOrderId: r.id,
            method: 'GATEWAY',
            status: 'PENDING_PAYMENT',
            expiresAt: { gt: new Date() },
          },
        });
        if (pendingGateway) continue;
        const res = await this.prisma.agentPurchaseOrder.updateMany({
          where: { id: r.id, status: 'PENDING_PAYMENT' },
          data: {
            status: 'EXPIRED',
            cancelledAt: new Date(),
            cancelReason: 'عدم پرداخت در مهلت اعتبار قیمت (بند ۴-۲ قرارداد)',
          },
        });
        if (res.count) await this.expireProforma(r.id, 'پایان مهلت پرداخت');
      }
    } catch (err) {
      this.logger.error(
        `[AgentOrder] منقضی‌سازی سفارش‌ها ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  // ══════════════════════════════════════════
  // ── فهرست و جزئیات ──
  // ══════════════════════════════════════════

  private async ownOrder(agentId: string, orderId: string) {
    const order = await this.prisma.agentPurchaseOrder.findFirst({
      where: { id: orderId, agentId },
    });
    if (!order) throw new NotFoundException('سفارش خرید یافت نشد');
    return order;
  }

  async listOrders(agentScope: string | null, query: TradingListQueryDto) {
    const agentId = agentScope ?? query.agentId;
    const range = dateRange(query.from, query.to);
    const where: Prisma.AgentPurchaseOrderWhereInput = {
      ...(agentId ? { agentId } : {}),
      ...(query.status
        ? {
            status:
              query.status as Prisma.EnumAgentPurchaseStatusFilter['equals'],
          }
        : {}),
      ...(range ? { createdAt: range } : {}),
      ...(query.search
        ? { orderNumber: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total, sums] = await Promise.all([
      this.prisma.agentPurchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: { select: { id: true, code: true, name: true } },
          items: true,
        },
      }),
      this.prisma.agentPurchaseOrder.count({ where }),
      this.prisma.agentPurchaseOrder.aggregate({
        where: { ...where, status: { in: ['APPROVED', 'DELIVERED'] } },
        _sum: { totalRial: true, totalWeightGrams: true },
        _count: { _all: true },
      }),
    ]);
    return {
      data: items.map((o) => ({
        ...o,
        statusLabel: PURCHASE_STATUS_FA[o.status] ?? o.status,
        paymentMethodLabel: PURCHASE_METHOD_FA[o.paymentMethod],
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      totals: {
        approvedCount: sums._count._all,
        totalRial: d(sums._sum.totalRial).toFixed(0),
        grams: d(sums._sum.totalWeightGrams).toString(),
      },
    };
  }

  async getOrder(orderId: string, agentScope?: string) {
    const order = await this.prisma.agentPurchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            creditDays: true,
          },
        },
        items: true,
        deposits: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            requestNumber: true,
            method: true,
            status: true,
            amountRial: true,
            bankReference: true,
            transferType: true,
            createdAt: true,
          },
        },
      },
    });
    if (!order || (agentScope && order.agentId !== agentScope)) {
      throw new NotFoundException('سفارش خرید یافت نشد');
    }
    const bars = order.voucherNumber
      ? await this.prisma.agentStockMovement.findMany({
          where: { voucherNumber: order.voucherNumber, type: 'PURCHASE' },
          select: {
            weightGrams: true,
            hologramCode: {
              select: {
                code: true,
                purityKarat: true,
                factorySerialNumber: true,
              },
            },
          },
        })
      : [];
    const wallet = agentScope ? await this.wallet.summary(order.agentId) : null;
    return {
      ...order,
      statusLabel: PURCHASE_STATUS_FA[order.status] ?? order.status,
      paymentMethodLabel: PURCHASE_METHOD_FA[order.paymentMethod],
      lockExpired:
        order.status === 'PENDING_PAYMENT' &&
        order.priceLockedUntil < new Date(),
      bars: bars.map((b) => ({
        code: b.hologramCode.code,
        purityKarat: b.hologramCode.purityKarat,
        factorySerialNumber: b.hologramCode.factorySerialNumber,
        weightGrams: b.weightGrams.toString(),
      })),
      wallet,
    };
  }

  /** پیشنهاد شمش‌های کددار آزاد خزانه برای تخصیص به سفارش (هم‌وزن و هم‌عیار) */
  async allocationCandidates(orderId: string) {
    const order = await this.prisma.agentPurchaseOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('سفارش خرید یافت نشد');
    const groups = await Promise.all(
      order.items.map(async (item) => {
        const bars = await this.prisma.hologramCode.findMany({
          where: {
            status: 'UNASSIGNED',
            shopOrderItemId: null,
            weightGrams: item.weightGrams,
            purityKarat: item.purityKarat,
            ownerships: { none: { status: 'ACTIVE' } },
            incidentReports: {
              none: { status: { in: ['OPEN', 'CONFIRMED'] } },
            },
          },
          orderBy: { vaultCodedAt: 'asc' },
          take: Math.min(item.quantity * 3, 300),
          select: { code: true, factorySerialNumber: true, vaultCodedAt: true },
        });
        return {
          itemId: item.id,
          title: item.title,
          weightGrams: item.weightGrams.toString(),
          purityKarat: item.purityKarat,
          quantity: item.quantity,
          available: bars,
        };
      }),
    );
    return { orderNumber: order.orderNumber, groups };
  }
}
