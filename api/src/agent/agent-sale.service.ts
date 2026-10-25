// api/src/agent/agent-sale.service.ts
//
// ثبت فروش شمش توسط نماینده به مشتری نهایی. فروشنده‌ی مشتری «خود نماینده» است و صورتحساب
// را خود نماینده با شماره‌ی اقتصادی خودش صادر می‌کند؛ آرکان گلد هرگز برای مشتری نماینده فاکتور
// صادر نمی‌کند و فقط «اصالت و مالکیت» شمش را به نام مشتری در سامانه ثبت می‌کند (بند ۷-۳ قرارداد).
//   ۱) استعلام (قفل کوتاه‌مدت در Redis) — دو نوع شمش:
//      • OWNED (ملک نماینده، خریداری‌شده از شرکت با صورتحساب به نام نماینده): نماینده قیمت را
//        آزادانه تا سقف قیمت مصرف‌کننده تعیین می‌کند؛ اثر مالی برای شرکت ندارد
//      • CONSIGNMENT (امانی — فقط نمایندگان مجاز): هم‌زمان با فروش، شرکت همان شمش را به قیمت
//        نمایندگی به نماینده می‌فروشد؛ صورتحساب به نام نماینده و بدهی در حساب نماینده ثبت می‌شود
//   ۲) احراز هویت خریدار از ثبت احوال (قابل تنظیم)
//   ۳) در یک تراکنش: حساب کاربری و پرونده هویتی خریدار، ثبت مالکیت به نام خریدار، حواله‌ی خروج
//      از موجودی نماینده و (فقط امانی) سند حسابداری و بدهی نماینده
//   ۴) پیامک به خریدار: ثبت مالکیت + یادآوری دریافت فاکتور از نماینده
// خریدار با همان شماره موبایل وارد پنل کاربری می‌شود و سند مالکیت و امکان انتقال/استعلام دارد.

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
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertNoActiveIncident } from '../hologram/hologram-incident.util';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { InvoiceService } from '../invoice/invoice.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityVerificationService } from '../integrations/services/identity-verification.service';
import { IdentityVerificationResult } from '../integrations/interfaces/identity-verification.interface';
import { AgentAccountingService, agentTag } from './agent-accounting.service';
import { AgentPurchaseService } from './agent-purchase.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateAgentSaleDto, ListSalesQueryDto } from './agent.dto';
import { toPersianDigits } from '../common/utils/jalali.util';

type Tx = Prisma.TransactionClient;

const QUOTE_KEY = (id: string) => `agent:quote:${id}`;
// Prisma Accelerate تراکنش تعاملی بیش از ۱۵ ثانیه را رد می‌کند (P6005)
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

export const SALE_PAYMENT_METHOD_FA: Record<string, string> = {
  CASH: 'نقدی',
  POS: 'کارتخوان',
  CARD_TO_CARD: 'کارت به کارت',
  BANK_TRANSFER: 'واریز بانکی',
  CHEQUE: 'چک',
};

export interface AgentQuote {
  quoteId: string;
  agentId: string;
  hologramCodeId: string;
  code: string;
  /** CONSIGNMENT: امانی | OWNED: ملک نماینده (فقط ثبت اصالت) */
  stockSource: 'CONSIGNMENT' | 'OWNED';
  /** سقف قیمت فروش به مصرف‌کننده (بند ۸-۳) */
  consumerMaxPriceRial: string;
  weightGrams: string;
  purityKarat: 'K18' | 'K24';
  goldPricePerGramRial: string;
  goldValueRial: string;
  premiumRial: string;
  totalRial: string;
  commissionType: 'PERCENT' | 'PER_GRAM' | 'FIXED_PER_BAR';
  commissionValue: string;
  commissionRial: string;
  netPayableRial: string;
  createdAt: string;
  expiresAt: string;
}

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

