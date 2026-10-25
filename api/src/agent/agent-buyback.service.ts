// api/src/agent/agent-buyback.service.ts
//
// فروش شمش ملکی نماینده به شرکت (آرکان گلد خریدار است):
//   ۱) نماینده شمش‌های ملکی (AGENT_OWNED) را انتخاب می‌کند؛ قیمت خرید لحظه‌ای قفل و شمش‌ها
//      «در فرآیند فروش به شرکت» (BUYBACK_PENDING) می‌شوند تا قابل فروش به مشتری نباشند
//   ۲) تحویل فیزیکی تا مهلت مقرر؛ دریافت و بازرسی (عیار/وزن/هولوگرام/بسته‌بندی) توسط شرکت —
//      شمش ردشده به موجودی ملکی نماینده برمی‌گردد و مبلغ نهایی قابل اصلاح است
//   ۳) نماینده (فروشنده) صورتحساب الکترونیک خود را به نام شرکت در سامانه مؤدیان صادر و شماره‌ی
//      آن را ثبت می‌کند (قابل الزام از تنظیمات)
//   ۴) تسویه: واریز به کیف پول نماینده (پیش‌فرض) یا پرداخت بانکی به حساب تأییدشده‌ی نماینده؛
//      شمش با بهای خرید وارد موجودی خزانه می‌شود (بد 1025 / بس 2070 یا 1010)
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
import { AgentAccountingService, agentTag } from './agent-accounting.service';
import { AgentWalletService } from './agent-wallet.service';
import { AgentFundsService } from './agent-funds.service';
import {
  BuybackAgentInvoiceDto,
  CreateBuybackOrderDto,
  ReceiveBuybackDto,
  TradingListQueryDto,
} from './agent-trading.dto';

const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

