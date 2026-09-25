// api/src/partners/partner-orders.service.ts
//
// چرخه‌ی سفارش شرکای فروش (خرید اقساطی طلا از طریق اسنپ‌پی/دیجی‌پی یا اپ همکار):
//
//   PENDING   ثبت قرارداد/سفارش با قیمت قفل‌شده — هنوز اثر مالی ندارد
//   CONFIRMED شریک پرداخت را تضمین کرد:
//             آب‌شده → طلا به کیف پول مشتری واریز و بدهی طلایی/کسری پوشش ثبت می‌شود
//             شمش    → مالکیت شمش کددار خزانه به نام مشتری ثبت و بهای تمام‌شده شناسایی می‌شود
//             و طلب از شریک (خالص پس از کارمزد) در دفتر معین شریک بدهکار می‌شود
//   SETTLED   وجه از شریک دریافت شد (PartnerSettlement)
//   CANCELLED لغو پیش از تأیید
//   REFUNDED  استرداد پس از تأیید (طلا از کیف پول کسر / مالکیت شمش باطل و سند برگشت)
//
// سند تأیید (آب‌شده):
//   بدهکار 1050 دریافتنی از شریک (خالص)  بدهکار 5080 کارمزد شریک
//   بستانکار 2020 بدهی طلایی (ارزش، گرم)  بدهکار 1090 کسری پوشش (گرم)
//   بستانکار 4010 کارمزد خدمات             بستانکار 2030 مالیات
// سند تأیید (شمش):
//   بدهکار 1050 / 5080 — بستانکار 4040 ارزش طلا / 4050 اجرت / 4010 / 2030
//   بدهکار 5060 بهای تمام‌شده / بستانکار 1025 موجودی شمش (گرم، بهای میانگین)

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { PartnerOrder, Prisma, SalesPartner } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  AccountingService,
  LedgerLineInput,
  toDecimal,
} from '../accounting/accounting.service';
import { PartyLedgerService } from '../accounting/party-ledger.service';
import { ACC } from '../accounting/accounts.seed';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { InvoiceService } from '../invoice/invoice.service';
import {
  ListPartnerOrdersQueryDto,
  ListSettlementsQueryDto,
  PartnerOrderDto,
  PartnerSettlementDto,
} from './partners.dto';

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };
const s = (v: Decimal | Prisma.Decimal | null | undefined) =>
  v == null ? '0' : v.toString();

export interface CreateOrderInput {
  partnerId: string;
  externalRef: string;
  customerPhone: string;
  customerNationalCode?: string;
  productKind: 'MELTED_GOLD' | 'BULLION';
  amountGrams?: string;
  amountRial?: string;
  hologramCode?: string;
  pricePerGramRial?: string;
  wageRial?: string;
  taxRial?: string;
  downPaymentRial?: string;
  installmentCount?: number;
  installmentPlan?: Record<string, unknown>;
  note?: string;
  createdVia: 'ADMIN' | 'API';
  createdByAdminId?: string | null;
}

export const PARTNER_METHOD_FA: Record<string, string> = {
  CASH: 'نقدی',
  BANK_TRANSFER: 'واریز بانکی',
  CARD_TO_CARD: 'کارت به کارت',
  POS: 'کارتخوان',
  CHEQUE: 'چک',
};

@Injectable()
export class PartnerOrdersService {
  private readonly logger = new Logger(PartnerOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly partyLedger: PartyLedgerService,
    private readonly sequence: DocumentSequenceService,
    private readonly config: SystemConfigService,
    private readonly pricing: PricingEngineService,
    private readonly invoices: InvoiceService,
  ) {}

  // ═══════════════════════════════════════════
  // قیمت‌گذاری
  // ═══════════════════════════════════════════
  async meltedQuote() {
    const [market, spread, feePct, taxPct] = await Promise.all([
      this.accounting.currentGoldPriceRial(),
      this.config.getDecimal('partner.quote_spread_percent', '0'),
      this.config.getDecimal('partner.fee_percent', '0'),
      this.config.getDecimal('tax.buy', '0'),
    ]);
    if (market.lte(0)) {
      throw new BadRequestException('قیمت لحظه‌ای طلا در دسترس نیست');
    }
    const price = market
      .times(new Decimal(1).plus(new Decimal(spread.toString()).div(100)))
      .toDecimalPlaces(0, Decimal.ROUND_UP);
    return {
      marketPricePerGramRial: market,
      pricePerGramRial: price,
      feePercent: new Decimal(feePct.toString()),
      taxPercent: new Decimal(taxPct.toString()),
    };
  }

