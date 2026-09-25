// api/src/partners/partners.service.ts
//
// تعریف شرکای فروش (اسنپ‌پی، دیجی‌پی، اپ‌های همکار)، قرارداد و کارمزد، کلید API،
// صورتحساب و گزارش عملکرد/مطالبات.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PartyLedgerService } from '../accounting/party-ledger.service';
import { toDecimal } from '../accounting/accounting.service';
import { INSTALLMENT_PROVIDERS } from './providers/not-configured.provider';
import {
  ListPartnersQueryDto,
  PartnerDto,
  PartnerReportQueryDto,
  StatementQueryDto,
} from './partners.dto';

const s = (v: Decimal | Prisma.Decimal | null | undefined) =>
  v == null ? '0' : v.toString();

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partyLedger: PartyLedgerService,
  ) {}

  providers() {
    return INSTALLMENT_PROVIDERS.map((p) => ({
      key: p.key,
      displayName: p.displayName,
      configured: p.isConfigured(),
    }));
  }

  private async nextCode(): Promise<string> {
    const last = await this.prisma.salesPartner.findFirst({
      where: { code: { startsWith: 'PTR-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const n = last ? Number(last.code.replace('PTR-', '')) || 0 : 0;
    return `PTR-${String(n + 1).padStart(4, '0')}`;
  }

  private data(dto: Partial<PartnerDto>) {
    const pct =
      dto.commissionPercent != null ? new Decimal(dto.commissionPercent) : null;
    if (pct && (pct.isNegative() || pct.gt(30))) {
      throw new BadRequestException('کارمزد شریک باید بین ۰ تا ۳۰ درصد باشد');
    }
    return {
      name: dto.name?.trim(),
      kind: dto.kind,
      providerKey: dto.providerKey,
      status: dto.status,
      commissionPercent: dto.commissionPercent,
      commissionFixedRial: dto.commissionFixedRial,
      settlementDays: dto.settlementDays,
      creditLimitRial: dto.creditLimitRial,
      minOrderRial: dto.minOrderRial,
      maxOrderRial: dto.maxOrderRial,
      allowedProducts: dto.allowedProducts,
      contractNumber: dto.contractNumber,
      contractStartAt: dto.contractStartAt
        ? new Date(dto.contractStartAt)
        : undefined,
      contractEndAt: dto.contractEndAt
        ? new Date(dto.contractEndAt)
        : undefined,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      email: dto.email,
      website: dto.website,
      iban: dto.iban,
      nationalId: dto.nationalId,
      economicCode: dto.economicCode,
      notes: dto.notes,
      apiEnabled: dto.apiEnabled,
      apiIpWhitelist: dto.apiIpWhitelist,
      webhookUrl: dto.webhookUrl,
    };
  }

  async create(adminId: string, dto: PartnerDto) {
    const code = await this.nextCode();
    const p = await this.prisma.salesPartner.create({
      data: {
        ...this.data(dto),
        name: dto.name.trim(),
        code,
        createdByAdminId: adminId,
      },
    });
    return { message: 'شریک فروش تعریف شد', id: p.id, code };
  }

  async update(id: string, dto: Partial<PartnerDto>) {
    await this.getOrThrow(id);
    await this.prisma.salesPartner.update({
      where: { id },
      data: this.data(dto),
    });
    return { message: 'اطلاعات شریک به‌روزرسانی شد' };
  }

  async getOrThrow(id: string) {
    const p = await this.prisma.salesPartner.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('شریک فروش یافت نشد');
    return p;
  }

  /** کلید API جدید — فقط یک‌بار نمایش داده می‌شود و کلید قبلی باطل می‌شود */
  async rotateApiKey(id: string) {
    const p = await this.getOrThrow(id);
    const key = `agk_${p.code.replace('-', '').toLowerCase()}_${randomBytes(24).toString('hex')}`;
    await this.prisma.salesPartner.update({
      where: { id },
      data: {
        apiKeyHash: hashApiKey(key),
        apiKeyPrefix: key.slice(0, 14),
        apiEnabled: true,
      },
    });
    return {
      message:
        'کلید API جدید ساخته شد؛ آن را همین حالا در جای امن ذخیره کنید — دوباره نمایش داده نمی‌شود',
      apiKey: key,
    };
  }

  async revokeApiKey(id: string) {
    await this.getOrThrow(id);
    await this.prisma.salesPartner.update({
      where: { id },
      data: { apiKeyHash: null, apiKeyPrefix: null, apiEnabled: false },
    });
    return { message: 'کلید API باطل شد' };
  }

  private view(p: Prisma.SalesPartnerGetPayload<object>) {
    const { apiKeyHash, ...rest } = p;
    return {
      ...rest,
      hasApiKey: !!apiKeyHash,
      commissionPercent: p.commissionPercent.toString(),
      commissionFixedRial: p.commissionFixedRial.toString(),
      creditLimitRial: p.creditLimitRial?.toString() ?? null,
      minOrderRial: p.minOrderRial?.toString() ?? null,
      maxOrderRial: p.maxOrderRial?.toString() ?? null,
      balanceRial: p.balanceRial.toString(),
      contractStartAt: p.contractStartAt?.toISOString() ?? null,
      contractEndAt: p.contractEndAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async list(query: ListPartnersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.SalesPartnerWhereInput = {};
    if (query.status) where.status = query.status as never;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.salesPartner.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesPartner.count({ where }),
    ]);
    const now = new Date();
    const [open, overdue, sold] = await Promise.all([
      this.prisma.partnerOrder.groupBy({
        by: ['partnerId'],
        where: {
          partnerId: { in: rows.map((r) => r.id) },
          status: 'CONFIRMED',
        },
        _sum: { netReceivableRial: true },
        _count: true,
      }),
      this.prisma.partnerOrder.groupBy({
        by: ['partnerId'],
        where: {
          partnerId: { in: rows.map((r) => r.id) },
          status: 'CONFIRMED',
          dueDate: { lt: now },
        },
        _sum: { netReceivableRial: true },
        _count: true,
      }),
      this.prisma.partnerOrder.groupBy({
        by: ['partnerId'],
        where: {
          partnerId: { in: rows.map((r) => r.id) },
          status: { in: ['CONFIRMED', 'SETTLED'] },
        },
        _sum: { totalRial: true, amountGrams: true, commissionRial: true },
        _count: true,
      }),
    ]);
    return {
      data: rows.map((r) => {
        const o = open.find((x) => x.partnerId === r.id);
        const od = overdue.find((x) => x.partnerId === r.id);
        const so = sold.find((x) => x.partnerId === r.id);
        return {
          ...this.view(r),
          openOrders: o?._count ?? 0,
          openReceivableRial: s(o?._sum.netReceivableRial),
          overdueOrders: od?._count ?? 0,
          overdueRial: s(od?._sum.netReceivableRial),
          soldOrders: so?._count ?? 0,
          soldRial: s(so?._sum.totalRial),
          soldGrams: s(so?._sum.amountGrams),
          commissionRial: s(so?._sum.commissionRial),
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async detail(id: string) {
    const p = await this.getOrThrow(id);
    return this.view(p);
  }

  async statement(id: string, query: StatementQueryDto) {
    const p = await this.getOrThrow(id);
    const st = await this.partyLedger.statement(
      this.prisma,
      'PARTNER',
      id,
      query,
    );
    return { partner: this.view(p), ...st };
  }

  /** گزارش عملکرد شرکا در بازه + سنی مطالبات (Aging) */
  async report(query: PartnerReportQueryDto) {
    const range: Prisma.DateTimeFilter = {};
    if (query.from) range.gte = new Date(query.from);
    if (query.to) {
      const e = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) e.setHours(23, 59, 59, 999);
      range.lte = e;
    }
    const hasRange = !!(query.from || query.to);
    const [partners, sales, refunds, settlements, openOrders] =
      await Promise.all([
        this.prisma.salesPartner.findMany({ orderBy: { code: 'asc' } }),
        this.prisma.partnerOrder.groupBy({
          by: ['partnerId', 'productKind'],
          where: {
            status: { in: ['CONFIRMED', 'SETTLED'] },
            ...(hasRange ? { confirmedAt: range } : {}),
          },
          _sum: {
            amountGrams: true,
            totalRial: true,
            commissionRial: true,
            netReceivableRial: true,
          },
          _count: true,
        }),
        this.prisma.partnerOrder.groupBy({
          by: ['partnerId'],
          where: {
            status: 'REFUNDED',
            ...(hasRange ? { refundedAt: range } : {}),
          },
          _sum: { totalRial: true },
          _count: true,
        }),
        this.prisma.partnerSettlement.groupBy({
          by: ['partnerId'],
          where: hasRange ? { paidAt: range } : {},
          _sum: { amountRial: true },
          _count: true,
        }),
        this.prisma.partnerOrder.findMany({
          where: { status: 'CONFIRMED' },
          select: { partnerId: true, dueDate: true, netReceivableRial: true },
        }),
      ]);

    // سنی مطالبات: جاری (سررسیدنشده)، ۱-۷، ۸-۳۰، بیش از ۳۰ روز گذشته از سررسید
    const now = Date.now();
    const aging = (pid: string) => {
      const b = {
        current: new Decimal(0),
        d7: new Decimal(0),
        d30: new Decimal(0),
        over30: new Decimal(0),
      };
      for (const o of openOrders.filter((x) => x.partnerId === pid)) {
        const late = o.dueDate ? (now - o.dueDate.getTime()) / 86400_000 : -1;
        const v = toDecimal(o.netReceivableRial);
        if (late <= 0) b.current = b.current.plus(v);
        else if (late <= 7) b.d7 = b.d7.plus(v);
        else if (late <= 30) b.d30 = b.d30.plus(v);
        else b.over30 = b.over30.plus(v);
      }
      return Object.fromEntries(
        Object.entries(b).map(([k, v]) => [k, v.toString()]),
      );
    };

    return {
      period: hasRange
        ? { from: query.from ?? null, to: query.to ?? null }
        : null,
      data: partners.map((p) => {
        const byKind = (k: string) =>
          sales.find((x) => x.partnerId === p.id && x.productKind === k);
        const m = byKind('MELTED_GOLD');
        const b = byKind('BULLION');
        const r = refunds.find((x) => x.partnerId === p.id);
        const st = settlements.find((x) => x.partnerId === p.id);
        const totalSales = toDecimal(m?._sum.totalRial).plus(
          toDecimal(b?._sum.totalRial),
        );
        return {
          partnerId: p.id,
          code: p.code,
          name: p.name,
          kind: p.kind,
          status: p.status,
          meltedGold: {
            count: m?._count ?? 0,
            grams: s(m?._sum.amountGrams),
            totalRial: s(m?._sum.totalRial),
          },
          bullion: {
            count: b?._count ?? 0,
            grams: s(b?._sum.amountGrams),
            totalRial: s(b?._sum.totalRial),
          },
          totalSalesRial: totalSales.toString(),
          commissionRial: toDecimal(m?._sum.commissionRial)
            .plus(toDecimal(b?._sum.commissionRial))
            .toString(),
          refunds: { count: r?._count ?? 0, totalRial: s(r?._sum.totalRial) },
          settlements: {
            count: st?._count ?? 0,
            amountRial: s(st?._sum.amountRial),
          },
          balanceRial: p.balanceRial.toString(),
          aging: aging(p.id),
        };
      }),
    };
  }
}