const roundToman = (v: Decimal) =>
  v.dividedBy(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(10);

const toman = (rial: Decimal.Value | Prisma.Decimal) =>
  new Decimal(rial.toString())
    .dividedBy(10)
    .toDecimalPlaces(0)
    .toNumber()
    .toLocaleString('fa-IR');

export const BUYBACK_STATUS_FA: Record<string, string> = {
  PENDING_DELIVERY: 'در انتظار تحویل شمش به شرکت',
  RECEIVED: 'دریافت و بازرسی شد',
  APPROVED: 'تأییدشده — در انتظار تسویه',
  PAID: 'تسویه‌شده',
  REJECTED: 'ردشده — شمش‌ها به نماینده برگشت',
  CANCELLED: 'لغوشده',
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

@Injectable()
export class AgentBuybackService {
  private readonly logger = new Logger(AgentBuybackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: DocumentSequenceService,
    private readonly systemConfig: SystemConfigService,
    private readonly sms: SmsTemplateService,
    private readonly pricing: PricingEngineService,
    private readonly agentAccounting: AgentAccountingService,
    private readonly wallet: AgentWalletService,
    private readonly funds: AgentFundsService,
  ) {}

  /** قیمت خرید هر گرم از نماینده = قیمت لحظه‌ای × (۱ − درصد کسر خرید) */
  private async buyPricePerGram(purity: 'K18' | 'K24') {
    const discount = await this.systemConfig.getNumber(
      'agent.buyback.discount_percent',
      1,
    );
    const p = await this.pricing.getGoldPricePerGram(purity);
    return p.times(1 - discount / 100).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  }

  /** پیش‌نمایش قیمت خرید شمش‌های انتخابی (بدون قفل) */
  async quote(agentId: string, codes: string[]) {
    const bars = await this.ownedBars(agentId, codes);
    const cache = new Map<string, Decimal>();
    let total = new Decimal(0);
    const items: {
      code: string;
      weightGrams: string;
      purityKarat: 'K18' | 'K24';
      pricePerGramRial: string;
      amountRial: string;
    }[] = [];
    for (const b of bars) {
      const purity = b.purityKarat;
      if (!cache.has(purity))
        cache.set(purity, await this.buyPricePerGram(purity));
      const ppg = cache.get(purity);
      const amount = roundToman(d(b.weightGrams).times(ppg));
      total = total.plus(amount);
      items.push({
        code: b.code,
        weightGrams: d(b.weightGrams).toString(),
        purityKarat: purity,
        pricePerGramRial: ppg.toFixed(0),
        amountRial: amount.toFixed(0),
      });
    }
    return { items, totalRial: total.toFixed(0) };
  }

  private async ownedBars(agentId: string, codes: string[]) {
    const unique = [...new Set(codes)];
    if (unique.length !== codes.length) {
      throw new BadRequestException('کد تکراری در فهرست وجود دارد');
    }
    const bars = await this.prisma.hologramCode.findMany({
      where: { code: { in: unique } },
      include: {
        incidentReports: {
          where: { status: { in: ['OPEN', 'CONFIRMED'] } },
          take: 1,
        },
      },
    });
    const invalid = unique.filter(
      (c) =>
        !bars.some(
          (b) =>
            b.code === c &&
            b.status === 'AGENT_OWNED' &&
            b.agentId === agentId &&
            !!b.weightGrams &&
            !!b.purityKarat,
        ),
    );
    if (invalid.length) {
      throw new ConflictException(
        `این کدها در موجودی ملکی شما نیستند: ${invalid.join('، ')}`,
      );
    }
    const reported = bars.filter((b) => b.incidentReports.length > 0);
    if (reported.length) {
      throw new ConflictException(
        `برای این شمش‌ها گزارش سرقت/مفقودی فعال ثبت شده است: ${reported.map((b) => b.code).join('، ')}`,
      );
    }
    return bars;
  }

  async create(agentId: string, actorId: string, dto: CreateBuybackOrderDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');
    if (agent.status === 'TERMINATED') {
      throw new ForbiddenException('همکاری این نماینده خاتمه یافته است');
    }
    if (dto.payoutMethod === 'BANK') {
      await this.funds.verifiedAccountOrThrow(agentId, dto.bankAccountId);
    }
    const q = await this.quote(agentId, dto.codes);
    const deliveryHours = await this.systemConfig.getNumber(
      'agent.buyback.delivery_hours',
      72,
    );

    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" IN (${Prisma.join(dto.codes)}) FOR UPDATE`;
      const locked = await tx.hologramCode.updateMany({
        where: {
          code: { in: dto.codes },
          status: 'AGENT_OWNED',
          agentId,
        },
        data: { status: 'BUYBACK_PENDING' },
      });
      if (locked.count !== dto.codes.length) {
        throw new ConflictException(
          'وضعیت برخی شمش‌ها هم‌زمان تغییر کرد؛ دوباره تلاش کنید',
        );
      }
      const bars = await tx.hologramCode.findMany({
        where: { code: { in: dto.codes } },
        select: { id: true, code: true },
      });
      const orderNumber = await this.sequence.next(tx, 'AGB');
      return tx.agentBuybackOrder.create({
        data: {
          orderNumber,
          agentId,
          payoutMethod: dto.payoutMethod,
          bankAccountId: dto.payoutMethod === 'BANK' ? dto.bankAccountId : null,
          totalWeightGrams: q.items
            .reduce((s, i) => s.plus(i.weightGrams), new Decimal(0))
            .toString(),
          quotedTotalRial: q.totalRial,
          deliveryDeadline: new Date(Date.now() + deliveryHours * 3_600_000),
          note: dto.note,
          createdById: actorId,
          items: {
            create: q.items.map((i) => ({
              hologramCodeId: bars.find((b) => b.code === i.code)?.id ?? '',
              code: i.code,
              weightGrams: i.weightGrams,
              purityKarat: i.purityKarat,
              pricePerGramRial: i.pricePerGramRial,
              quotedRial: i.amountRial,
            })),
          },
        },
      });
    }, TX_OPTIONS);
    return {
      message: `درخواست فروش ثبت و قیمت قفل شد؛ شمش‌ها را تا ${deliveryHours.toLocaleString('fa-IR')} ساعت آینده تحویل دهید`,
      order: await this.get(order.id, agentId),
    };
  }

  /** ثبت شماره صورتحساب الکترونیک نماینده به نام شرکت */
  async setAgentInvoice(
    agentId: string,
    orderId: string,
    dto: BuybackAgentInvoiceDto,
  ) {
    const res = await this.prisma.agentBuybackOrder.updateMany({
      where: {
        id: orderId,
        agentId,
        status: { in: ['PENDING_DELIVERY', 'RECEIVED', 'APPROVED'] },
      },
      data: {
        agentInvoiceNumber: dto.agentInvoiceNumber.trim(),
        agentInvoiceDate: new Date(dto.agentInvoiceDate),
      },
    });
    if (!res.count)
      throw new NotFoundException('سفارش یافت نشد یا تسویه شده است');
    return { message: 'مشخصات صورتحساب ثبت شد' };
  }

  async cancelByAgent(agentId: string, orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_buyback_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const o = await tx.agentBuybackOrder.findFirst({
        where: { id: orderId, agentId },
        include: { items: true },
      });
      if (!o) throw new NotFoundException('سفارش یافت نشد');
      if (o.status !== 'PENDING_DELIVERY') {
        throw new ConflictException(
          'پس از تحویل شمش به شرکت، لغو فقط از طریق واحد مالی ممکن است',
        );
      }
      await this.releaseBars(
        tx,
        o.agentId,
        o.items.map((i) => i.hologramCodeId),
      );
      await tx.agentBuybackOrder.update({
        where: { id: o.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }, TX_OPTIONS);
    return { message: 'درخواست فروش لغو و شمش‌ها به موجودی شما برگشت' };
  }

  private async releaseBars(
    tx: Prisma.TransactionClient,
    agentId: string,
    ids: string[],
  ) {
    if (!ids.length) return;
    await tx.hologramCode.updateMany({
      where: { id: { in: ids }, status: 'BUYBACK_PENDING', agentId },
      data: { status: 'AGENT_OWNED' },
    });
  }

  /** دریافت و بازرسی شمش‌ها توسط شرکت */
  async receive(orderId: string, adminId: string, dto: ReceiveBuybackDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_buyback_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const o = await tx.agentBuybackOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!o) throw new NotFoundException('سفارش یافت نشد');
      if (o.status !== 'PENDING_DELIVERY') {
        throw new ConflictException('این سفارش در انتظار دریافت نیست');
      }
      if (dto.items.length !== o.items.length) {
        throw new BadRequestException(
          'نتیجه‌ی بازرسی همه‌ی شمش‌ها را وارد کنید',
        );
      }
      let total = new Decimal(0);
      const rejectedIds: string[] = [];
      for (const item of o.items) {
        const r = dto.items.find((x) => x.code === item.code);
        if (!r) {
          throw new BadRequestException(
            `نتیجه‌ی بازرسی کد ${item.code} وارد نشده است`,
          );
        }
        const finalRial = r.accepted
          ? r.finalRial != null
            ? new Decimal(r.finalRial)
            : d(item.quotedRial)
          : new Decimal(0);
        if (r.accepted && finalRial.greaterThan(d(item.quotedRial))) {
          throw new BadRequestException(
            `مبلغ نهایی کد ${item.code} نمی‌تواند از مبلغ قفل‌شده بیشتر باشد`,
          );
        }
        if (!r.accepted) rejectedIds.push(item.hologramCodeId);
        total = total.plus(finalRial);
        await tx.agentBuybackItem.update({
          where: { id: item.id },
          data: {
            accepted: r.accepted,
            finalRial: finalRial.toFixed(0),
            note: r.note,
          },
        });
      }
      await this.releaseBars(tx, o.agentId, rejectedIds);
      const allRejected = rejectedIds.length === o.items.length;
      await tx.agentBuybackOrder.update({
        where: { id: o.id },
        data: {
          status: allRejected ? 'REJECTED' : 'RECEIVED',
          finalTotalRial: total.toFixed(0),
          receivedAt: new Date(),
          receivedById: adminId,
          inspectionNote: dto.inspectionNote,
          rejectionReason: allRejected
            ? (dto.inspectionNote ?? 'ردشده در بازرسی')
            : null,
        },
      });
      return {
        message: allRejected
          ? 'همه‌ی شمش‌ها در بازرسی رد و به موجودی نماینده برگشت'
          : `دریافت ثبت شد؛ مبلغ نهایی ${toman(total)} تومان`,
      };
    }, TX_OPTIONS);
  }

  async approve(orderId: string, adminId: string) {
    const requireInvoice = await this.systemConfig.getBoolean(
      'agent.buyback.require_agent_invoice',
      true,
    );
    const o = await this.prisma.agentBuybackOrder.findUnique({
      where: { id: orderId },
    });
    if (!o) throw new NotFoundException('سفارش یافت نشد');
    if (o.status !== 'RECEIVED') {
      throw new ConflictException('فقط سفارش دریافت‌شده قابل تأیید است');
    }
    if (requireInvoice && !o.agentInvoiceNumber) {
      throw new ConflictException(
        'نماینده هنوز شماره صورتحساب الکترونیک فروش به شرکت را ثبت نکرده است',
      );
    }
    await this.prisma.agentBuybackOrder.update({
      where: { id: o.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: adminId,
      },
    });
    return { message: 'خرید تأیید شد و آماده‌ی تسویه است' };
  }

  /**
   * تسویه: ورود شمش‌های پذیرفته‌شده به خزانه با بهای خرید، حواله‌ی ورود و پرداخت به
   * کیف پول یا حساب بانکی تأییدشده‌ی نماینده.
   */
  async pay(orderId: string, adminId: string, bankReference?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_buyback_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const o = await tx.agentBuybackOrder.findUnique({
        where: { id: orderId },
        include: { items: true, agent: true },
      });
      if (!o) throw new NotFoundException('سفارش یافت نشد');
      if (o.status !== 'APPROVED') {
        throw new ConflictException('فقط سفارش تأییدشده قابل تسویه است');
      }
      const toWallet = o.payoutMethod !== 'BANK';
      if (!toWallet && (!bankReference || bankReference.trim().length < 4)) {
        throw new BadRequestException('شماره پیگیری پرداخت بانکی را وارد کنید');
      }
      const accepted = o.items.filter((i) => i.accepted);
      const amount = accepted.reduce(
        (s, i) => s.plus(d(i.finalRial ?? i.quotedRial)),
        new Decimal(0),
      );
      const grams = accepted.reduce(
        (s, i) => s.plus(d(i.weightGrams)),
        new Decimal(0),
      );
      const ids = accepted.map((i) => i.hologramCodeId);

      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" IN (${Prisma.join(
        ids.map((id) => Prisma.sql`${id}::uuid`),
      )}) FOR UPDATE`;
      const moved = await tx.hologramCode.updateMany({
        where: {
          id: { in: ids },
          status: 'BUYBACK_PENDING',
          agentId: o.agentId,
        },
        data: {
          status: 'UNASSIGNED',
          agentId: null,
          agentAllocatedAt: null,
          agentPremiumRial: null,
        },
      });
      if (moved.count !== ids.length) {
        throw new ConflictException(
          'وضعیت شمش‌های این سفارش با انتظار نمی‌خواند',
        );
      }

      const journal = await this.agentAccounting.journalBuyback(tx, {
        agentTag: agentTag(o.agent.code),
        orderNumber: o.orderNumber,
        amountRial: amount,
        grams,
        toWallet,
      });
      const voucherNumber = await this.sequence.next(tx, 'AGV');
      await tx.agentStockMovement.createMany({
        data: accepted.map((i) => ({
          voucherNumber,
          agentId: o.agentId,
          hologramCodeId: i.hologramCodeId,
          type: 'BUYBACK' as const,
          weightGrams: i.weightGrams,
          referenceId: o.id,
          journalEntryId: journal.id,
          performedByAdminId: adminId,
          note: `خرید شمش از نماینده — ${o.orderNumber}`,
        })),
      });
      if (toWallet && amount.greaterThan(0)) {
        await this.wallet.post(tx, {
          agentId: o.agentId,
          type: 'BUYBACK',
          creditRial: amount,
          description: `فروش ${accepted.length.toLocaleString('fa-IR')} شمش به شرکت — ${o.orderNumber}`,
          referenceType: 'AGENT_BUYBACK',
          referenceId: o.id,
          referenceNumber: o.orderNumber,
          journalEntryId: journal.id,
          createdByAdminId: adminId,
        });
      }
      await tx.agentBuybackOrder.update({
        where: { id: o.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidById: adminId,
          bankReference: bankReference?.trim() ?? null,
          journalEntryId: journal.id,
          voucherNumber,
          finalTotalRial: amount.toFixed(0),
        },
      });
      return { o, amount };
    }, TX_OPTIONS);

    void this.sms
      .send(
        'AGENT_BUYBACK_PAID',
        result.o.agent.phone,
        {
          agentName: result.o.agent.name,
          amount: toman(result.amount),
          requestNumber: result.o.orderNumber,
        },
        { referenceType: 'AGENT_BUYBACK', referenceId: result.o.id },
      )
      .catch(() => undefined);
    return { message: 'تسویه انجام شد و شمش‌ها وارد موجودی خزانه شدند' };
  }

  /** رد/لغو توسط مدیریت پیش از تسویه — شمش‌ها به موجودی ملکی نماینده برمی‌گردند */
  async reject(orderId: string, reason: string, adminId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_buyback_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const o = await tx.agentBuybackOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!o) throw new NotFoundException('سفارش یافت نشد');
      if (!['PENDING_DELIVERY', 'RECEIVED', 'APPROVED'].includes(o.status)) {
        throw new ConflictException('این سفارش قابل رد نیست');
      }
      await this.releaseBars(
        tx,
        o.agentId,
        o.items.map((i) => i.hologramCodeId),
      );
      await tx.agentBuybackOrder.update({
        where: { id: o.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          approvedById: adminId,
        },
      });
    }, TX_OPTIONS);
    return { message: 'درخواست رد شد و شمش‌ها به موجودی نماینده برگشت' };
  }

  /** درخواست‌هایی که شمش آن‌ها در مهلت تحویل نشد لغو و شمش‌ها آزاد می‌شوند */
  @Cron('23 * * * *', { name: 'expire-agent-buyback-orders' })
  async expireOverdue() {
    try {
      const rows = await this.prisma.agentBuybackOrder.findMany({
        where: {
          status: 'PENDING_DELIVERY',
          deliveryDeadline: { lt: new Date() },
        },
        include: { items: true },
        take: 100,
      });
      for (const o of rows) {
        await this.prisma.$transaction(async (tx) => {
          const res = await tx.agentBuybackOrder.updateMany({
            where: { id: o.id, status: 'PENDING_DELIVERY' },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              rejectionReason: 'عدم تحویل شمش در مهلت مقرر',
            },
          });
          if (res.count) {
            await this.releaseBars(
              tx,
              o.agentId,
              o.items.map((i) => i.hologramCodeId),
            );
          }
        });
      }
    } catch (err) {
      this.logger.error(
        `[AgentBuyback] منقضی‌سازی ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  async list(agentScope: string | null, query: TradingListQueryDto) {
    const agentId = agentScope ?? query.agentId;
    const range = dateRange(query.from, query.to);
    const where: Prisma.AgentBuybackOrderWhereInput = {
      ...(agentId ? { agentId } : {}),
      ...(query.status
        ? {
            status:
              query.status as Prisma.EnumAgentBuybackStatusFilter['equals'],
          }
        : {}),
      ...(range ? { createdAt: range } : {}),
      ...(query.search
        ? { orderNumber: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.agentBuybackOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.agentBuybackOrder.count({ where }),
    ]);
    return {
      data: items.map((o) => ({
        ...o,
        statusLabel: BUYBACK_STATUS_FA[o.status] ?? o.status,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async get(orderId: string, agentScope?: string) {
    const o = await this.prisma.agentBuybackOrder.findUnique({
      where: { id: orderId },
      include: {
        agent: { select: { id: true, code: true, name: true, phone: true } },
        items: true,
        bankAccount: {
          select: { bankName: true, sheba: true, ownerName: true },
        },
      },
    });
    if (!o || (agentScope && o.agentId !== agentScope)) {
      throw new NotFoundException('سفارش یافت نشد');
    }
    return { ...o, statusLabel: BUYBACK_STATUS_FA[o.status] ?? o.status };
  }
}