  private commissionOf(partner: SalesPartner, total: Decimal): Decimal {
    return total
      .times(toDecimal(partner.commissionPercent))
      .div(100)
      .plus(toDecimal(partner.commissionFixedRial))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  // ═══════════════════════════════════════════
  // ثبت سفارش
  // ═══════════════════════════════════════════
  async create(input: CreateOrderInput) {
    const partner = await this.prisma.salesPartner.findUnique({
      where: { id: input.partnerId },
    });
    if (!partner) throw new NotFoundException('شریک فروش یافت نشد');

    // idempotency: همان externalRef همان سفارش را برمی‌گرداند
    const existing = await this.prisma.partnerOrder.findUnique({
      where: {
        partnerId_externalRef: {
          partnerId: partner.id,
          externalRef: input.externalRef,
        },
      },
    });
    if (existing) {
      return { alreadyExists: true, order: this.dto(existing, partner) };
    }

    if (partner.status !== 'ACTIVE') {
      throw new ForbiddenException('همکاری با این شریک فعال نیست');
    }
    if (partner.contractEndAt && partner.contractEndAt < new Date()) {
      throw new ForbiddenException('قرارداد این شریک منقضی شده است');
    }
    if (!partner.allowedProducts.includes(input.productKind)) {
      throw new BadRequestException(
        'فروش این نوع کالا برای این شریک مجاز نیست',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: input.customerPhone },
      include: { identity: true },
    });
    if (!user) {
      throw new BadRequestException(
        'مشتری با این شماره در آرکان گلد ثبت‌نام نکرده است',
      );
    }
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('حساب کاربری مشتری فعال نیست');
    }
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new BadRequestException('احراز هویت مشتری تکمیل نشده است');
    }
    if (
      input.customerNationalCode &&
      user.identity.nationalCode !== input.customerNationalCode
    ) {
      throw new BadRequestException('کد ملی با صاحب شماره موبایل مطابقت ندارد');
    }

    // ── محاسبه‌ی مبالغ ──
    let grams: Decimal;
    let price: Decimal;
    let goldValue: Decimal;
    let wage = new Decimal(input.wageRial ?? 0);
    let fee = new Decimal(0);
    let tax = new Decimal(input.taxRial ?? 0);
    let hologramCodeId: string | null = null;

    if (input.productKind === 'MELTED_GOLD') {
      const q = await this.meltedQuote();
      price = input.pricePerGramRial
        ? new Decimal(input.pricePerGramRial)
        : q.pricePerGramRial;
      if (input.amountGrams) {
        grams = new Decimal(input.amountGrams);
      } else if (input.amountRial) {
        // مبلغ کل = گرم × قیمت × (۱ + کارمزد٪ + مالیات٪)
        const factor = new Decimal(1).plus(
          q.feePercent.plus(q.taxPercent).div(100),
        );
        grams = new Decimal(input.amountRial)
          .div(price.times(factor))
          .toDecimalPlaces(4, Decimal.ROUND_DOWN);
      } else {
        throw new BadRequestException('مقدار (گرم) یا مبلغ سفارش الزامی است');
      }
      if (grams.lte(0) || grams.decimalPlaces() > 4) {
        throw new BadRequestException('مقدار طلا نامعتبر است');
      }
      goldValue = grams.times(price).toDecimalPlaces(0);
      fee = goldValue.times(q.feePercent).div(100).toDecimalPlaces(0);
      if (!input.taxRial) {
        tax = goldValue.times(q.taxPercent).div(100).toDecimalPlaces(0);
      }
      wage = new Decimal(0);
    } else {
      if (!input.hologramCode) {
        throw new BadRequestException('کد هولوگرام شمش الزامی است');
      }
      const bar = await this.prisma.hologramCode.findUnique({
        where: { code: input.hologramCode },
        include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
      });
      if (
        !bar ||
        bar.status !== 'UNASSIGNED' ||
        !bar.weightGrams ||
        bar.shopOrderItemId ||
        bar.ownerships.length
      ) {
        throw new ConflictException(
          'این شمش در موجودی کددار خزانه نیست (کد خام، فروخته‌شده یا امانی)',
        );
      }
      const pending = await this.prisma.partnerOrder.findFirst({
        where: { hologramCodeId: bar.id, status: 'PENDING' },
      });
      if (pending) {
        throw new ConflictException(
          `این شمش در سفارش در انتظار ${pending.orderNumber} رزرو است`,
        );
      }
      hologramCodeId = bar.id;
      grams = toDecimal(bar.weightGrams);
      price = input.pricePerGramRial
        ? new Decimal(input.pricePerGramRial)
        : await this.pricing.getGoldPricePerGram(bar.purityKarat ?? 'K18');
      goldValue = grams.times(price).toDecimalPlaces(0);
    }
    for (const [v, label] of [
      [wage, 'اجرت'],
      [tax, 'مالیات'],
    ] as const) {
      if (v.isNegative() || !v.isInteger()) {
        throw new BadRequestException(`${label} نامعتبر است`);
      }
    }
    const total = goldValue.plus(wage).plus(fee).plus(tax);
    if (partner.minOrderRial && total.lt(toDecimal(partner.minOrderRial))) {
      throw new BadRequestException(
        `حداقل مبلغ سفارش این شریک ${s(partner.minOrderRial)} ریال است`,
      );
    }
    if (partner.maxOrderRial && total.gt(toDecimal(partner.maxOrderRial))) {
      throw new BadRequestException(
        `حداکثر مبلغ سفارش این شریک ${s(partner.maxOrderRial)} ریال است`,
      );
    }
    const commission = this.commissionOf(partner, total);
    const net = total.minus(commission);
    if (net.lte(0))
      throw new BadRequestException('کارمزد شریک بیش از مبلغ سفارش است');

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.sequence.next(tx, 'PTO');
      return tx.partnerOrder.create({
        data: {
          orderNumber,
          partnerId: partner.id,
          externalRef: input.externalRef,
          userId: user.id,
          productKind: input.productKind,
          amountGrams: grams.toString(),
          hologramCodeId,
          pricePerGramRial: price.toFixed(0),
          goldValueRial: goldValue.toFixed(0),
          wageRial: wage.toFixed(0),
          feeRial: fee.toFixed(0),
          taxRial: tax.toFixed(0),
          totalRial: total.toFixed(0),
          downPaymentRial: new Decimal(input.downPaymentRial ?? 0).toFixed(0),
          installmentCount: input.installmentCount,
          installmentPlan: input.installmentPlan as Prisma.InputJsonValue,
          commissionRial: commission.toFixed(0),
          netReceivableRial: net.toFixed(0),
          customerSnapshot: {
            fullName:
              `${user.identity?.firstName ?? ''} ${user.identity?.lastName ?? ''}`.trim(),
            nationalCode: user.identity?.nationalCode ?? null,
            phone: user.phone,
          },
          note: input.note,
          createdVia: input.createdVia,
          createdByAdminId: input.createdByAdminId ?? null,
        },
      });
    }, TX_OPTIONS);
    this.logger.log(
      `[Partner] سفارش ${order.orderNumber} (${partner.code}/${input.externalRef}) ثبت شد — ${grams.toString()}g — ${total.toString()} ریال`,
    );
    return { alreadyExists: false, order: this.dto(order, partner) };
  }

  // ═══════════════════════════════════════════
  // تأیید (تضمین پرداخت توسط شریک)
  // ═══════════════════════════════════════════
  private async lock(tx: Tx, id: string) {
    await tx.$executeRaw`SELECT 1 FROM "partner_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const o = await tx.partnerOrder.findUnique({
      where: { id },
      include: { partner: true },
    });
    if (!o) throw new NotFoundException('سفارش شریک یافت نشد');
    return o;
  }

  async confirm(id: string, adminId: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, id);
      if (o.status === 'CONFIRMED' || o.status === 'SETTLED') {
        return { alreadyProcessed: true, order: o };
      }
      if (o.status !== 'PENDING') {
        throw new ConflictException('فقط سفارش در انتظار قابل تأیید است');
      }
      const partner = o.partner;
      if (partner.status !== 'ACTIVE') {
        throw new ForbiddenException('همکاری با این شریک فعال نیست');
      }
      if (o.createdVia === 'API') {
        const ttlMin = await this.config.getNumber(
          'partner.quote_ttl_minutes',
          30,
        );
        if (Date.now() - o.createdAt.getTime() > ttlMin * 60_000) {
          throw new ConflictException(
            'اعتبار قیمت این سفارش منقضی شده است؛ سفارش را لغو و دوباره ثبت کنید',
          );
        }
      }
      const net = toDecimal(o.netReceivableRial);
      if (partner.creditLimitRial) {
        const exposure = toDecimal(partner.balanceRial).plus(net);
        if (exposure.gt(toDecimal(partner.creditLimitRial))) {
          throw new ConflictException(
            `سقف اعتبار شریک (${s(partner.creditLimitRial)} ریال) با این سفارش رد می‌شود`,
          );
        }
      }

      const grams = toDecimal(o.amountGrams);
      const goldValue = toDecimal(o.goldValueRial);
      const wage = toDecimal(o.wageRial);
      const fee = toDecimal(o.feeRial);
      const tax = toDecimal(o.taxRial);
      const commission = toDecimal(o.commissionRial);
      const total = toDecimal(o.totalRial);
      const tag = `${o.orderNumber} — ${partner.name} [${partner.code}] مرجع ${o.externalRef}`;
      const lines: LedgerLineInput[] = [
        { accountCode: ACC.PARTNER_RECEIVABLE, side: 'DEBIT', amountRial: net },
      ];
      if (commission.gt(0)) {
        lines.push({
          accountCode: ACC.PARTNER_COMMISSION,
          side: 'DEBIT',
          amountRial: commission,
        });
      }
      if (fee.gt(0)) {
        lines.push({
          accountCode: ACC.TRADE_FEE,
          side: 'CREDIT',
          amountRial: fee,
        });
      }
      if (tax.gt(0)) {
        lines.push({
          accountCode: ACC.TAX_PAYABLE,
          side: 'CREDIT',
          amountRial: tax,
        });
      }
      let transactionId: string | null = null;

      if (o.productKind === 'MELTED_GOLD') {
        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${o.userId}::uuid FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({
          where: { userId: o.userId },
        });
        if (!wallet) throw new NotFoundException('کیف پول مشتری یافت نشد');
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { goldBalanceGrams: { increment: grams.toString() } },
        });
        const t = await tx.transaction.create({
          data: {
            userId: o.userId,
            walletId: wallet.id,
            type: 'INSTALLMENT_PURCHASE',
            amountGrams: grams.toString(),
            amountRial: total.toFixed(0),
            pricePerGram: o.pricePerGramRial,
            feeAmount: o.feeRial,
            taxAmount: o.taxRial,
            status: 'COMPLETED',
            description: `partner:${partner.code}|order:${o.orderNumber}|ref:${o.externalRef}`,
          },
        });
        transactionId = t.id;
        lines.push(
          {
            accountCode: ACC.USER_GOLD,
            side: 'CREDIT',
            amountRial: goldValue,
            amountGrams: grams,
          },
          { accountCode: ACC.GOLD_COVERAGE, side: 'DEBIT', amountGrams: grams },
        );
      } else {
        if (!o.hologramCodeId)
          throw new ConflictException('شمش سفارش مشخص نیست');
        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${o.hologramCodeId}::uuid FOR UPDATE`;
        const bar = await tx.hologramCode.findUnique({
          where: { id: o.hologramCodeId },
          include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
        });
        if (
          !bar ||
          bar.status !== 'UNASSIGNED' ||
          bar.shopOrderItemId ||
          bar.ownerships.length
        ) {
          throw new ConflictException('این شمش دیگر در موجودی خزانه نیست');
        }
        const identity = await tx.userIdentity.findUnique({
          where: { userId: o.userId },
        });
        await tx.hologramOwnership.create({
          data: {
            hologramCodeId: bar.id,
            ownerUserId: o.userId,
            fullName:
              `${identity?.firstName ?? ''} ${identity?.lastName ?? ''}`.trim(),
            nationalCode: identity?.nationalCode ?? '',
            status: 'ACTIVE',
            transferType: 'INITIAL_PURCHASE',
          },
        });
        await tx.hologramCode.update({
          where: { id: bar.id },
          data: {
            status: 'ASSIGNED',
            assignedAt: new Date(),
            assignedByAdminId: adminId,
          },
        });
        const cost = await this.accounting.averageCostRial(
          tx,
          ACC.BULLION,
          grams,
        );
        lines.push(
          { accountCode: ACC.BAR_SALE, side: 'CREDIT', amountRial: goldValue },
          {
            accountCode: ACC.BAR_COGS,
            side: 'DEBIT',
            amountRial: cost,
            amountGrams: grams,
          },
          {
            accountCode: ACC.BULLION,
            side: 'CREDIT',
            amountRial: cost,
            amountGrams: grams,
          },
        );
        if (wage.gt(0)) {
          lines.push({
            accountCode: ACC.BAR_PREMIUM,
            side: 'CREDIT',
            amountRial: wage,
          });
        }
      }

      const journal = await this.accounting.postJournal(tx, {
        description: `فروش ${o.productKind === 'MELTED_GOLD' ? 'طلای آب‌شده' : 'شمش'} از طریق شریک — ${grams.toString()} گرم — ${tag}`,
        totalRial: total,
        totalGrams: grams,
        source: 'PARTNER',
        referenceType: 'PARTNER_ORDER',
        referenceId: o.id,
        createdByAdminId: adminId,
        transactionId: transactionId ?? undefined,
        lines,
      });
      await this.partyLedger.post(tx, {
        partyType: 'PARTNER',
        partyId: partner.id,
        type: 'ORDER',
        debitRial: net,
        description: `فروش ${tag} (مبلغ ${total.toString()} − کارمزد ${commission.toString()})`,
        referenceType: 'PARTNER_ORDER',
        referenceId: o.id,
        referenceNumber: o.orderNumber,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });
      const now = new Date();
      const updated = await tx.partnerOrder.update({
        where: { id: o.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: now,
          dueDate: new Date(now.getTime() + partner.settlementDays * 86400_000),
          confirmJournalId: journal.id,
          transactionId,
        },
        include: { partner: true },
      });
      return { alreadyProcessed: false, order: updated };
    }, TX_OPTIONS);

    if (!result.alreadyProcessed) {
      await this.issueInvoice(result.order.id);
    }
    return {
      message: result.alreadyProcessed
        ? 'این سفارش قبلاً تأیید شده است'
        : result.order.productKind === 'MELTED_GOLD'
          ? 'سفارش تأیید و طلا به کیف پول مشتری واریز شد'
          : 'سفارش تأیید و مالکیت شمش به نام مشتری ثبت شد',
      alreadyProcessed: result.alreadyProcessed,
      order: this.dto(result.order, result.order.partner),
    };
  }

  private async issueInvoice(orderId: string) {
    try {
      const invoice = await this.prisma.$transaction((tx) =>
        this.invoices.issueForPartnerOrder(tx, orderId),
      );
      await this.prisma.partnerOrder.update({
        where: { id: orderId },
        data: { invoiceId: invoice.id },
      });
    } catch (err) {
      this.logger.error(
        `[Partner] صدور فاکتور سفارش ${orderId} ناموفق بود: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async retryInvoice(id: string) {
    const o = await this.prisma.partnerOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('سفارش یافت نشد');
    if (o.status !== 'CONFIRMED' && o.status !== 'SETTLED') {
      throw new ConflictException('فاکتور فقط برای سفارش تأییدشده صادر می‌شود');
    }
    if (!o.invoiceId) await this.issueInvoice(id);
    const fresh = await this.prisma.partnerOrder.findUnique({ where: { id } });
    if (!fresh?.invoiceId) {
      throw new BadRequestException(
        'صدور فاکتور ممکن نشد؛ اطلاعات شرکت در تنظیمات سیستم را بررسی کنید',
      );
    }
    return { invoiceId: fresh.invoiceId };
  }

  // ═══════════════════════════════════════════
  // لغو / استرداد
  // ═══════════════════════════════════════════
  async cancel(id: string, reason: string, adminId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, id);
      if (o.status === 'CANCELLED' || o.status === 'REFUNDED') {
        return {
          message: 'این سفارش قبلاً لغو شده است',
          alreadyProcessed: true,
        };
      }
      if (o.status !== 'PENDING') {
        throw new ConflictException(
          'سفارش تأییدشده لغو نمی‌شود؛ از «استرداد» استفاده کنید',
        );
      }
      await tx.partnerOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: `${reason}${adminId ? '' : ' (اعلام شریک)'}`,
        },
      });
      return { message: 'سفارش لغو شد', alreadyProcessed: false };
    }, TX_OPTIONS);
  }

  async refund(id: string, reason: string, adminId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, id);
      if (o.status === 'REFUNDED') {
        return {
          message: 'این سفارش قبلاً مسترد شده است',
          alreadyProcessed: true,
        };
      }
      if (o.status !== 'CONFIRMED' && o.status !== 'SETTLED') {
        throw new ConflictException('فقط سفارش تأییدشده قابل استرداد است');
      }
      if (!o.confirmJournalId)
        throw new ConflictException('سند تأیید سفارش یافت نشد');
      const grams = toDecimal(o.amountGrams);

      if (o.productKind === 'MELTED_GOLD') {
        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${o.userId}::uuid FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({
          where: { userId: o.userId },
        });
        if (!wallet) throw new NotFoundException('کیف پول مشتری یافت نشد');
        const holds = await tx.walletHold.aggregate({
          where: {
            walletId: wallet.id,
            amountGrams: { not: null },
            expiresAt: { gt: new Date() },
          },
          _sum: { amountGrams: true },
        });
        const free = toDecimal(wallet.goldBalanceGrams).minus(
          toDecimal(holds._sum.amountGrams),
        );
        if (free.lt(grams)) {
          throw new ConflictException(
            `موجودی آزاد طلای مشتری (${free.toString()} گرم) برای استرداد کافی نیست`,
          );
        }
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { goldBalanceGrams: { decrement: grams.toString() } },
        });
        await tx.transaction.create({
          data: {
            userId: o.userId,
            walletId: wallet.id,
            type: 'REFUND',
            amountGrams: grams.toString(),
            amountRial: o.totalRial,
            status: 'COMPLETED',
            description: `partner_refund:${o.partner.code}|order:${o.orderNumber}`,
            relatedTransactionId: o.transactionId,
          },
        });
      } else {
        if (!o.hologramCodeId)
          throw new ConflictException('شمش سفارش مشخص نیست');
        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${o.hologramCodeId}::uuid FOR UPDATE`;
        const bar = await tx.hologramCode.findUnique({
          where: { id: o.hologramCodeId },
          include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
        });
        const active = bar?.ownerships[0];
        if (
          !bar ||
          bar.status !== 'ASSIGNED' ||
          !active ||
          active.ownerUserId !== o.userId ||
          (o.confirmedAt && active.createdAt < o.confirmedAt)
        ) {
          throw new ConflictException(
            'مالکیت شمش پس از فروش تغییر کرده است؛ ابتدا شمش باید به مالک اولیه برگردد',
          );
        }
        await tx.hologramOwnership.update({
          where: { id: active.id },
          data: { status: 'VOIDED', ownershipEndAt: new Date() },
        });
        await tx.hologramCode.update({
          where: { id: bar.id },
          data: {
            status: 'UNASSIGNED',
            assignedAt: null,
            assignedByAdminId: null,
          },
        });
      }

      const rev = await this.accounting.reverseJournal(tx, o.confirmJournalId, {
        description: `استرداد سفارش شریک ${o.orderNumber} (${o.partner.name}) — ${reason}`,
        createdByAdminId: adminId,
      });
      await this.partyLedger.post(tx, {
        partyType: 'PARTNER',
        partyId: o.partnerId,
        type: 'REFUND',
        creditRial: toDecimal(o.netReceivableRial),
        description: `استرداد ${o.orderNumber} — ${reason}`,
        referenceType: 'PARTNER_ORDER',
        referenceId: o.id,
        referenceNumber: o.orderNumber,
        journalEntryId: rev.id,
        createdByAdminId: adminId,
      });
      await tx.partnerOrder.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundJournalId: rev.id,
          cancelReason: reason,
        },
      });
      if (o.invoiceId) {
        await tx.invoice.updateMany({
          where: { id: o.invoiceId, status: { not: 'CANCELLED' } },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: `استرداد سفارش شریک: ${reason}`,
          },
        });
      }
      return {
        message:
          o.status === 'SETTLED'
            ? 'سفارش مسترد شد؛ چون وجه آن قبلاً تسویه شده، مبلغ به‌عنوان بدهی ما به شریک در صورتحساب او ثبت شد'
            : 'سفارش مسترد شد',
        alreadyProcessed: false,
      };
    }, TX_OPTIONS);
  }

  // ═══════════════════════════════════════════
  // تسویه‌ی دریافتی از شریک
  // ═══════════════════════════════════════════
  async settle(adminId: string | null, dto: PartnerSettlementDto) {
    const amount = new Decimal(dto.amountRial);
    if (amount.lte(0) || !amount.isInteger()) {
      throw new BadRequestException('مبلغ تسویه نامعتبر است');
    }
    const cashCode = dto.cashAccountCode ?? ACC.CASH;
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.salesPartner.findUnique({
        where: { id: dto.partnerId },
      });
      if (!partner) throw new NotFoundException('شریک فروش یافت نشد');
      const cash = await tx.account.findUnique({ where: { code: cashCode } });
      if (!cash?.isActive) {
        throw new BadRequestException('حساب نقد/بانک معتبر نیست');
      }

      // سفارش‌های تحت پوشش این واریز
      let orders: PartnerOrder[] = [];
      if (dto.orderIds?.length) {
        orders = await tx.partnerOrder.findMany({
          where: { id: { in: dto.orderIds }, partnerId: partner.id },
        });
        if (orders.length !== dto.orderIds.length) {
          throw new BadRequestException(
            'برخی سفارش‌ها یافت نشد یا متعلق به این شریک نیست',
          );
        }
        const bad = orders.find((o) => o.status !== 'CONFIRMED');
        if (bad) {
          throw new BadRequestException(
            `سفارش ${bad.orderNumber} در وضعیت «تأییدشده‌ی تسویه‌نشده» نیست`,
          );
        }
      } else if (dto.autoAllocate) {
        const open = await tx.partnerOrder.findMany({
          where: { partnerId: partner.id, status: 'CONFIRMED' },
          orderBy: [{ dueDate: 'asc' }, { confirmedAt: 'asc' }],
        });
        let left = amount;
        for (const o of open) {
          const n = toDecimal(o.netReceivableRial);
          if (n.gt(left)) break;
          orders.push(o);
          left = left.minus(n);
        }
      }

      const settlementNumber = await this.sequence.next(tx, 'PTS');
      const description = `تسویه‌ی ${partner.name} [${partner.code}] — ${settlementNumber} (${PARTNER_METHOD_FA[dto.method]}${
        dto.referenceNumber ? ` — پیگیری ${dto.referenceNumber}` : ''
      })${orders.length ? ` — ${orders.length} سفارش` : ''}`;
      const journal = await this.accounting.postJournal(tx, {
        description,
        totalRial: amount,
        totalGrams: 0,
        source: 'PARTNER',
        referenceType: 'PARTNER_SETTLEMENT',
        createdByAdminId: adminId,
        lines: [
          { accountCode: cashCode, side: 'DEBIT', amountRial: amount },
          {
            accountCode: ACC.PARTNER_RECEIVABLE,
            side: 'CREDIT',
            amountRial: amount,
          },
        ],
      });
      const st = await tx.partnerSettlement.create({
        data: {
          settlementNumber,
          partnerId: partner.id,
          amountRial: amount.toFixed(0),
          method: dto.method,
          cashAccountCode: cashCode,
          referenceNumber: dto.referenceNumber,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          note: dto.note,
          journalEntryId: journal.id,
          createdByAdminId: adminId,
        },
      });
      await tx.journalEntry.update({
        where: { id: journal.id },
        data: { referenceId: st.id },
      });
      await this.partyLedger.post(tx, {
        partyType: 'PARTNER',
        partyId: partner.id,
        type: 'SETTLEMENT',
        creditRial: amount,
        description,
        referenceType: 'PARTNER_SETTLEMENT',
        referenceId: st.id,
        referenceNumber: settlementNumber,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });
      if (orders.length) {
        await tx.partnerOrder.updateMany({
          where: { id: { in: orders.map((o) => o.id) } },
          data: {
            status: 'SETTLED',
            settledAt: new Date(),
            settlementId: st.id,
          },
        });
      }
      const covered = orders.reduce(
        (t, o) => t.plus(toDecimal(o.netReceivableRial)),
        new Decimal(0),
      );
      return {
        message: 'تسویه ثبت شد',
        id: st.id,
        settlementNumber,
        settledOrders: orders.length,
        coveredRial: covered.toString(),
        unallocatedRial: amount.minus(covered).toString(),
      };
    }, TX_OPTIONS);
  }

  async listSettlements(query: ListSettlementsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.PartnerSettlementWhereInput = query.partnerId
      ? { partnerId: query.partnerId }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.partnerSettlement.findMany({
        where,
        include: {
          partner: { select: { name: true, code: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partnerSettlement.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        settlementNumber: r.settlementNumber,
        partnerName: r.partner.name,
        partnerCode: r.partner.code,
        amountRial: r.amountRial.toString(),
        method: r.method,
        cashAccountCode: r.cashAccountCode,
        referenceNumber: r.referenceNumber,
        paidAt: r.paidAt.toISOString(),
        note: r.note,
        orderCount: r._count.orders,
        journalEntryId: r.journalEntryId,
        createdAt: r.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ═══════════════════════════════════════════
  // فهرست و جزئیات
  // ═══════════════════════════════════════════
  async list(query: ListPartnerOrdersQueryDto, partnerScope?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.PartnerOrderWhereInput = {};
    const partnerId = partnerScope ?? query.partnerId;
    if (partnerId) where.partnerId = partnerId;
    if (query.status) where.status = query.status as never;
    if (query.productKind) where.productKind = query.productKind as never;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) {
        const e = new Date(query.to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) e.setHours(23, 59, 59, 999);
        where.createdAt.lte = e;
      }
    }
    if (query.overdue === 'true') {
      where.status = 'CONFIRMED';
      where.dueDate = { lt: new Date() };
    }
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { externalRef: { contains: query.search, mode: 'insensitive' } },
        { user: { phone: { contains: query.search } } },
      ];
    }
    const [rows, total, sums] = await Promise.all([
      this.prisma.partnerOrder.findMany({
        where,
        include: { partner: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partnerOrder.count({ where }),
      this.prisma.partnerOrder.groupBy({
        by: ['status'],
        where,
        _sum: {
          amountGrams: true,
          totalRial: true,
          commissionRial: true,
          netReceivableRial: true,
        },
        _count: true,
      }),
    ]);
    return {
      data: rows.map((r) => this.dto(r, r.partner)),
      totals: sums.map((x) => ({
        status: x.status,
        count: x._count,
        grams: s(x._sum.amountGrams),
        totalRial: s(x._sum.totalRial),
        commissionRial: s(x._sum.commissionRial),
        netReceivableRial: s(x._sum.netReceivableRial),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string, partnerScope?: string) {
    const o = await this.prisma.partnerOrder.findUnique({
      where: { id },
      include: { partner: true, settlement: true },
    });
    if (!o || (partnerScope && o.partnerId !== partnerScope)) {
      throw new NotFoundException('سفارش یافت نشد');
    }
    const bar = o.hologramCodeId
      ? await this.prisma.hologramCode.findUnique({
          where: { id: o.hologramCodeId },
          select: {
            code: true,
            purityKarat: true,
            product: { select: { name: true } },
          },
        })
      : null;
    return {
      ...this.dto(o, o.partner),
      bar,
      settlement: o.settlement
        ? {
            id: o.settlement.id,
            settlementNumber: o.settlement.settlementNumber,
            paidAt: o.settlement.paidAt.toISOString(),
          }
        : null,
    };
  }

  async findByExternalRef(partnerId: string, externalRef: string) {
    const o = await this.prisma.partnerOrder.findUnique({
      where: { partnerId_externalRef: { partnerId, externalRef } },
    });
    if (!o) throw new NotFoundException('سفارش یافت نشد');
    return o;
  }

  dto(o: PartnerOrder, partner?: Pick<SalesPartner, 'name' | 'code'>) {
    const overdue =
      o.status === 'CONFIRMED' && o.dueDate != null && o.dueDate < new Date();
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      partnerId: o.partnerId,
      partnerName: partner?.name,
      partnerCode: partner?.code,
      externalRef: o.externalRef,
      userId: o.userId,
      customer: o.customerSnapshot,
      productKind: o.productKind,
      status: o.status,
      amountGrams: o.amountGrams.toString(),
      hologramCodeId: o.hologramCodeId,
      pricePerGramRial: o.pricePerGramRial.toString(),
      goldValueRial: o.goldValueRial.toString(),
      wageRial: o.wageRial.toString(),
      feeRial: o.feeRial.toString(),
      taxRial: o.taxRial.toString(),
      totalRial: o.totalRial.toString(),
      downPaymentRial: o.downPaymentRial.toString(),
      installmentCount: o.installmentCount,
      installmentPlan: o.installmentPlan,
      commissionRial: o.commissionRial.toString(),
      netReceivableRial: o.netReceivableRial.toString(),
      dueDate: o.dueDate?.toISOString() ?? null,
      overdue,
      invoiceId: o.invoiceId,
      confirmJournalId: o.confirmJournalId,
      refundJournalId: o.refundJournalId,
      settlementId: o.settlementId,
      createdVia: o.createdVia,
      note: o.note,
      cancelReason: o.cancelReason,
      confirmedAt: o.confirmedAt?.toISOString() ?? null,
      settledAt: o.settledAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      refundedAt: o.refundedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  }

  /** ثبت از پنل مدیریت (با امکان تأیید هم‌زمان) */
  async createFromAdmin(adminId: string, dto: PartnerOrderDto) {
    const res = await this.create({
      ...dto,
      createdVia: 'ADMIN',
      createdByAdminId: adminId,
    });
    if (dto.confirmNow && !res.alreadyExists) {
      const c = await this.confirm(res.order.id, adminId);
      return { message: c.message, order: c.order };
    }
    return {
      message: res.alreadyExists
        ? 'سفارشی با این شناسه‌ی مرجع قبلاً ثبت شده است'
        : 'سفارش ثبت شد و در انتظار تأیید است',
      order: res.order,
    };
  }
}
