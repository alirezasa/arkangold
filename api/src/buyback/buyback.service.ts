// api/src/buyback/buyback.service.ts
//
// بازخرید شمش آرکان گلد — مالک، شمش ثبت‌شده به نام خودش را به آرکان گلد می‌فروشد:
//
//   کاربر: ثبت درخواست ─► SUBMITTED (شمش قفل می‌شود: BUYBACK_PENDING؛ انتقال/ابطال مسدود)
//   ادمین: پذیرش و نوبت تحویل ─► AWAITING_DELIVERY        │ رد ─► REJECTED (آزادسازی شمش)
//   ادمین: دریافت شمش در دفتر ─► RECEIVED                  │ کاربر: لغو پیش از تحویل ─► CANCELLED
//   ادمین: اصالت‌سنجی (چک‌لیست، وزن، عیار)
//          موفق ─► INSPECTION_PASSED   │   ناموفق ─► RETURN_PENDING
//   ادمین: اعلام قیمت نهایی (قیمت روز × وزن − کسورات) ─► OFFERED (با مهلت پذیرش)
//   کاربر: پذیرش ─► ACCEPTED   │   رد قیمت ─► RETURN_PENDING   │   انقضای مهلت ─► INSPECTION_PASSED
//   مالی:  تأیید نهایی (حساب مقصد دوباره کنترل می‌شود) ─► APPROVED
//   مالی:  ثبت واریز به حساب پیش‌فرض کاربر ─► PAID
//          مالکیت کاربر بسته، شمش به خزانه (کددار، قابل فروش مجدد) و سند حسابداری:
//            بدهکار 1025 موجودی شمش (مبلغ پرداختی + وزن)   بستانکار 1010 بانک (مبلغ) / 1095 واسط شمش (وزن)
//   ادمین: عودت شمش به مالک ─► RETURNED (آزادسازی شمش)
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
import { SystemConfigService } from '../system-config/system-config.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { AccountingService, toDecimal } from '../accounting/accounting.service';
import { ACC } from '../accounting/accounts.seed';
import { SmsTemplateService } from '../notifications/sms-template.service';
import {
  INCIDENT_TYPE_FA,
  findActiveIncident,
} from '../hologram/hologram-incident.util';
import { requiresDualControl } from '../wallet/wallet-admin.service';
import { formatJalaliDateTime } from '../common/utils/jalali.util';
import type {
  AcceptBuybackDto,
  BuybackStatusKey,
  CreateBuybackDto,
  InspectBuybackDto,
  ListBuybackQueryDto,
  OfferBuybackDto,
  PayBuybackDto,
} from './buyback.dto';

type Tx = Prisma.TransactionClient;
type BuybackRow = Prisma.BullionBuybackRequestGetPayload<object>;

export const BUYBACK_STATUS_FA: Record<BuybackStatusKey, string> = {
  SUBMITTED: 'ثبت‌شده — در انتظار بررسی',
  AWAITING_DELIVERY: 'در انتظار تحویل شمش',
  RECEIVED: 'شمش دریافت شد — در انتظار اصالت‌سنجی',
  INSPECTION_PASSED: 'اصالت تأیید شد — در انتظار اعلام قیمت',
  OFFERED: 'قیمت نهایی اعلام شد — منتظر تأیید شما',
  ACCEPTED: 'قیمت پذیرفته شد — در انتظار تأیید نهایی',
  APPROVED: 'تأیید نهایی — در صف واریز',
  PAID: 'واریز شد',
  RETURN_PENDING: 'در انتظار عودت شمش',
  RETURNED: 'شمش عودت داده شد',
  REJECTED: 'ردشده',
  CANCELLED: 'لغوشده',
};

const BUYBACK_STATUSES_LIST = Object.keys(
  BUYBACK_STATUS_FA,
) as BuybackStatusKey[];

/** وضعیت‌های باز (شمش هنوز در فرآیند بازخرید و قفل است) */
const OPEN_STATUSES: BuybackStatusKey[] = [
  'SUBMITTED',
  'AWAITING_DELIVERY',
  'RECEIVED',
  'INSPECTION_PASSED',
  'OFFERED',
  'ACCEPTED',
  'APPROVED',
  'RETURN_PENDING',
];

/** وضعیت‌هایی که منتظر اقدام کارشناس/مالی هستند (صف کار پنل ادمین) */
const ACTION_STATUSES: BuybackStatusKey[] = [
  'SUBMITTED',
  'AWAITING_DELIVERY',
  'RECEIVED',
  'INSPECTION_PASSED',
  'ACCEPTED',
  'APPROVED',
  'RETURN_PENDING',
];

const DELIVERY_FA = {
  IN_PERSON: 'تحویل حضوری در دفتر',
  INSURED_POST: 'ارسال با پست بیمه‌شده / پیک امن',
} as const;

type Actor =
  | { type: 'USER'; userId: string }
  | { type: 'ADMIN'; adminId: string }
  | { type: 'SYSTEM' };

const toman = (rial: Decimal.Value) =>
  new Decimal(rial).div(10).floor().toNumber().toLocaleString('fa-IR');

const maskCard = (card?: string | null) =>
  card && card.length >= 8 ? `${card.slice(0, 6)}******${card.slice(-4)}` : '';

const maskSheba = (sheba?: string | null) =>
  sheba && sheba.length > 10
    ? `${sheba.slice(0, 6)}••••${sheba.slice(-4)}`
    : '';

interface BuybackConfig {
  enabled: boolean;
  deductionPercent: Decimal;
  feeRial: Decimal;
  offerValidityHours: number;
  minHoldingDays: number;
  maxOpenRequests: number;
  dropoffAddress: string;
  postInstructions: string;
}

export interface PriceBreakdown {
  pricePerGramRial: string;
  weightGrams: string;
  grossRial: string;
  deductionPercent: string;
  deductionRial: string;
  feeRial: string;
  netRial: string;
  /** مبنای قیمت: عیار اندازه‌گیری‌شده (fineness) یا عیار ثبت‌شده‌ی شمش (karat) یا قیمت دستی */
  priceBasis: 'FINENESS' | 'KARAT' | 'MANUAL';
}

@Injectable()
export class BuybackService {
  private readonly logger = new Logger(BuybackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly sequence: DocumentSequenceService,
    private readonly pricing: PricingEngineService,
    private readonly accounting: AccountingService,
    private readonly smsTemplates: SmsTemplateService,
  ) {}

  // ═══════════════════════════ تنظیمات و قیمت ═══════════════════════════

  private async config(): Promise<BuybackConfig> {
    const [
      enabled,
      deductionPercent,
      feeRial,
      offerValidityHours,
      minHoldingDays,
      maxOpenRequests,
      dropoffAddress,
      postInstructions,
    ] = await Promise.all([
      this.systemConfig.getBoolean('buyback.enabled', true),
      this.systemConfig.getDecimal('buyback.deduction_percent', '2'),
      this.systemConfig.getDecimal('buyback.fee_rial', '0'),
      this.systemConfig.getNumber('buyback.offer_validity_hours', 24),
      this.systemConfig.getNumber('buyback.min_holding_days', 0),
      this.systemConfig.getNumber('buyback.max_open_requests', 5),
      this.systemConfig.get('buyback.dropoff_address', ''),
      this.systemConfig.get('buyback.post_instructions', ''),
    ]);
    const clampPct = Decimal.min(
      Decimal.max(toDecimal(deductionPercent), 0),
      50,
    );
    return {
      enabled,
      deductionPercent: clampPct,
      feeRial: Decimal.max(toDecimal(feeRial), 0),
      offerValidityHours: Math.min(Math.max(offerValidityHours || 24, 1), 720),
      minHoldingDays: Math.max(0, minHoldingDays || 0),
      maxOpenRequests: Math.max(1, maxOpenRequests || 5),
      dropoffAddress: dropoffAddress.trim(),
      postInstructions: postInstructions.trim(),
    };
  }