/** گرد کردن به نزدیک‌ترین تومان (۱۰ ریال) — فاکتور و سند بدون ریال خرد */
const roundToman = (v: Decimal) =>
  v.dividedBy(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(10);

const maskPhone = (p: string) => `${p.slice(0, 4)}***${p.slice(-2)}`;

@Injectable()
export class AgentSaleService {
  private readonly logger = new Logger(AgentSaleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: DocumentSequenceService,
    private readonly systemConfig: SystemConfigService,
    private readonly pricing: PricingEngineService,
    private readonly invoices: InvoiceService,
    private readonly notifications: NotificationsService,
    private readonly identityVerification: IdentityVerificationService,
    private readonly agentAccounting: AgentAccountingService,
    private readonly purchases: AgentPurchaseService,
    private readonly accounting: AccountingService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ══════════════════════════════════════════
  // ── استعلام قیمت ──
  // ══════════════════════════════════════════

  private computeCommission(
    type: string,
    value: Decimal,
    total: Decimal,
    weight: Decimal,
  ): Decimal {
    switch (type) {
      case 'PERCENT':
        return roundToman(total.times(value).dividedBy(100));
      case 'PER_GRAM':
        return roundToman(weight.times(value));
      case 'FIXED_PER_BAR':
        return roundToman(value);
      default:
        return new Decimal(0);
    }
  }

  async quote(agentId: string, code: string): Promise<AgentQuote> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');
    if (agent.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'حساب نمایندگی شما فعال نیست و امکان ثبت فروش ندارد',
      );
    }

    const bar = await this.prisma.hologramCode.findUnique({ where: { code } });
    if (
      !bar ||
      (bar.status !== 'AT_AGENT' && bar.status !== 'AGENT_OWNED') ||
      bar.agentId !== agentId
    ) {
      throw new NotFoundException('این شمش در موجودی (امانی یا ملکی) شما نیست');
    }
    const stockSource = bar.status === 'AGENT_OWNED' ? 'OWNED' : 'CONSIGNMENT';
    await assertNoActiveIncident(this.prisma, bar.id);
    if (!bar.weightGrams || !bar.purityKarat) {
      throw new ConflictException(
        'مشخصات وزن/عیار این شمش ثبت نشده است؛ با واحد مالی تماس بگیرید',
      );
    }
    if (stockSource === 'OWNED') {
      await this.assertOwnedBarDelivered(bar.id);
    }

    const weight = d(bar.weightGrams);
    const pricePerGram = (
      await this.pricing.getGoldPricePerGram(bar.purityKarat)
    ).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const goldValue = roundToman(weight.times(pricePerGram));
    const premium = d(bar.agentPremiumRial);
    const consumerCap = await this.purchases.consumerCapFor(
      weight,
      bar.purityKarat,
    );
    // شمش ملکی: قیمت پیشنهادی = سقف مصرف‌کننده (نماینده می‌تواند کمتر بفروشد)؛ حق‌العمل و سهم
    // شرکت ندارد چون شرکت قبلاً با صورتحساب به نام نماینده فروخته است
    const total =
      stockSource === 'OWNED'
        ? Decimal.max(consumerCap, goldValue.plus(premium))
        : goldValue.plus(premium);
    const commissionValue =
      stockSource === 'OWNED' ? new Decimal(0) : d(agent.commissionValue);
    const commission =
      stockSource === 'OWNED'
        ? new Decimal(0)
        : this.computeCommission(
            agent.commissionType,
            commissionValue,
            total,
            weight,
          );
    if (commission.greaterThan(total)) {
      throw new ConflictException(
        'حق‌العمل تنظیم‌شده برای نماینده از مبلغ فروش بیشتر است؛ با واحد مالی تماس بگیرید',
      );
    }

    const ttl = Math.max(
      30,
      await this.systemConfig.getNumber('agent.sale.quote_ttl_seconds', 180),
    );
    const now = new Date();
    const quote: AgentQuote = {
      quoteId: uuidv4(),
      agentId,
      hologramCodeId: bar.id,
      code: bar.code,
      stockSource,
      consumerMaxPriceRial: Decimal.max(consumerCap, total).toFixed(0),
      weightGrams: weight.toString(),
      purityKarat: bar.purityKarat,
      goldPricePerGramRial: pricePerGram.toFixed(0),
      goldValueRial: goldValue.toFixed(0),
      premiumRial: premium.toFixed(0),
      totalRial: total.toFixed(0),
      commissionType: agent.commissionType,
      commissionValue: commissionValue.toString(),
      commissionRial: commission.toFixed(0),
      netPayableRial:
        stockSource === 'OWNED' ? '0' : total.minus(commission).toFixed(0),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    };
    await this.redis.setex(
      QUOTE_KEY(quote.quoteId),
      ttl,
      JSON.stringify(quote),
    );
    return quote;
  }

  /**
   * شمش ملکی فقط پس از تحویل فیزیکی به نماینده قابل فروش است (حواله‌ی سفارش خرید باید
   * تحویل شده باشد) — جلوگیری از فروش شمشی که هنوز در خزانه‌ی شرکت است.
   */
  private async assertOwnedBarDelivered(hologramCodeId: string) {
    const movement = await this.prisma.agentStockMovement.findFirst({
      where: { hologramCodeId, type: 'PURCHASE' },
      orderBy: { createdAt: 'desc' },
      select: { referenceId: true },
    });
    if (!movement?.referenceId) return;
    const order = await this.prisma.agentPurchaseOrder.findUnique({
      where: { id: movement.referenceId },
      select: { orderNumber: true, deliveredAt: true },
    });
    if (order && !order.deliveredAt) {
      throw new ConflictException(
        `شمش‌های سفارش ${order.orderNumber} هنوز به شما تحویل نشده است؛ پس از تحویل قابل فروش است`,
      );
    }
  }

  private async loadQuote(quoteId: string, agentId: string, code: string) {
    const raw = await this.redis.get(QUOTE_KEY(quoteId));
    const quote = raw ? (JSON.parse(raw) as AgentQuote) : null;
    if (!quote || quote.agentId !== agentId || quote.code !== code) {
      throw new BadRequestException(
        'اعتبار قیمت استعلام‌شده به پایان رسیده است؛ دوباره قیمت را استعلام کنید',
      );
    }
    return quote;
  }

  // ══════════════════════════════════════════
  // ── پیش‌بررسی خریدار ──
  // ══════════════════════════════════════════

  /** آیا خریدار با این شماره حساب دارد؟ (بدون افشای اطلاعات هویتی کامل) */
  async lookupBuyer(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { identity: true },
    });
    if (!user) return { exists: false as const };
    const identity = user.identity;
    const name = identity
      ? `${identity.firstName ?? ''} ${identity.lastName ?? ''}`.trim()
      : '';
    return {
      exists: true as const,
      status: user.status,
      identityStatus: identity?.status ?? null,
      // فقط حرف اول نام خانوادگی — برای اطمینان نماینده از درست بودن شماره
      maskedName: name
        ? `${identity?.firstName ?? ''} ${(identity?.lastName ?? '').slice(0, 1)}***`.trim()
        : null,
      nationalCodeHint: identity?.nationalCode
        ? `******${identity.nationalCode.slice(-4)}`
        : null,
    };
  }

  // ══════════════════════════════════════════
  // ── ثبت فروش ──
  // ══════════════════════════════════════════

  async createSale(
    actor: { adminUserId: string; agentId: string },
    dto: CreateAgentSaleDto,
  ) {
    const quote = await this.loadQuote(
      dto.quoteId,
      actor.agentId,
      dto.hologramCode,
    );
    const owned = quote.stockSource === 'OWNED';
    if (dto.buyerConsent === false) {
      throw new BadRequestException(
        'بدون رضایت مشتری، ثبت اطلاعات او در سامانه ممکن نیست (بند ۸-۵ قرارداد)',
      );
    }

    // ── قیمت فروش نماینده (فقط شمش ملکی): آزاد تا سقف مصرف‌کننده (بند ۸-۳) ──
    let ownedSalePrice: Decimal | null = null;
    if (owned) {
      ownedSalePrice =
        dto.salePriceRial != null
          ? new Decimal(Math.round(dto.salePriceRial))
          : d(quote.totalRial);
      const enforceCap = await this.systemConfig.getBoolean(
        'agent.sale.enforce_consumer_cap',
        true,
      );
      if (
        enforceCap &&
        ownedSalePrice.greaterThan(d(quote.consumerMaxPriceRial))
      ) {
        throw new BadRequestException(
          `قیمت فروش از سقف قیمت مصرف‌کننده (${d(quote.consumerMaxPriceRial)
            .dividedBy(10)
            .toNumber()
            .toLocaleString('fa-IR')} تومان) بیشتر است (بند ۸-۳ قرارداد)`,
        );
      }
    }

    // ── احراز هویت خریدار (خارج از تراکنش دیتابیس — فراخوانی سرویس بیرونی) ──
    const requireVerification = await this.systemConfig.getBoolean(
      'agent.sale.require_identity_verification',
      true,
    );
    let civil: IdentityVerificationResult | null = null;
    if (requireVerification) {
      try {
        civil = await this.identityVerification.verifyIdentity({
          nationalCode: dto.buyerNationalCode,
          birthDate: dto.buyerBirthDate.slice(0, 10),
          firstName: dto.buyerFirstName.trim(),
          lastName: dto.buyerLastName.trim(),
        });
      } catch (err) {
        this.logger.error('[AgentSale] خطا در ارتباط با سرویس احراز هویت', err);
        throw new ConflictException(
          'سرویس استعلام هویت موقتاً در دسترس نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید',
        );
      }
      if (!civil.matched) {
        throw new BadRequestException(
          `اطلاعات هویتی خریدار با سوابق ثبت احوال مطابقت ندارد${
            civil.reason ? ` (${civil.reason})` : ''
          }`,
        );
      }
    }

    const firstName = (civil?.firstName ?? dto.buyerFirstName).trim();
    const lastName = (civil?.lastName ?? dto.buyerLastName).trim();

    const result = await this.prisma.$transaction(async (tx) => {
      // ── قفل شمش و نماینده ──
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${quote.hologramCodeId}::uuid FOR UPDATE`;
      const bar = await tx.hologramCode.findUnique({
        where: { id: quote.hologramCodeId },
      });
      if (
        !bar ||
        bar.status !== (owned ? 'AGENT_OWNED' : 'AT_AGENT') ||
        bar.agentId !== actor.agentId
      ) {
        throw new ConflictException(
          'این شمش دیگر در موجودی شما نیست (احتمالاً قبلاً فروخته، عودت یا به شرکت فروخته شده است)',
        );
      }
      await assertNoActiveIncident(tx, bar.id);

      await tx.$executeRaw`SELECT 1 FROM "agents" WHERE "id" = ${actor.agentId}::uuid FOR UPDATE`;
      const agent = await tx.agent.findUniqueOrThrow({
        where: { id: actor.agentId },
      });
      if (agent.status !== 'ACTIVE') {
        throw new ForbiddenException(
          'حساب نمایندگی شما فعال نیست و امکان ثبت فروش ندارد',
        );
      }

      const netPayable = d(quote.netPayableRial);
      if (
        !owned &&
        agent.creditLimitRial &&
        d(agent.balanceRial)
          .plus(netPayable)
          .greaterThan(d(agent.creditLimitRial))
      ) {
        throw new ConflictException(
          'با ثبت این فروش سقف اعتبار شما تکمیل می‌شود. ابتدا بدهی قبلی را تسویه کنید',
        );
      }

      // ── حساب کاربری و پرونده هویتی خریدار ──
      const buyer = await this.provisionBuyer(tx, {
        phone: dto.buyerPhone,
        firstName,
        lastName,
        nationalCode: dto.buyerNationalCode,
        birthDate: dto.buyerBirthDate,
        civil,
      });

      // ── ثبت مالکیت به نام خریدار ──
      await tx.ownershipTransferRequest.updateMany({
        where: { hologramCodeId: bar.id, status: 'PENDING' },
        data: { status: 'CANCELLED', rejectionReason: 'فروش توسط نماینده' },
      });
      await tx.hologramOwnership.updateMany({
        where: { hologramCodeId: bar.id, status: 'ACTIVE' },
        data: { status: 'TRANSFERRED', ownershipEndAt: new Date() },
      });
      const ownership = await tx.hologramOwnership.create({
        data: {
          hologramCodeId: bar.id,
          ownerUserId: buyer.userId,
          fullName: buyer.fullName,
          nationalCode: dto.buyerNationalCode,
          status: 'ACTIVE',
          transferType: 'INITIAL_PURCHASE',
        },
      });
      await tx.hologramCode.update({
        where: { id: bar.id },
        data: { status: 'ASSIGNED', agentId: null },
      });

      // ── سند فروش ──
      const saleNumber = await this.sequence.next(tx, 'AGS');
      const weight = d(quote.weightGrams);
      const goldValue = d(quote.goldValueRial);
      const premium = d(quote.premiumRial);
      const commission = d(quote.commissionRial);
      const saleTotal = ownedSalePrice ?? d(quote.totalRial);

      const sale = await tx.agentSale.create({
        data: {
          saleNumber,
          agentId: agent.id,
          hologramCodeId: bar.id,
          buyerUserId: buyer.userId,
          buyerFullName: buyer.fullName,
          buyerNationalCode: dto.buyerNationalCode,
          buyerPhone: dto.buyerPhone,
          buyerAccountCreated: buyer.created,
          identityVerified: !!civil?.matched,
          identityVerificationRef:
            civil?.providerRequestId ??
            civil?.civilRegistryTrackingCode ??
            null,
          weightGrams: weight.toString(),
          purityKarat: quote.purityKarat,
          goldPricePerGramRial: quote.goldPricePerGramRial,
          goldValueRial: goldValue.toFixed(0),
          premiumRial: premium.toFixed(0),
          totalRial: saleTotal.toFixed(0),
          commissionType: quote.commissionType,
          commissionValue: quote.commissionValue,
          commissionRial: commission.toFixed(0),
          netPayableRial: netPayable.toFixed(0),
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference,
          note: dto.note,
          stockSource: quote.stockSource,
          billedToAgent: !owned,
          agentInvoiceNumber: dto.agentInvoiceNumber?.trim() || null,
          ownershipId: ownership.id,
          soldByAdminId: actor.adminUserId,
        },
      });

      // ── شمش ملکی: فقط ثبت اصالت/مالکیت؛ بدون سند و بدهی (فروش شرکت قبلاً با صورتحساب
      // سفارش خرید به نام نماینده ثبت شده است) ──
      let journalId: string | null = null;
      if (!owned) {
        // ── امانی: فروش هم‌زمان شرکت به نماینده + بدهی نماینده ──
        const journal =
          await this.agentAccounting.journalConsignmentSaleToAgent(tx, {
            agentTag: agentTag(agent.code),
            saleNumber,
            hologramCode: bar.code,
            weightGrams: weight,
            premiumRial: premium,
            netPayableRial: netPayable,
          });
        journalId = journal.id;
        await this.agentAccounting.postLedger(tx, {
          agentId: agent.id,
          type: 'SALE',
          debitRial: netPayable,
          description: `خرید شمش امانی ${toPersianDigits(weight.toString())} گرمی (کد ${bar.code}) هم‌زمان با فروش به ${buyer.fullName} — قیمت نمایندگی`,
          referenceType: 'AGENT_SALE',
          referenceId: sale.id,
          referenceNumber: saleNumber,
          journalEntryId: journal.id,
          createdByAdminId: actor.adminUserId,
        });
      }
      await tx.agentStockMovement.create({
        data: {
          voucherNumber: saleNumber,
          agentId: agent.id,
          hologramCodeId: bar.id,
          type: 'SALE',
          weightGrams: weight.toString(),
          referenceId: sale.id,
          journalEntryId: journalId,
          performedByAdminId: actor.adminUserId,
          note: `ثبت مالکیت به نام ${buyer.fullName}${owned ? ' (شمش ملکی نماینده)' : ' (شمش امانی)'}`,
        },
      });

      return tx.agentSale.update({
        where: { id: sale.id },
        data: { journalEntryId: journalId },
      });
    }, TX_OPTIONS);

    await this.redis.del(QUOTE_KEY(dto.quoteId)).catch(() => undefined);

    // امانی: صورتحساب به نام «نماینده» در تراکنش جدا (خطای صدور ثبت مالکیت را برنمی‌گرداند و
    // از صفحه‌ی جزئیات قابل تکرار است). شرکت برای مشتری نهایی هیچ فاکتوری صادر نمی‌کند.
    const invoiceId = owned ? null : await this.issueInvoice(result.id);

    const notify = await this.systemConfig.getBoolean(
      'agent.sale.notify_buyer_sms',
      true,
    );
    if (notify) {
      void this.notifications.notifyUserSms(
        result.buyerUserId,
        `آرکان گلد: اصالت و مالکیت شمش ${toPersianDigits(
          quote.weightGrams,
        )} گرمی با کد هولوگرام ${toPersianDigits(
          quote.code,
        )} به نام ${result.buyerFullName} ثبت شد. سند مالکیت را با ورود به پنل کاربری با شماره ${toPersianDigits(
          dto.buyerPhone,
        )} ببینید. فاکتور خرید را از نماینده‌ی فروشنده دریافت کنید.`,
      );
    }

    this.logger.log(
      `[AgentSale] ${result.saleNumber}: شمش ${quote.code} توسط نماینده ${actor.agentId} به خریدار ${maskPhone(dto.buyerPhone)} فروخته شد`,
    );
    return { ...(await this.getSale(result.id)), invoiceId };
  }

  /** صدور (یا صدور مجدد در صورت شکست قبلی) فاکتور فروش */
  async issueInvoice(saleId: string): Promise<string | null> {
    try {
      const invoice = await this.prisma.$transaction((tx) =>
        this.invoices.issueForAgentSale(tx, saleId),
      );
      await this.prisma.agentSale.update({
        where: { id: saleId },
        data: { invoiceId: invoice.id },
      });
      return invoice.id;
    } catch (err) {
      this.logger.error(
        `[AgentSale] صدور فاکتور فروش ${saleId} ناموفق بود: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async retryInvoice(saleId: string, agentId?: string) {
    const sale = await this.prisma.agentSale.findUnique({
      where: { id: saleId },
    });
    if (!sale || (agentId && sale.agentId !== agentId)) {
      throw new NotFoundException('فروش یافت نشد');
    }
    if (sale.status !== 'COMPLETED') {
      throw new ConflictException('برای فروش ابطال‌شده فاکتور صادر نمی‌شود');
    }
    if (sale.invoiceId) return { invoiceId: sale.invoiceId };
    if (!sale.billedToAgent) {
      throw new ConflictException(
        'شرکت برای مشتری نهایی نماینده فاکتور صادر نمی‌کند؛ صورتحساب فروش را نماینده صادر می‌کند',
      );
    }
    const invoiceId = await this.issueInvoice(saleId);
    if (!invoiceId) {
      throw new ConflictException(
        'صدور فاکتور ممکن نشد؛ اطلاعات شرکت در تنظیمات سیستم را بررسی کنید',
      );
    }
    return { invoiceId };
  }

  /**
   * یافتن/ساخت حساب خریدار با شماره موبایل و تکمیل پرونده هویتی او.
   * حساب جدید بدون رمز ساخته می‌شود؛ ورود با رمز یکبار مصرف روی همان شماره است.
   */
  private async provisionBuyer(
    tx: Tx,
    input: {
      phone: string;
      firstName: string;
      lastName: string;
      nationalCode: string;
      birthDate: string;
      civil: IdentityVerificationResult | null;
    },
  ): Promise<{ userId: string; fullName: string; created: boolean }> {
    const verified = !!input.civil?.matched;
    const fullName = `${input.firstName} ${input.lastName}`.trim();

    const identityOwner = await tx.userIdentity.findUnique({
      where: { nationalCode: input.nationalCode },
      include: { user: { select: { id: true, phone: true } } },
    });

    let user = await tx.user.findUnique({
      where: { phone: input.phone },
      include: { identity: true },
    });

    if (identityOwner && identityOwner.user.phone !== input.phone) {
      throw new ConflictException(
        `این کد ملی قبلاً برای حساب کاربری دیگری (شماره ${maskPhone(
          identityOwner.user.phone,
        )}) ثبت شده است؛ شماره‌ی همان حساب را وارد کنید`,
      );
    }

    let created = false;
    if (!user) {
      user = await this.createUser(tx, input.phone);
      created = true;
    } else if (user.status === 'BANNED') {
      throw new ConflictException('حساب کاربری این خریدار مسدود است');
    }

    const identity = user.identity;
    if (
      identity?.nationalCode &&
      identity.nationalCode !== input.nationalCode
    ) {
      throw new ConflictException(
        'این شماره موبایل به نام شخص دیگری احراز هویت شده است؛ کد ملی با حساب مطابقت ندارد',
      );
    }

    if (identity?.status === 'VERIFIED') {
      // پرونده‌ی تأییدشده‌ی قبلی دست نمی‌خورد؛ نام رسمی همان پرونده مبنای سند است
      const officialName =
        `${identity.firstName ?? ''} ${identity.lastName ?? ''}`.trim();
      return { userId: user.id, fullName: officialName || fullName, created };
    }

    const civil = input.civil;
    const data = {
      firstName: input.firstName,
      lastName: input.lastName,
      nationalCode: input.nationalCode,
      birthDate: new Date(input.birthDate),
      status: verified ? ('VERIFIED' as const) : ('PENDING' as const),
      verifiedAt: verified ? new Date() : null,
      fatherName: civil?.fatherName ?? null,
      gender: civil?.gender ?? null,
      deathStatus: civil?.deathStatus ?? null,
      identityNo: civil?.identityNo ?? null,
      identitySeri: civil?.identitySeri ?? null,
      identitySerial: civil?.identitySerial ?? null,
      officeName: civil?.officeName ?? null,
      officeCode: civil?.officeCode ?? null,
      civilRegistryTrackingCode: civil?.civilRegistryTrackingCode ?? null,
      providerRequestId: civil?.providerRequestId ?? null,
      verifiedByProvider: civil?.verifiedByProvider ?? null,
    };
    await tx.userIdentity.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    return { userId: user.id, fullName, created };
  }

  /** همان ساختار ثبت‌نام عادی: کاربر + کیف پول + سقف‌ها + کارمزد و مالیات پیش‌فرض */
  private async createUser(tx: Tx, phone: string) {
    const referralCode = await this.uniqueReferralCode(tx);
    const cardNumber = await this.uniqueCardNumber(tx);
    const user = await tx.user.create({
      data: {
        phone,
        type: 'REAL',
        status: 'ACTIVE',
        referralCode,
      },
      include: { identity: true },
    });
    await tx.wallet.create({ data: { userId: user.id, cardNumber } });
    await tx.userLimit.create({ data: { userId: user.id } });
    await tx.feeConfig.createMany({
      data: [
        { userId: user.id, type: 'BUY_GOLD', feePercent: 1.0 },
        { userId: user.id, type: 'SELL_GOLD', feePercent: 1.0 },
      ],
    });
    await tx.taxConfig.create({
      data: { userId: user.id, type: 'BUY', taxPercent: 0.0 },
    });
    return user;
  }

  private async uniqueReferralCode(tx: Tx): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
      const exists = await tx.user.findUnique({
        where: { referralCode: code },
      });
      if (!exists) return code;
    }
    throw new ConflictException('تولید کد معرف یکتا ناموفق بود');
  }

  private async uniqueCardNumber(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let num = '1000';
      for (let i = 0; i < 12; i++) num += crypto.randomInt(10);
      const exists = await tx.wallet.findUnique({ where: { cardNumber: num } });
      if (!exists) return num;
    }
    throw new ConflictException('تولید شماره کارت یکتا ناموفق بود');
  }

  // ══════════════════════════════════════════
  // ── ابطال فروش (فقط مدیریت) ──
  // ══════════════════════════════════════════

  async voidSale(adminId: string, saleId: string, reason: string) {
    const sale = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_sales" WHERE "id" = ${saleId}::uuid FOR UPDATE`;
      const s = await tx.agentSale.findUnique({
        where: { id: saleId },
        include: { agent: true, hologramCode: true },
      });
      if (!s) throw new NotFoundException('فروش یافت نشد');
      if (s.status !== 'COMPLETED') {
        throw new ConflictException('این فروش قبلاً ابطال شده است');
      }

      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${s.hologramCodeId}::uuid FOR UPDATE`;
      const active = await tx.hologramOwnership.findFirst({
        where: { hologramCodeId: s.hologramCodeId, status: 'ACTIVE' },
      });
      const code = await tx.hologramCode.findUniqueOrThrow({
        where: { id: s.hologramCodeId },
      });
      if (
        code.status !== 'ASSIGNED' ||
        !active ||
        active.id !== s.ownershipId ||
        active.ownerUserId !== s.buyerUserId
      ) {
        throw new ConflictException(
          'مالکیت این شمش پس از فروش تغییر کرده یا در حال انتقال است؛ ابطال فروش ممکن نیست',
        );
      }

      const owned = s.stockSource === 'OWNED';
      await tx.hologramOwnership.update({
        where: { id: active.id },
        data: { status: 'VOIDED', ownershipEndAt: new Date() },
      });
      await tx.hologramCode.update({
        where: { id: s.hologramCodeId },
        data: {
          status: owned ? 'AGENT_OWNED' : 'AT_AGENT',
          agentId: s.agentId,
        },
      });

      // شمش ملکی: اثر مالی برای شرکت نداشت — فقط مالکیت برمی‌گردد
      let journalId: string | null = null;
      if (!owned) {
        const journal = s.billedToAgent
          ? s.journalEntryId
            ? await this.accounting.reverseJournal(tx, s.journalEntryId, {
                description: `ابطال فروش شمش امانی به نماینده ${agentTag(
                  s.agent.code,
                )} — ${s.saleNumber}: ${reason.trim()}`,
                createdByAdminId: adminId,
              })
            : null
          : await this.agentAccounting.journalSale(
              tx,
              {
                agentTag: agentTag(s.agent.code),
                saleNumber: s.saleNumber,
                hologramCode: s.hologramCode.code,
                weightGrams: d(s.weightGrams),
                goldValueRial: d(s.goldValueRial),
                premiumRial: d(s.premiumRial),
                commissionRial: d(s.commissionRial),
                netPayableRial: d(s.netPayableRial),
                originalJournalId: s.journalEntryId,
              },
              true,
            );
        journalId = journal?.id ?? null;
        await this.agentAccounting.postLedger(tx, {
          agentId: s.agentId,
          type: 'SALE_VOID',
          creditRial: d(s.netPayableRial),
          description: `ابطال فروش ${s.saleNumber} (کد ${s.hologramCode.code}): ${reason.trim()}`,
          referenceType: 'AGENT_SALE',
          referenceId: s.id,
          referenceNumber: s.saleNumber,
          journalEntryId: journalId,
          createdByAdminId: adminId,
        });
      }
      await tx.agentStockMovement.create({
        data: {
          voucherNumber: s.saleNumber,
          agentId: s.agentId,
          hologramCodeId: s.hologramCodeId,
          type: 'SALE_VOID',
          weightGrams: s.weightGrams,
          referenceId: s.id,
          journalEntryId: journalId,
          performedByAdminId: adminId,
          note: `بازگشت به موجودی ${owned ? 'ملکی' : 'امانی'} — ابطال فروش: ${reason.trim()}`,
        },
      });

      return tx.agentSale.update({
        where: { id: s.id },
        data: {
          status: 'VOIDED',
          voidReason: reason.trim(),
          voidedAt: new Date(),
          voidedByAdminId: adminId,
          voidJournalEntryId: journalId,
        },
      });
    }, TX_OPTIONS);

    if (sale.invoiceId) {
      await this.invoices
        .cancel(
          sale.invoiceId,
          `ابطال فروش نماینده ${sale.saleNumber}: ${reason.trim()}`,
        )
        .catch((err: unknown) =>
          this.logger.error(
            `[AgentSale] ابطال فاکتور فروش ${sale.saleNumber} ناموفق بود`,
            err instanceof Error ? err.message : err,
          ),
        );
    }
    void this.notifications.notifyUserSms(
      sale.buyerUserId,
      `آرکان گلد: فروش شمش شماره ${toPersianDigits(
        sale.saleNumber,
      )} ابطال شد و مالکیت آن از حساب شما حذف گردید. در صورت ابهام با پشتیبانی تماس بگیرید.`,
    );

    return {
      message:
        sale.stockSource === 'OWNED'
          ? 'ثبت مالکیت ابطال شد و شمش به موجودی ملکی نماینده بازگشت'
          : 'فروش ابطال شد و شمش به موجودی امانی نماینده بازگشت',
      sale,
    };
  }

  // ══════════════════════════════════════════
  // ── فهرست و جزئیات ──
  // ══════════════════════════════════════════

  async listSales(agentScope: string | null, query: ListSalesQueryDto) {
    const agentId = agentScope ?? query.agentId;
    const range =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to
              ? {
                  lte: /^\d{4}-\d{2}-\d{2}$/.test(query.to)
                    ? new Date(`${query.to}T23:59:59.999`)
                    : new Date(query.to),
                }
              : {}),
          }
        : undefined;
    const where: Prisma.AgentSaleWhereInput = {
      ...(agentId ? { agentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(range ? { createdAt: range } : {}),
      ...(query.search
        ? {
            OR: [
              { saleNumber: { contains: query.search, mode: 'insensitive' } },
              {
                buyerFullName: { contains: query.search, mode: 'insensitive' },
              },
              { buyerPhone: { contains: query.search } },
              { buyerNationalCode: { contains: query.search } },
              { hologramCode: { code: { contains: query.search } } },
            ],
          }
        : {}),
    };
    const [items, total, sums] = await Promise.all([
      this.prisma.agentSale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: { select: { id: true, code: true, name: true } },
          hologramCode: { select: { code: true } },
          soldByAdmin: { select: { fullName: true } },
        },
      }),
      this.prisma.agentSale.count({ where }),
      this.prisma.agentSale.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: {
          totalRial: true,
          commissionRial: true,
          netPayableRial: true,
          weightGrams: true,
        },
      }),
    ]);
    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      totals: {
        completedCount: sums._count._all,
        totalRial: d(sums._sum.totalRial).toFixed(0),
        commissionRial: d(sums._sum.commissionRial).toFixed(0),
        netPayableRial: d(sums._sum.netPayableRial).toFixed(0),
        grams: d(sums._sum.weightGrams).toString(),
      },
    };
  }

  async getSale(saleId: string, agentScope?: string) {
    const sale = await this.prisma.agentSale.findUnique({
      where: { id: saleId },
      include: {
        agent: { select: { id: true, code: true, name: true, phone: true } },
        hologramCode: {
          select: {
            code: true,
            status: true,
            factorySerialNumber: true,
            mintedAt: true,
            product: { select: { name: true } },
            batch: { select: { batchNumber: true } },
          },
        },
        soldByAdmin: { select: { fullName: true, username: true } },
        voidedByAdmin: { select: { fullName: true } },
      },
    });
    if (!sale || (agentScope && sale.agentId !== agentScope)) {
      throw new NotFoundException('فروش یافت نشد');
    }
    return {
      ...sale,
      paymentMethodLabel:
        SALE_PAYMENT_METHOD_FA[sale.paymentMethod] ?? sale.paymentMethod,
    };
  }

  /** سند فاکتور یک فروش برای نماینده‌ی فروشنده (چاپ و تحویل به مشتری) */
  async getInvoiceForAgent(invoiceId: string, agentId: string) {
    const sale = await this.prisma.agentSale.findFirst({
      where: { invoiceId, agentId },
      select: { id: true },
    });
    if (!sale) throw new NotFoundException('سند یافت نشد');
    return this.invoices.getDocument(invoiceId, null, true);
  }
}