  /**
   * محاسبه‌ی قیمت بازخرید:
   *   قیمت هر گرم = قیمت ۱۸ عیار بازار × (عیار اندازه‌گیری‌شده ÷ ۷۵۰)  یا  قیمت عیار ثبت‌شده‌ی شمش
   *   ارزش = قیمت هر گرم × وزن؛ مبلغ نهایی = ارزش − درصد کسر − هزینه‌ی کارشناسی
   *   (مبلغ نهایی به پایین و به مضرب ۱۰۰۰ ریال گرد می‌شود)
   */
  async computePrice(input: {
    weightGrams: Decimal.Value;
    purityKarat: string | null;
    fineness?: Decimal.Value | null;
    pricePerGramRial?: Decimal.Value | null;
    deductionPercent?: Decimal.Value | null;
    feeRial?: Decimal.Value | null;
  }): Promise<PriceBreakdown> {
    const cfg = await this.config();
    let basis: PriceBreakdown['priceBasis'];
    let perGram: Decimal;
    if (input.pricePerGramRial != null) {
      basis = 'MANUAL';
      perGram = new Decimal(input.pricePerGramRial);
    } else if (input.fineness != null) {
      basis = 'FINENESS';
      const price18 = await this.pricing.getGoldPricePerGram('K18');
      perGram = new Decimal(price18.toString()).times(input.fineness).div(750);
    } else {
      basis = 'KARAT';
      perGram = new Decimal(
        (
          await this.pricing.getGoldPricePerGram(input.purityKarat ?? 'K24')
        ).toString(),
      );
    }
    perGram = perGram.floor();
    if (perGram.lte(0))
      throw new BadRequestException('قیمت هر گرم نامعتبر است');

    const weight = new Decimal(input.weightGrams);
    const pct =
      input.deductionPercent != null
        ? new Decimal(input.deductionPercent)
        : cfg.deductionPercent;
    const fee =
      input.feeRial != null ? new Decimal(input.feeRial) : cfg.feeRial;
    const gross = perGram.times(weight).floor();
    const deduction = gross.times(pct).div(100).floor();
    const net = gross.minus(deduction).minus(fee).div(1000).floor().times(1000);

    return {
      pricePerGramRial: perGram.toFixed(0),
      weightGrams: weight.toString(),
      grossRial: gross.toFixed(0),
      deductionPercent: pct.toString(),
      deductionRial: deduction.toFixed(0),
      feeRial: fee.toFixed(0),
      netRial: Decimal.max(net, 0).toFixed(0),
      priceBasis: basis,
    };
  }

  // ═══════════════════════════ کمکی‌ها ═══════════════════════════

  private async event(
    tx: Tx,
    requestId: string,
    from: BuybackStatusKey | null,
    to: BuybackStatusKey,
    actor: Actor,
    note?: string | null,
  ) {
    await tx.bullionBuybackEvent.create({
      data: {
        requestId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorUserId: actor.type === 'USER' ? actor.userId : null,
        actorAdminId: actor.type === 'ADMIN' ? actor.adminId : null,
        note: note?.trim() || null,
      },
    });
  }

  /** قفل ردیف + کنترل وضعیت مجاز برای هر گذار */
  private async lockRequest(
    tx: Tx,
    id: string,
    allowed: BuybackStatusKey[],
    userId?: string,
  ): Promise<BuybackRow> {
    await tx.$executeRaw`SELECT 1 FROM "bullion_buyback_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const r = await tx.bullionBuybackRequest.findUnique({ where: { id } });
    if (!r || (userId && r.userId !== userId)) {
      throw new NotFoundException('درخواست بازخرید یافت نشد');
    }
    if (!allowed.includes(r.status)) {
      throw new ConflictException(
        `این اقدام در وضعیت «${BUYBACK_STATUS_FA[r.status]}» مجاز نیست`,
      );
    }
    return r;
  }

  /** آزادسازی قفل شمش (بازگشت به مالکیت عادی کاربر) */
  private async releaseCode(tx: Tx, hologramCodeId: string) {
    await tx.hologramCode.updateMany({
      where: { id: hologramCodeId, status: 'BUYBACK_PENDING' },
      data: { status: 'ASSIGNED' },
    });
  }

  private async defaultBankAccount(db: Tx | PrismaService, userId: string) {
    return db.bankAccount.findFirst({
      where: { userId, isDefault: true, isVerified: true, status: 'VERIFIED' },
    });
  }

  private destinationSnapshot(acc: {
    id: string;
    bankName: string;
    cardNumber: string;
    accountNumber: string;
    sheba: string | null;
    ownerName: string | null;
  }) {
    return {
      bankAccountId: acc.id,
      bankName: acc.bankName,
      cardNumber: acc.cardNumber,
      accountNumber: acc.accountNumber,
      sheba: acc.sheba,
      ownerName: acc.ownerName,
    };
  }

  /** اعلان درون‌برنامه‌ای + پیامک قالب‌دار؛ شکست اعلان جریان اصلی را نمی‌شکند */
  private async notify(
    r: { id: string; userId: string; requestNumber: string },
    inApp: string,
    sms?: { key: string; vars?: Record<string, string> },
  ) {
    try {
      await this.prisma.notification.create({
        data: {
          userId: r.userId,
          type: 'IN_APP',
          content: inApp,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(
        `اعلان بازخرید ${r.id} ثبت نشد: ${(err as Error).message}`,
      );
    }
    if (!sms) return;
    try {
      await this.smsTemplates.sendToUser(
        sms.key,
        r.userId,
        { requestNumber: r.requestNumber, ...(sms.vars ?? {}) },
        { referenceType: 'BUYBACK', referenceId: r.id },
      );
    } catch (err) {
      this.logger.warn(
        `پیامک ${sms.key} بازخرید ${r.id} ارسال نشد: ${(err as Error).message}`,
      );
    }
  }

  // ═══════════════════════════ پنل کاربر ═══════════════════════════

  /** شمش‌های کاربر با وضعیت قابلیت بازخرید + برآورد قیمت + درخواست‌های قبلی */
  async userOverview(userId: string) {
    const cfg = await this.config();
    const [identity, bank, ownerships, requests] = await Promise.all([
      this.prisma.userIdentity.findUnique({
        where: { userId },
        select: { status: true, nationalCode: true },
      }),
      this.defaultBankAccount(this.prisma, userId),
      this.prisma.hologramOwnership.findMany({
        where: { ownerUserId: userId, status: 'ACTIVE' },
        orderBy: { ownershipStartAt: 'desc' },
        include: {
          hologramCode: {
            include: {
              product: { select: { name: true } },
              incidentReports: {
                where: { status: { in: ['OPEN', 'CONFIRMED'] } },
                select: { type: true, reportNumber: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.listMine(userId),
    ]);

    const openCodeIds = new Set(
      requests
        .filter((r) => OPEN_STATUSES.includes(r.status))
        .map((r) => r.hologramCodeId),
    );
    const openCount = openCodeIds.size;

    const bars = await Promise.all(
      ownerships.map(async (o) => {
        const c = o.hologramCode;
        const reasons: string[] = [];
        if (openCodeIds.has(c.id)) reasons.push('درخواست بازخرید باز دارد');
        else if (c.status === 'TRANSFER_PENDING')
          reasons.push('در انتظار تأیید انتقال مالکیت است');
        else if (c.status !== 'ASSIGNED')
          reasons.push('در وضعیت فعلی قابل فروش نیست');
        if (c.incidentReports[0]) {
          reasons.push(
            `گزارش «${INCIDENT_TYPE_FA[c.incidentReports[0].type]}» فعال دارد`,
          );
        }
        if (!c.weightGrams) reasons.push('وزن شمش در سامانه ثبت نشده است');
        if (cfg.minHoldingDays > 0) {
          const allowedAt = new Date(
            o.ownershipStartAt.getTime() + cfg.minHoldingDays * 86_400_000,
          );
          if (allowedAt > new Date()) {
            reasons.push(`امکان فروش از ${formatJalaliDateTime(allowedAt)}`);
          }
        }
        if (
          identity?.nationalCode &&
          identity.nationalCode !== o.nationalCode
        ) {
          reasons.push('کد ملی مالک ثبت‌شده با حساب شما یکسان نیست');
        }
        let estimate: PriceBreakdown | null = null;
        if (c.weightGrams) {
          try {
            estimate = await this.computePrice({
              weightGrams: c.weightGrams.toString(),
              purityKarat: c.purityKarat,
            });
          } catch {
            estimate = null; // قیمت لحظه‌ای در دسترس نیست
          }
        }
        return {
          hologramCodeId: c.id,
          code: c.code,
          productTitle: c.product?.name ?? null,
          weightGrams: c.weightGrams?.toString() ?? null,
          purityKarat: c.purityKarat,
          factorySerialNumber: c.factorySerialNumber,
          ownershipStartAt: o.ownershipStartAt,
          eligible: reasons.length === 0,
          reasons,
          estimate,
        };
      }),
    );

    const blockers: string[] = [];
    if (!cfg.enabled)
      blockers.push('امکان فروش شمش به آرکان گلد موقتاً غیرفعال است.');
    if (identity?.status !== 'VERIFIED') {
      blockers.push('برای فروش شمش ابتدا احراز هویت خود را تکمیل کنید.');
    }
    if (!bank) {
      blockers.push(
        'یک کارت بانکی تأییدشده را به‌عنوان حساب پیش‌فرض تعیین کنید؛ مبلغ بازخرید فقط به حساب پیش‌فرض شما واریز می‌شود.',
      );
    }
    if (openCount >= cfg.maxOpenRequests) {
      blockers.push(
        `حداکثر ${cfg.maxOpenRequests.toLocaleString('fa-IR')} درخواست بازخرید باز هم‌زمان مجاز است.`,
      );
    }

    return {
      enabled: cfg.enabled,
      blockers,
      terms: {
        deductionPercent: cfg.deductionPercent.toString(),
        feeRial: cfg.feeRial.toFixed(0),
        offerValidityHours: cfg.offerValidityHours,
        minHoldingDays: cfg.minHoldingDays,
        dropoffAddress: cfg.dropoffAddress,
        postInstructions: cfg.postInstructions,
        deliveryMethods: [
          { key: 'IN_PERSON', label: DELIVERY_FA.IN_PERSON },
          ...(cfg.postInstructions
            ? [{ key: 'INSURED_POST', label: DELIVERY_FA.INSURED_POST }]
            : []),
        ],
      },
      bankAccount: bank
        ? {
            bankName: bank.bankName,
            cardNumber: maskCard(bank.cardNumber),
            sheba: maskSheba(bank.sheba),
            ownerName: bank.ownerName,
          }
        : null,
      bars,
      requests,
    };
  }

  async create(userId: string, dto: CreateBuybackDto) {
    const cfg = await this.config();
    if (!cfg.enabled) {
      throw new ForbiddenException(
        'امکان فروش شمش به آرکان گلد موقتاً غیرفعال است',
      );
    }
    if (dto.deliveryMethod === 'INSURED_POST' && !cfg.postInstructions) {
      throw new BadRequestException(
        'ارسال پستی شمش در حال حاضر پذیرفته نمی‌شود',
      );
    }

    const identity = await this.prisma.userIdentity.findUnique({
      where: { userId },
    });
    if (identity?.status !== 'VERIFIED' || !identity.nationalCode) {
      throw new ForbiddenException(
        'برای فروش شمش ابتدا احراز هویت خود را تکمیل کنید',
      );
    }

    // برآورد اولیه خارج از تراکنش (فراخوانی قیمت لحظه‌ای)
    const preview = await this.prisma.hologramCode.findUnique({
      where: { id: dto.hologramCodeId },
      select: { weightGrams: true, purityKarat: true },
    });
    if (!preview) throw new NotFoundException('شمش یافت نشد');
    if (!preview.weightGrams) {
      throw new ConflictException(
        'وزن این شمش در سامانه ثبت نشده است؛ با پشتیبانی تماس بگیرید',
      );
    }
    const estimate = await this.computePrice({
      weightGrams: preview.weightGrams.toString(),
      purityKarat: preview.purityKarat,
    });

    const created = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${dto.hologramCodeId}::uuid FOR UPDATE`;
        const code = await tx.hologramCode.findUnique({
          where: { id: dto.hologramCodeId },
          include: {
            product: { select: { name: true } },
            ownerships: { where: { status: 'ACTIVE' }, take: 1 },
          },
        });
        if (!code) throw new NotFoundException('شمش یافت نشد');
        const ownership = code.ownerships[0];
        if (!ownership || ownership.ownerUserId !== userId) {
          throw new ForbiddenException('شما مالک فعلی این شمش نیستید');
        }
        if (ownership.nationalCode !== identity.nationalCode) {
          throw new ForbiddenException(
            'کد ملی مالک ثبت‌شده‌ی این شمش با کد ملی حساب شما یکسان نیست؛ با پشتیبانی تماس بگیرید',
          );
        }
        if (code.status === 'BUYBACK_PENDING') {
          throw new ConflictException(
            'برای این شمش درخواست بازخرید باز وجود دارد',
          );
        }
        if (code.status !== 'ASSIGNED') {
          throw new ConflictException(
            'این شمش در حال حاضر قابل فروش نیست (درخواست انتقال مالکیت در جریان است)',
          );
        }
        const incident = await findActiveIncident(tx, code.id);
        if (incident) {
          throw new ConflictException(
            `برای این شمش گزارش «${INCIDENT_TYPE_FA[incident.type]}» (شماره ${incident.reportNumber}) ثبت شده و تا بسته‌شدن گزارش قابل فروش نیست`,
          );
        }
        if (cfg.minHoldingDays > 0) {
          const allowedAt = new Date(
            ownership.ownershipStartAt.getTime() +
              cfg.minHoldingDays * 86_400_000,
          );
          if (allowedAt > new Date()) {
            throw new ConflictException(
              `فروش این شمش از ${formatJalaliDateTime(allowedAt)} امکان‌پذیر است`,
            );
          }
        }
        const open = await tx.bullionBuybackRequest.count({
          where: { userId, status: { in: OPEN_STATUSES } },
        });
        if (open >= cfg.maxOpenRequests) {
          throw new ConflictException(
            `حداکثر ${cfg.maxOpenRequests.toLocaleString('fa-IR')} درخواست بازخرید باز هم‌زمان مجاز است`,
          );
        }
        const bank = await this.defaultBankAccount(tx, userId);
        if (!bank) {
          throw new ConflictException(
            'حساب بانکی پیش‌فرض تأییدشده ندارید؛ ابتدا یک کارت بانکی تأییدشده را پیش‌فرض کنید',
          );
        }

        const r = await tx.bullionBuybackRequest.create({
          data: {
            requestNumber: await this.sequence.next(tx, 'BBK'),
            userId,
            hologramCodeId: code.id,
            ownershipId: ownership.id,
            status: 'SUBMITTED',
            declaredWeightGrams: code.weightGrams ?? preview.weightGrams,
            purityKarat: code.purityKarat,
            productTitle: code.product?.name ?? null,
            ownerFullName: ownership.fullName,
            ownerNationalCode: ownership.nationalCode,
            deliveryMethod: dto.deliveryMethod,
            userNote: dto.note?.trim() || null,
            estimatedPriceRial: estimate.netRial,
            bankAccountId: bank.id,
            destinationSnapshot: this.destinationSnapshot(bank),
          },
        });
        await tx.hologramCode.update({
          where: { id: code.id },
          data: { status: 'BUYBACK_PENDING' },
        });
        await this.event(
          tx,
          r.id,
          null,
          'SUBMITTED',
          { type: 'USER', userId },
          dto.note,
        );
        return r;
      },
      { maxWait: 5000, timeout: 15000 },
    );

    void this.notify(
      created,
      `درخواست فروش شمش شما به آرکان گلد با شماره ${created.requestNumber} ثبت شد. پس از بررسی، زمان تحویل شمش اطلاع داده می‌شود.`,
      { key: 'BUYBACK_SUBMITTED' },
    );
    return {
      message: 'درخواست بازخرید ثبت شد',
      id: created.id,
      requestNumber: created.requestNumber,
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.bullionBuybackRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { hologramCode: { select: { code: true } } },
    });
    return rows.map((r) => this.presentForUser(r));
  }

  async getMine(userId: string, id: string) {
    const r = await this.prisma.bullionBuybackRequest.findUnique({
      where: { id },
      include: {
        hologramCode: { select: { code: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r || r.userId !== userId)
      throw new NotFoundException('درخواست بازخرید یافت نشد');
    const cfg = await this.config();
    return {
      ...this.presentForUser(r),
      dropoffAddress: cfg.dropoffAddress,
      postInstructions: cfg.postInstructions,
      timeline: r.events.map((e) => ({
        status: e.toStatus,
        statusLabel: BUYBACK_STATUS_FA[e.toStatus],
        note:
          e.actorType === 'ADMIN' || e.actorType === 'SYSTEM' ? e.note : null,
        at: e.createdAt,
      })),
    };
  }

  private presentForUser(r: BuybackRow & { hologramCode: { code: string } }) {
    const dest = r.destinationSnapshot as Record<string, string | null>;
    const offerVisible = ['OFFERED', 'ACCEPTED', 'APPROVED', 'PAID'].includes(
      r.status,
    );
    return {
      id: r.id,
      requestNumber: r.requestNumber,
      hologramCodeId: r.hologramCodeId,
      hologramCode: r.hologramCode.code,
      productTitle: r.productTitle,
      weightGrams: r.declaredWeightGrams.toString(),
      purityKarat: r.purityKarat,
      status: r.status,
      statusLabel: BUYBACK_STATUS_FA[r.status],
      deliveryMethod: r.deliveryMethod,
      deliveryMethodLabel: DELIVERY_FA[r.deliveryMethod],
      estimatedPriceRial: r.estimatedPriceRial.toString(),
      appointmentAt: r.appointmentAt,
      appointmentNote: r.appointmentNote,
      receivedAt: r.receivedAt,
      inspectionPassed: r.inspectionPassed,
      measuredWeightGrams: r.measuredWeightGrams?.toString() ?? null,
      offer: offerVisible
        ? {
            pricePerGramRial: r.offerPricePerGramRial?.toString() ?? null,
            grossRial: r.offerGrossRial?.toString() ?? null,
            deductionRial: r.offerDeductionRial?.toString() ?? null,
            feeRial: r.offerFeeRial?.toString() ?? null,
            netRial: r.offerNetRial?.toString() ?? null,
            note: r.offerNote,
            offeredAt: r.offeredAt,
            expiresAt: r.offerExpiresAt,
          }
        : null,
      destination: {
        bankName: dest?.bankName ?? null,
        cardNumber: maskCard(dest?.cardNumber),
        sheba: maskSheba(dest?.sheba),
      },
      paidAt: r.paidAt,
      bankReference: r.status === 'PAID' ? r.bankReference : null,
      rejectionReason: r.rejectionReason,
      returnReason: r.returnReason,
      returnedAt: r.returnedAt,
      cancelledAt: r.cancelledAt,
      canCancel: r.status === 'SUBMITTED' || r.status === 'AWAITING_DELIVERY',
      canRespond:
        r.status === 'OFFERED' &&
        !!r.offerExpiresAt &&
        r.offerExpiresAt > new Date(),
      createdAt: r.createdAt,
    };
  }

  async cancelByUser(userId: string, id: string, reason?: string) {
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(
        tx,
        id,
        ['SUBMITTED', 'AWAITING_DELIVERY'],
        userId,
      );
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          rejectionReason: reason?.trim() || null,
        },
      });
      await this.releaseCode(tx, row.hologramCodeId);
      await this.event(
        tx,
        id,
        row.status,
        'CANCELLED',
        { type: 'USER', userId },
        reason,
      );
      return updated;
    });
    return { message: 'درخواست بازخرید لغو شد', status: r.status };
  }

  async respondToOffer(userId: string, id: string, accept: boolean) {
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, ['OFFERED'], userId);
      if (!row.offerExpiresAt || row.offerExpiresAt <= new Date()) {
        throw new ConflictException(
          'مهلت پذیرش این قیمت به پایان رسیده است؛ قیمت جدید به‌زودی اعلام می‌شود',
        );
      }
      if (accept) {
        const updated = await tx.bullionBuybackRequest.update({
          where: { id },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        await this.event(
          tx,
          id,
          'OFFERED',
          'ACCEPTED',
          { type: 'USER', userId },
          'پذیرش قیمت نهایی',
        );
        return updated;
      }
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'RETURN_PENDING',
          returnReason: 'انصراف کاربر از فروش با قیمت اعلام‌شده',
        },
      });
      await this.event(
        tx,
        id,
        'OFFERED',
        'RETURN_PENDING',
        { type: 'USER', userId },
        'رد قیمت نهایی',
      );
      return updated;
    });
    return {
      message: accept
        ? 'قیمت نهایی پذیرفته شد؛ پس از تأیید نهایی، مبلغ به حساب پیش‌فرض شما واریز می‌شود'
        : 'از فروش انصراف دادید؛ برای تحویل گرفتن شمش با شما هماهنگ می‌شود',
      status: r.status,
    };
  }

  // ═══════════════════════════ پنل ادمین ═══════════════════════════

  async list(query: ListBuybackQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.BullionBuybackRequestWhereInput = {};
    if (query.status === 'OPEN') where.status = { in: OPEN_STATUSES };
    else if (query.status === 'ACTION') where.status = { in: ACTION_STATUSES };
    else if (query.status) where.status = query.status as BuybackStatusKey;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { requestNumber: { contains: q, mode: 'insensitive' } },
        { ownerFullName: { contains: q, mode: 'insensitive' } },
        { ownerNationalCode: { contains: q } },
        { user: { phone: { contains: q } } },
        { hologramCode: { code: { contains: q } } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.bullionBuybackRequest.count({ where }),
      this.prisma.bullionBuybackRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          hologramCode: { select: { code: true } },
          user: { select: { phone: true } },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        status: r.status,
        statusLabel: BUYBACK_STATUS_FA[r.status],
        ownerFullName: r.ownerFullName,
        phone: r.user.phone,
        hologramCode: r.hologramCode.code,
        productTitle: r.productTitle,
        weightGrams: r.declaredWeightGrams.toString(),
        purityKarat: r.purityKarat,
        deliveryMethod: r.deliveryMethod,
        estimatedPriceRial: r.estimatedPriceRial.toString(),
        offerNetRial: r.offerNetRial?.toString() ?? null,
        appointmentAt: r.appointmentAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async summary() {
    const groups = await this.prisma.bullionBuybackRequest.groupBy({
      by: ['status'],
      _count: true,
    });
    const counts = Object.fromEntries(
      BUYBACK_STATUSES_LIST.map((s) => [s, 0]),
    ) as Record<BuybackStatusKey, number>;
    for (const g of groups) counts[g.status] = g._count;
    const paid = await this.prisma.bullionBuybackRequest.aggregate({
      where: { status: 'PAID' },
      _sum: { offerNetRial: true, declaredWeightGrams: true },
      _count: true,
    });
    return {
      counts,
      open: OPEN_STATUSES.reduce((t, s) => t + counts[s], 0),
      needsAction: ACTION_STATUSES.reduce((t, s) => t + counts[s], 0),
      paid: {
        count: paid._count,
        totalRial: paid._sum.offerNetRial?.toString() ?? '0',
        totalGrams: paid._sum.declaredWeightGrams?.toString() ?? '0',
      },
      statusLabels: BUYBACK_STATUS_FA,
    };
  }

  async getOne(id: string) {
    const r = await this.prisma.bullionBuybackRequest.findUnique({
      where: { id },
      include: {
        hologramCode: {
          include: {
            product: { select: { name: true } },
            batch: { select: { batchNumber: true } },
          },
        },
        user: {
          select: {
            id: true,
            phone: true,
            status: true,
            identity: {
              select: {
                firstName: true,
                lastName: true,
                nationalCode: true,
                status: true,
              },
            },
          },
        },
        bankAccount: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('درخواست بازخرید یافت نشد');

    const adminIds = [
      ...new Set(
        [
          r.reviewedByAdminId,
          r.receivedByAdminId,
          r.inspectedByAdminId,
          r.offeredByAdminId,
          r.approvedByAdminId,
          r.paidByAdminId,
          r.returnedByAdminId,
          ...r.events.map((e) => e.actorAdminId),
        ].filter((x): x is string => !!x),
      ),
    ];
    const admins = adminIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, fullName: true, username: true },
        })
      : [];
    const adminName = (aid: string | null) => {
      if (!aid) return null;
      const a = admins.find((x) => x.id === aid);
      return a ? (a.fullName ?? a.username) : '—';
    };
    const incident = await findActiveIncident(this.prisma, r.hologramCodeId);
    const dualControlThreshold = await this.systemConfig.getNumber(
      'withdrawal.dual_control_threshold',
      500_000_000,
    );

    return {
      id: r.id,
      requestNumber: r.requestNumber,
      status: r.status,
      statusLabel: BUYBACK_STATUS_FA[r.status],
      createdAt: r.createdAt,
      user: {
        id: r.user.id,
        phone: r.user.phone,
        status: r.user.status,
        fullName:
          `${r.user.identity?.firstName ?? ''} ${r.user.identity?.lastName ?? ''}`.trim() ||
          null,
        nationalCode: r.user.identity?.nationalCode ?? null,
        identityStatus: r.user.identity?.status ?? null,
      },
      owner: { fullName: r.ownerFullName, nationalCode: r.ownerNationalCode },
      bar: {
        hologramCodeId: r.hologramCodeId,
        code: r.hologramCode.code,
        codeStatus: r.hologramCode.status,
        productTitle: r.productTitle ?? r.hologramCode.product?.name ?? null,
        weightGrams: r.declaredWeightGrams.toString(),
        purityKarat: r.purityKarat,
        factorySerialNumber: r.hologramCode.factorySerialNumber,
        batchNumber: r.hologramCode.batch.batchNumber,
      },
      activeIncident: incident
        ? {
            reportNumber: incident.reportNumber,
            type: incident.type,
            typeLabel: INCIDENT_TYPE_FA[incident.type],
          }
        : null,
      request: {
        deliveryMethod: r.deliveryMethod,
        deliveryMethodLabel: DELIVERY_FA[r.deliveryMethod],
        userNote: r.userNote,
        estimatedPriceRial: r.estimatedPriceRial.toString(),
      },
      destination: {
        ...(r.destinationSnapshot as Record<string, unknown>),
        currentStatus: r.bankAccount.status,
        isDefault: r.bankAccount.isDefault,
      },
      review: {
        by: adminName(r.reviewedByAdminId),
        at: r.reviewedAt,
        appointmentAt: r.appointmentAt,
        appointmentNote: r.appointmentNote,
      },
      receipt: {
        by: adminName(r.receivedByAdminId),
        at: r.receivedAt,
        note: r.receiptNote,
      },
      inspection: {
        by: adminName(r.inspectedByAdminId),
        at: r.inspectedAt,
        passed: r.inspectionPassed,
        checklist: r.inspectionChecklist,
        measuredWeightGrams: r.measuredWeightGrams?.toString() ?? null,
        measuredFineness: r.measuredFineness?.toString() ?? null,
        note: r.inspectionNote,
      },
      offer: {
        by: adminName(r.offeredByAdminId),
        at: r.offeredAt,
        expiresAt: r.offerExpiresAt,
        pricePerGramRial: r.offerPricePerGramRial?.toString() ?? null,
        grossRial: r.offerGrossRial?.toString() ?? null,
        deductionRial: r.offerDeductionRial?.toString() ?? null,
        feeRial: r.offerFeeRial?.toString() ?? null,
        netRial: r.offerNetRial?.toString() ?? null,
        note: r.offerNote,
        acceptedAt: r.acceptedAt,
      },
      approval: {
        by: adminName(r.approvedByAdminId),
        at: r.approvedAt,
        byId: r.approvedByAdminId,
      },
      payment: {
        by: adminName(r.paidByAdminId),
        at: r.paidAt,
        bankReference: r.bankReference,
        payoutMethod: r.payoutMethod,
        sourceAccountCode: r.sourceAccountCode,
        journalEntryId: r.journalEntryId,
        requiresDualControl: r.offerNetRial
          ? requiresDualControl(r.offerNetRial, dualControlThreshold)
          : false,
      },
      closing: {
        rejectionReason: r.rejectionReason,
        cancelledAt: r.cancelledAt,
        returnReason: r.returnReason,
        returnedAt: r.returnedAt,
        returnedBy: adminName(r.returnedByAdminId),
        returnNote: r.returnNote,
      },
      timeline: r.events.map((e) => ({
        id: e.id,
        from: e.fromStatus,
        to: e.toStatus,
        toLabel: BUYBACK_STATUS_FA[e.toStatus],
        actorType: e.actorType,
        actor:
          e.actorType === 'ADMIN'
            ? adminName(e.actorAdminId)
            : e.actorType === 'USER'
              ? 'کاربر'
              : 'سیستم',
        note: e.note,
        at: e.createdAt,
      })),
    };
  }

  /** پیشنهاد قیمت بر اساس قیمت لحظه‌ای و نتیجه‌ی اصالت‌سنجی (پیش‌نمایش برای کارشناس) */
  async suggestOffer(id: string, overrides: OfferBuybackDto = {}) {
    const r = await this.prisma.bullionBuybackRequest.findUnique({
      where: { id },
    });
    if (!r) throw new NotFoundException('درخواست بازخرید یافت نشد');
    return this.computePrice({
      weightGrams: this.pricingWeight(r).toString(),
      purityKarat: r.purityKarat,
      fineness: r.measuredFineness?.toString() ?? null,
      pricePerGramRial: overrides.pricePerGramRial ?? null,
      deductionPercent: overrides.deductionPercent ?? null,
      feeRial: overrides.feeRial ?? null,
    });
  }

  /** وزن مبنای قیمت: وزن اندازه‌گیری‌شده، حداکثر تا وزن اسمی ثبت‌شده‌ی شمش */
  private pricingWeight(r: {
    declaredWeightGrams: Prisma.Decimal;
    measuredWeightGrams: Prisma.Decimal | null;
  }) {
    const declared = toDecimal(r.declaredWeightGrams);
    if (!r.measuredWeightGrams) return declared;
    return Decimal.min(toDecimal(r.measuredWeightGrams), declared);
  }

  async accept(adminId: string, id: string, dto: AcceptBuybackDto) {
    const appointmentAt = dto.appointmentAt
      ? new Date(dto.appointmentAt)
      : null;
    if (appointmentAt && Number.isNaN(appointmentAt.getTime())) {
      throw new BadRequestException('زمان نوبت نامعتبر است');
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, [
        'SUBMITTED',
        'AWAITING_DELIVERY',
      ]);
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'AWAITING_DELIVERY',
          reviewedByAdminId: row.reviewedByAdminId ?? adminId,
          reviewedAt: row.reviewedAt ?? new Date(),
          appointmentAt,
          appointmentNote: dto.appointmentNote?.trim() || null,
        },
      });
      await this.event(
        tx,
        id,
        row.status,
        'AWAITING_DELIVERY',
        { type: 'ADMIN', adminId },
        [
          appointmentAt ? `نوبت: ${formatJalaliDateTime(appointmentAt)}` : null,
          dto.appointmentNote,
        ]
          .filter(Boolean)
          .join(' — '),
      );
      return updated;
    });
    const when = r.appointmentAt
      ? `در ${formatJalaliDateTime(r.appointmentAt)}`
      : 'در ساعات کاری';
    void this.notify(
      r,
      `درخواست بازخرید ${r.requestNumber} پذیرفته شد. لطفاً شمش را ${when} به همراه کارت ملی تحویل دهید.${r.appointmentNote ? ` (${r.appointmentNote})` : ''}`,
      { key: 'BUYBACK_AWAITING_DELIVERY', vars: { time: when } },
    );
    return {
      message: 'درخواست پذیرفته شد و زمان تحویل به کاربر اطلاع داده شد',
    };
  }

  async reject(adminId: string, id: string, reason: string) {
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, [
        'SUBMITTED',
        'AWAITING_DELIVERY',
      ]);
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedByAdminId: row.reviewedByAdminId ?? adminId,
          reviewedAt: row.reviewedAt ?? new Date(),
        },
      });
      await this.releaseCode(tx, row.hologramCodeId);
      await this.event(
        tx,
        id,
        row.status,
        'REJECTED',
        { type: 'ADMIN', adminId },
        reason,
      );
      return updated;
    });
    void this.notify(
      r,
      `درخواست بازخرید ${r.requestNumber} رد شد. دلیل: ${reason.trim()}`,
      {
        key: 'BUYBACK_REJECTED',
        vars: { reason: reason.trim() },
      },
    );
    return { message: 'درخواست رد شد و شمش از حالت قفل خارج شد' };
  }

  async markReceived(adminId: string, id: string, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, [
        'SUBMITTED',
        'AWAITING_DELIVERY',
      ]);
      await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          reviewedByAdminId: row.reviewedByAdminId ?? adminId,
          reviewedAt: row.reviewedAt ?? new Date(),
          receivedByAdminId: adminId,
          receivedAt: new Date(),
          receiptNote: note?.trim() || null,
        },
      });
      await this.event(
        tx,
        id,
        row.status,
        'RECEIVED',
        { type: 'ADMIN', adminId },
        note,
      );
    });
    const r = await this.prisma.bullionBuybackRequest.findUniqueOrThrow({
      where: { id },
    });
    void this.notify(
      r,
      `شمش درخواست بازخرید ${r.requestNumber} در دفتر آرکان گلد دریافت شد و در حال اصالت‌سنجی است.`,
    );
    return { message: 'دریافت شمش ثبت شد؛ مرحله‌ی بعد اصالت‌سنجی است' };
  }

  async inspect(adminId: string, id: string, dto: InspectBuybackDto) {
    const allChecks = Object.entries(dto.checklist)
      .filter(([k]) => k !== 'purityTestMethod')
      .every(([, v]) => v === true);
    if (dto.passed && !allChecks) {
      throw new BadRequestException(
        'برای تأیید اصالت، همه‌ی موارد چک‌لیست باید تأیید شوند؛ در غیر این صورت نتیجه را «ناموفق» ثبت کنید',
      );
    }
    if (dto.passed && dto.measuredWeightGrams == null) {
      throw new BadRequestException('وزن اندازه‌گیری‌شده‌ی شمش را وارد کنید');
    }
    if (!dto.passed && !dto.note?.trim()) {
      throw new BadRequestException(
        'دلیل ناموفق بودن اصالت‌سنجی را در توضیحات بنویسید',
      );
    }

    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, [
        'RECEIVED',
        'INSPECTION_PASSED',
      ]);
      const to: BuybackStatusKey = dto.passed
        ? 'INSPECTION_PASSED'
        : 'RETURN_PENDING';
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: to,
          inspectedByAdminId: adminId,
          inspectedAt: new Date(),
          inspectionPassed: dto.passed,
          inspectionChecklist: { ...dto.checklist },
          measuredWeightGrams: dto.measuredWeightGrams ?? null,
          measuredFineness: dto.measuredFineness ?? null,
          inspectionNote: dto.note?.trim() || null,
          ...(dto.passed
            ? {}
            : { returnReason: `اصالت‌سنجی ناموفق: ${dto.note?.trim()}` }),
        },
      });
      const summary = [
        dto.measuredWeightGrams != null
          ? `وزن ${dto.measuredWeightGrams} گرم`
          : null,
        dto.measuredFineness != null ? `عیار ${dto.measuredFineness}` : null,
        dto.note?.trim() || null,
      ]
        .filter(Boolean)
        .join(' — ');
      await this.event(
        tx,
        id,
        row.status,
        to,
        { type: 'ADMIN', adminId },
        summary,
      );
      return updated;
    });

    if (!dto.passed) {
      void this.notify(
        r,
        `اصالت‌سنجی شمش درخواست ${r.requestNumber} تأیید نشد و شمش به شما عودت داده می‌شود. دلیل: ${dto.note?.trim()}`,
        { key: 'BUYBACK_RETURN', vars: { reason: dto.note?.trim() ?? '' } },
      );
    }
    return {
      message: dto.passed
        ? 'اصالت شمش تأیید شد؛ اکنون قیمت نهایی را اعلام کنید'
        : 'اصالت‌سنجی ناموفق ثبت شد؛ شمش باید به مالک عودت داده شود',
    };
  }

  async offer(adminId: string, id: string, dto: OfferBuybackDto) {
    const cfg = await this.config();
    const current = await this.prisma.bullionBuybackRequest.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('درخواست بازخرید یافت نشد');
    const price = await this.suggestOffer(id, dto);
    if (new Decimal(price.netRial).lte(0)) {
      throw new BadRequestException(
        'مبلغ نهایی پس از کسورات باید بیشتر از صفر باشد',
      );
    }
    const expiresAt = new Date(Date.now() + cfg.offerValidityHours * 3_600_000);

    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, [
        'INSPECTION_PASSED',
        'OFFERED',
      ]);
      if (row.inspectionPassed !== true) {
        throw new ConflictException(
          'پیش از اعلام قیمت، اصالت‌سنجی شمش باید موفق ثبت شود',
        );
      }
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'OFFERED',
          offeredByAdminId: adminId,
          offeredAt: new Date(),
          offerExpiresAt: expiresAt,
          offerPricePerGramRial: price.pricePerGramRial,
          offerGrossRial: price.grossRial,
          offerDeductionRial: price.deductionRial,
          offerFeeRial: price.feeRial,
          offerNetRial: price.netRial,
          offerNote: dto.note?.trim() || null,
          acceptedAt: null,
        },
      });
      await this.event(
        tx,
        id,
        row.status,
        'OFFERED',
        { type: 'ADMIN', adminId },
        `مبلغ نهایی ${toman(price.netRial)} تومان (هر گرم ${toman(price.pricePerGramRial)} تومان × ${price.weightGrams} گرم، کسر ${price.deductionPercent}٪)${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}`,
      );
      return updated;
    });

    void this.notify(
      r,
      `اصالت شمش درخواست ${r.requestNumber} تأیید شد. مبلغ نهایی خرید: ${toman(price.netRial)} تومان. لطفاً تا ${cfg.offerValidityHours.toLocaleString('fa-IR')} ساعت آینده از بخش «فروش شمش» آن را تأیید یا رد کنید.`,
      {
        key: 'BUYBACK_OFFERED',
        vars: {
          amount: toman(price.netRial),
          hours: cfg.offerValidityHours.toLocaleString('fa-IR'),
        },
      },
    );
    return { message: 'قیمت نهایی برای کاربر ارسال شد', price, expiresAt };
  }

  /** تأیید نهایی مالی؛ حساب مقصد با حساب پیش‌فرض تأییدشده‌ی فعلی کاربر به‌روز می‌شود */
  async approve(adminId: string, id: string, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, ['ACCEPTED']);
      const bank = await this.defaultBankAccount(tx, row.userId);
      if (!bank) {
        throw new ConflictException(
          'کاربر حساب بانکی پیش‌فرض تأییدشده ندارد؛ پیش از تأیید نهایی باید حساب پیش‌فرض خود را تعیین کند',
        );
      }
      const changed = bank.id !== row.bankAccountId;
      await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedByAdminId: adminId,
          approvedAt: new Date(),
          ...(changed
            ? {
                bankAccountId: bank.id,
                destinationSnapshot: this.destinationSnapshot(bank),
              }
            : {}),
        },
      });
      await this.event(
        tx,
        id,
        'ACCEPTED',
        'APPROVED',
        { type: 'ADMIN', adminId },
        [
          changed
            ? `حساب مقصد به حساب پیش‌فرض فعلی کاربر (${bank.bankName}) به‌روز شد`
            : null,
          note,
        ]
          .filter(Boolean)
          .join(' — '),
      );
    });
    return { message: 'تأیید نهایی ثبت شد؛ درخواست در صف واریز قرار گرفت' };
  }

  private async resolveSourceAccount(tx: Tx, code: string | undefined) {
    const fallback = await this.systemConfig.get(
      'withdrawal.default_source_account',
      '1010',
    );
    const chosen = (code?.trim() || fallback || '1010').trim();
    if (!/^1010\d*$/.test(chosen)) {
      throw new BadRequestException(
        'حساب مبدأ پرداخت باید حساب نقد و بانک (1010 یا معین‌های آن) باشد',
      );
    }
    const account = await tx.account.findUnique({ where: { code: chosen } });
    if (!account || !account.isActive) {
      throw new BadRequestException(`حساب ${chosen} یافت نشد یا غیرفعال است`);
    }
    return chosen;
  }

  async pay(adminId: string, id: string, dto: PayBuybackDto) {
    const bankReference = dto.bankReference.trim();
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (
      Number.isNaN(paidAt.getTime()) ||
      paidAt.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('تاریخ پرداخت نامعتبر است');
    }
    const threshold = await this.systemConfig.getNumber(
      'withdrawal.dual_control_threshold',
      500_000_000,
    );

    const r = await this.prisma.$transaction(
      async (tx) => {
        const row = await this.lockRequest(tx, id, ['APPROVED']);
        const net = toDecimal(row.offerNetRial);
        if (net.lte(0))
          throw new ConflictException('مبلغ نهایی بازخرید ثبت نشده است');
        // FPT_ITT_EXT.1.7 — تفکیک وظایف: مبلغ بالای سقف را تأییدکننده‌ی نهایی نمی‌تواند پرداخت کند
        if (
          requiresDualControl(net.toString(), threshold) &&
          row.approvedByAdminId === adminId
        ) {
          throw new ForbiddenException(
            'این مبلغ بالای سقف تأیید دونفره است؛ واریز باید توسط کارشناسی غیر از تأییدکننده‌ی نهایی ثبت شود',
          );
        }
        const bank = await tx.bankAccount.findUnique({
          where: { id: row.bankAccountId },
        });
        if (!bank || bank.status !== 'VERIFIED' || !bank.isVerified) {
          throw new ConflictException(
            'حساب بانکی مقصد دیگر تأییدشده نیست؛ درخواست را دوباره تأیید نهایی کنید',
          );
        }
        const incident = await findActiveIncident(tx, row.hologramCodeId);
        if (incident) {
          throw new ConflictException(
            `برای این شمش گزارش «${INCIDENT_TYPE_FA[incident.type]}» (${incident.reportNumber}) فعال است؛ واریز مجاز نیست`,
          );
        }

        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${row.hologramCodeId}::uuid FOR UPDATE`;
        const code = await tx.hologramCode.findUniqueOrThrow({
          where: { id: row.hologramCodeId },
        });
        if (code.status !== 'BUYBACK_PENDING') {
          throw new ConflictException(
            'وضعیت شمش با فرآیند بازخرید سازگار نیست',
          );
        }
        const grams = toDecimal(code.weightGrams ?? row.declaredWeightGrams);
        const sourceCode = await this.resolveSourceAccount(
          tx,
          dto.sourceAccountCode,
        );

        // سند: ورود شمش به خزانه به بهای پرداختی و پرداخت از بانک
        const journal = await this.accounting.postJournal(tx, {
          description: `بازخرید شمش ${code.code} از مالک (${row.ownerFullName}) — درخواست ${row.requestNumber} — پیگیری بانکی ${bankReference}`,
          totalRial: net.toString(),
          totalGrams: grams.toString(),
          lines: [
            {
              accountCode: ACC.BULLION,
              side: 'DEBIT',
              amountRial: net.toString(),
              amountGrams: grams.toString(),
              description: `ورود شمش بازخریدشده ${code.code} به خزانه`,
            },
            {
              accountCode: sourceCode,
              side: 'CREDIT',
              amountRial: net.toString(),
              description: `واریز به حساب فروشنده — پیگیری ${bankReference}`,
            },
            {
              accountCode: ACC.BULLION_CLEARING,
              side: 'CREDIT',
              amountGrams: grams.toString(),
              description: 'طرف مقداری ورود شمش بازخریدشده',
            },
          ],
          referenceType: 'BULLION_BUYBACK',
          referenceId: row.id,
          createdByAdminId: adminId,
          entryDate: dto.paidAt ? paidAt : undefined,
        });

        // پایان مالکیت کاربر و بازگشت شمش به موجودی کددار خزانه (قابل فروش مجدد)
        await tx.hologramOwnership.updateMany({
          where: { hologramCodeId: code.id, status: 'ACTIVE' },
          data: { status: 'TRANSFERRED', ownershipEndAt: paidAt },
        });
        await tx.ownershipTransferRequest.updateMany({
          where: { hologramCodeId: code.id, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            rejectionReason: 'بازخرید شمش توسط آرکان گلد',
          },
        });
        await tx.hologramCode.update({
          where: { id: code.id },
          data: {
            status: 'UNASSIGNED',
            shopOrderItemId: null,
            assignedByAdminId: null,
            assignedAt: null,
            vaultCodedAt: paidAt,
          },
        });

        const updated = await tx.bullionBuybackRequest.update({
          where: { id },
          data: {
            status: 'PAID',
            paidByAdminId: adminId,
            paidAt,
            bankReference,
            payoutMethod: dto.payoutMethod ?? 'PAYA',
            sourceAccountCode: sourceCode,
            journalEntryId: journal.id,
          },
        });
        await this.event(
          tx,
          id,
          'APPROVED',
          'PAID',
          { type: 'ADMIN', adminId },
          [`پیگیری بانکی ${bankReference}`, dto.note]
            .filter(Boolean)
            .join(' — '),
        );
        return updated;
      },
      { maxWait: 5000, timeout: 20000 },
    );

    const amount = toman(r.offerNetRial.toString());
    void this.notify(
      r,
      `مبلغ ${amount} تومان بابت بازخرید شمش (درخواست ${r.requestNumber}) به حساب بانکی شما واریز شد. شماره پیگیری: ${bankReference}`,
      { key: 'BUYBACK_PAID', vars: { amount, bankRef: bankReference } },
    );
    return {
      message: 'واریز ثبت شد، سند حسابداری صادر شد و شمش به خزانه منتقل شد',
    };
  }

  /** پس از دریافت شمش، به‌جای رد: شمش باید به مالک برگردد */
  async requestReturn(adminId: string, id: string, reason: string) {
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, [
        'RECEIVED',
        'INSPECTION_PASSED',
        'OFFERED',
        'ACCEPTED',
        'APPROVED',
      ]);
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: { status: 'RETURN_PENDING', returnReason: reason.trim() },
      });
      await this.event(
        tx,
        id,
        row.status,
        'RETURN_PENDING',
        { type: 'ADMIN', adminId },
        reason,
      );
      return updated;
    });
    void this.notify(
      r,
      `شمش درخواست بازخرید ${r.requestNumber} به شما عودت داده می‌شود. دلیل: ${reason.trim()}`,
      {
        key: 'BUYBACK_RETURN',
        vars: { reason: reason.trim() },
      },
    );
    return { message: 'درخواست به مرحله‌ی عودت شمش منتقل شد' };
  }

  async markReturned(adminId: string, id: string, note?: string) {
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRequest(tx, id, ['RETURN_PENDING']);
      const updated = await tx.bullionBuybackRequest.update({
        where: { id },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          returnedByAdminId: adminId,
          returnNote: note?.trim() || null,
        },
      });
      await this.releaseCode(tx, row.hologramCodeId);
      await this.event(
        tx,
        id,
        'RETURN_PENDING',
        'RETURNED',
        { type: 'ADMIN', adminId },
        note,
      );
      return updated;
    });
    void this.notify(
      r,
      `شمش درخواست بازخرید ${r.requestNumber} به شما تحویل داده شد و همچنان به نام شما ثبت است.`,
    );
    return { message: 'عودت شمش ثبت شد و شمش از حالت قفل خارج شد' };
  }

  // ═══════════════════════════ انقضای پیشنهاد قیمت ═══════════════════════════

  /** پیشنهادهای بی‌پاسخ پس از مهلت به «در انتظار اعلام قیمت» برمی‌گردند تا قیمت روز دوباره اعلام شود */
  @Cron('*/10 * * * *', { name: 'expire-bullion-buyback-offers' })
  async expireOffers(): Promise<void> {
    const stale = await this.prisma.bullionBuybackRequest.findMany({
      where: { status: 'OFFERED', offerExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 200,
    });
    for (const { id } of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const row = await this.lockRequest(tx, id, ['OFFERED']);
          if (!row.offerExpiresAt || row.offerExpiresAt >= new Date()) return;
          await tx.bullionBuybackRequest.update({
            where: { id },
            data: { status: 'INSPECTION_PASSED' },
          });
          await this.event(
            tx,
            id,
            'OFFERED',
            'INSPECTION_PASSED',
            { type: 'SYSTEM' },
            'پایان مهلت پذیرش قیمت؛ قیمت باید دوباره اعلام شود',
          );
        });
      } catch (err) {
        this.logger.warn(
          `انقضای پیشنهاد بازخرید ${id} ناموفق بود: ${(err as Error).message}`,
        );
      }
    }
  }
}
