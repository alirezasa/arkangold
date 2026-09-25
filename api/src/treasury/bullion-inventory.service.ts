// api/src/treasury/bullion-inventory.service.ts
//
// گزارش لحظه‌ای موجودی شمش — هر شمش با کد هولوگرام در یکی از این «سبدها» است:
//   BLANK            کد خام: تولید/چاپ‌شده، هنوز به شمشی متصل نشده (UNASSIGNED بدون وزن)
//   VAULT_CODED      شمش کددار در خزانه: کد به شمش فیزیکی متصل شده ولی فروخته/امانی نشده
//   AT_AGENT         امانی نزد نماینده
//   TRANSFER_PENDING فروخته‌شده و منتظر تأیید گیرنده (خرید برای دیگری)
//   SOLD             فروخته‌شده و دارای مالک فعال (کانال: فروشگاه / نماینده / شریک)
//   REVOKED          کد باطل‌شده
// به‌علاوه:
//   AWAITING_CODE    ردیف‌های سفارش پرداخت‌شده‌ی فروشگاه که هنوز کد نگرفته‌اند (باید ارسال شوند)
//   موجودی فروشگاه   تعداد قابل فروش تنوع‌های محصول (بدون کد) در کاتالوگ

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDecimal } from '../accounting/accounting.service';
import { ACC } from '../accounting/accounts.seed';
import {
  BullionItemsQueryDto,
  BullionQueryDto,
  CodeBarsDto,
} from './treasury.dto';

const s = (v: Decimal | Prisma.Decimal | null | undefined) =>
  v == null ? '0' : v.toString();

const PAID_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;

function bucketWhere(bucket: string): Prisma.HologramCodeWhereInput {
  switch (bucket) {
    case 'BLANK':
      return { status: 'UNASSIGNED', weightGrams: null };
    case 'VAULT_CODED':
      return { status: 'UNASSIGNED', weightGrams: { not: null } };
    case 'AT_AGENT':
      return { status: 'AT_AGENT' };
    case 'TRANSFER_PENDING':
      return { status: 'TRANSFER_PENDING' };
    case 'SOLD':
      return { status: 'ASSIGNED' };
    case 'REVOKED':
      return { status: 'REVOKED' };
    default:
      throw new BadRequestException('دسته‌ی موجودی نامعتبر است');
  }
}

function dateRange(from?: string, to?: string) {
  const r: { gte?: Date; lte?: Date } = {};
  if (from) r.gte = new Date(from);
  if (to) {
    const e = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) e.setHours(23, 59, 59, 999);
    r.lte = e;
  }
  return r;
}

@Injectable()
export class BullionInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: BullionQueryDto) {
    const range = dateRange(query.from, query.to);
    const hasRange = !!(query.from || query.to);

    const [
      statusGroups,
      blank,
      vaultCoded,
      byAgentRaw,
      productGroups,
      variants,
      awaiting,
      ledger,
      batches,
      shopSales,
      agentSales,
      partnerSales,
    ] = await Promise.all([
      this.prisma.hologramCode.groupBy({
        by: ['status'],
        _count: true,
        _sum: { weightGrams: true },
      }),
      this.prisma.hologramCode.count({ where: bucketWhere('BLANK') }),
      this.prisma.hologramCode.aggregate({
        where: bucketWhere('VAULT_CODED'),
        _count: true,
        _sum: { weightGrams: true },
      }),
      this.prisma.hologramCode.groupBy({
        by: ['agentId'],
        where: { status: 'AT_AGENT' },
        _count: true,
        _sum: { weightGrams: true },
      }),
      this.prisma.hologramCode.groupBy({
        by: ['productId', 'weightGrams', 'purityKarat', 'status'],
        where: { weightGrams: { not: null }, status: { not: 'REVOKED' } },
        _count: true,
      }),
      this.prisma.productVariant.findMany({
        where: { product: { purityKarat: { not: null } } },
        select: {
          id: true,
          sku: true,
          weightGrams: true,
          stockQuantity: true,
          product: { select: { id: true, name: true, purityKarat: true } },
        },
      }),
      this.awaitingCodeItems(1, 50000),
      this.prisma.account.findMany({
        where: {
          code: { in: [ACC.BULLION, ACC.CONSIGNMENT, ACC.BAR_COGS, '5050'] },
        },
        select: {
          code: true,
          name: true,
          balanceGrams: true,
          balanceRial: true,
        },
      }),
      this.prisma.hologramBatch.aggregate({
        _count: true,
        _sum: { quantity: true },
      }),
      // فروش فروشگاه (شمش‌های دارای عیار) در بازه
      this.prisma.shopOrderItem.findMany({
        where: {
          product: { purityKarat: { not: null } },
          order: {
            status: { in: [...PAID_STATUSES] },
            ...(hasRange ? { createdAt: range } : {}),
          },
        },
        select: {
          quantity: true,
          priceRial: true,
          selectedWeightGrams: true,
          variant: { select: { weightGrams: true } },
        },
      }),
      this.prisma.agentSale.aggregate({
        where: {
          status: 'COMPLETED',
          ...(hasRange ? { createdAt: range } : {}),
        },
        _count: true,
        _sum: { weightGrams: true, totalRial: true },
      }),
      this.prisma.partnerOrder.aggregate({
        where: {
          productKind: 'BULLION',
          status: { in: ['CONFIRMED', 'SETTLED'] },
          ...(hasRange ? { confirmedAt: range } : {}),
        },
        _count: true,
        _sum: { amountGrams: true, totalRial: true },
      }),
    ]);

    const st = (k: string) => statusGroups.find((g) => g.status === k);

    const agents = await this.prisma.agent.findMany({
      where: { id: { in: byAgentRaw.map((a) => a.agentId).filter(Boolean) } },
      select: { id: true, code: true, name: true, city: true },
    });

    // ── تفکیک محصول/وزن ──
    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: [
            ...new Set(productGroups.map((g) => g.productId).filter(Boolean)),
          ],
        },
      },
      select: { id: true, name: true },
    });
    const pName = (id: string | null) =>
      id ? (products.find((p) => p.id === id)?.name ?? '—') : 'بدون محصول';
    const byProductMap = new Map<
      string,
      {
        productId: string | null;
        productName: string;
        weightGrams: string;
        purityKarat: string | null;
        vaultCoded: number;
        atAgent: number;
        transferPending: number;
        sold: number;
      }
    >();
    for (const g of productGroups) {
      const key = `${g.productId}|${s(g.weightGrams)}|${g.purityKarat}`;
      if (!byProductMap.has(key)) {
        byProductMap.set(key, {
          productId: g.productId,
          productName: pName(g.productId),
          weightGrams: s(g.weightGrams),
          purityKarat: g.purityKarat,
          vaultCoded: 0,
          atAgent: 0,
          transferPending: 0,
          sold: 0,
        });
      }
      const r = byProductMap.get(key);
      if (g.status === 'UNASSIGNED') r.vaultCoded += g._count;
      if (g.status === 'AT_AGENT') r.atAgent += g._count;
      if (g.status === 'TRANSFER_PENDING') r.transferPending += g._count;
      if (g.status === 'ASSIGNED') r.sold += g._count;
    }

    const shopStock = variants.reduce(
      (t, v) => ({
        units: t.units + Math.max(0, v.stockQuantity),
        grams: t.grams.plus(
          toDecimal(v.weightGrams).times(Math.max(0, v.stockQuantity)),
        ),
      }),
      { units: 0, grams: new Decimal(0) },
    );

    const shopSold = shopSales.reduce(
      (t, i) => ({
        count: t.count + i.quantity,
        grams: t.grams.plus(
          toDecimal(i.selectedWeightGrams ?? i.variant?.weightGrams).times(
            i.quantity,
          ),
        ),
        rial: t.rial.plus(toDecimal(i.priceRial).times(i.quantity)),
      }),
      { count: 0, grams: new Decimal(0), rial: new Decimal(0) },
    );

    const acc = (c: string) => ledger.find((l) => l.code === c);
    const vaultCodedGrams = toDecimal(vaultCoded._sum.weightGrams);
    const atAgentGrams = toDecimal(st('AT_AGENT')?._sum.weightGrams);

    return {
      generatedAt: new Date().toISOString(),
      period: hasRange
        ? { from: query.from ?? null, to: query.to ?? null }
        : null,
      codes: {
        batches: batches._count,
        generated: batches._sum.quantity ?? 0,
        blank,
        used:
          (batches._sum.quantity ?? 0) - blank - (st('REVOKED')?._count ?? 0),
        revoked: st('REVOKED')?._count ?? 0,
      },
      totals: {
        vaultCoded: { count: vaultCoded._count, grams: s(vaultCodedGrams) },
        atAgents: {
          count: st('AT_AGENT')?._count ?? 0,
          grams: s(atAgentGrams),
        },
        transferPending: {
          count: st('TRANSFER_PENDING')?._count ?? 0,
          grams: s(st('TRANSFER_PENDING')?._sum.weightGrams),
        },
        soldWithOwner: {
          count: st('ASSIGNED')?._count ?? 0,
          grams: s(st('ASSIGNED')?._sum.weightGrams),
        },
        awaitingCode: awaiting.totals,
        shopStock: { units: shopStock.units, grams: s(shopStock.grams) },
        companyOwned: {
          // شمش‌های متعلق به شرکت: کددار خزانه + امانی نمایندگان + موجودی بدون کد فروشگاه
          grams: s(vaultCodedGrams.plus(atAgentGrams).plus(shopStock.grams)),
        },
      },
      byAgent: byAgentRaw
        .map((a) => {
          const ag = agents.find((x) => x.id === a.agentId);
          return {
            agentId: a.agentId,
            code: ag?.code ?? '—',
            name: ag?.name ?? '—',
            city: ag?.city ?? null,
            count: a._count,
            grams: s(a._sum.weightGrams),
          };
        })
        .sort((a, b) => b.count - a.count),
      byProduct: [...byProductMap.values()].sort((a, b) =>
        a.productName === b.productName
          ? Number(a.weightGrams) - Number(b.weightGrams)
          : a.productName.localeCompare(b.productName, 'fa'),
      ),
      shopStockByVariant: variants
        .filter((v) => v.stockQuantity > 0)
        .map((v) => ({
          variantId: v.id,
          sku: v.sku,
          productName: v.product.name,
          purityKarat: v.product.purityKarat,
          weightGrams: v.weightGrams.toString(),
          units: v.stockQuantity,
        })),
      sales: {
        shop: {
          count: shopSold.count,
          grams: s(shopSold.grams),
          rial: s(shopSold.rial),
        },
        agents: {
          count: agentSales._count,
          grams: s(agentSales._sum.weightGrams),
          rial: s(agentSales._sum.totalRial),
        },
        partners: {
          count: partnerSales._count,
          grams: s(partnerSales._sum.amountGrams),
          rial: s(partnerSales._sum.totalRial),
        },
      },
      ledger: {
        vaultBullion: {
          grams: s(acc(ACC.BULLION)?.balanceGrams),
          costRial: s(acc(ACC.BULLION)?.balanceRial),
        },
        consignment: {
          grams: s(acc(ACC.CONSIGNMENT)?.balanceGrams),
          costRial: s(acc(ACC.CONSIGNMENT)?.balanceRial),
          physicalGrams: s(atAgentGrams),
          differenceGrams: s(
            toDecimal(acc(ACC.CONSIGNMENT)?.balanceGrams).minus(atAgentGrams),
          ),
        },
        soldCogs: {
          shopAndPartnersGrams: s(acc(ACC.BAR_COGS)?.balanceGrams),
          shopAndPartnersRial: s(acc(ACC.BAR_COGS)?.balanceRial),
          agentsGrams: s(acc('5050')?.balanceGrams),
          agentsRial: s(acc('5050')?.balanceRial),
        },
      },
    };
  }

  /** ردیف‌های سفارش پرداخت‌شده‌ی شمش که هنوز کد هولوگرام نگرفته‌اند */
  private async awaitingCodeItems(page = 1, limit = 1000) {
    const where: Prisma.ShopOrderItemWhereInput = {
      hologramCode: null,
      product: { purityKarat: { not: null } },
      order: { status: { in: [...PAID_STATUSES] } },
    };
    const [rows, total] = await Promise.all([
      this.prisma.shopOrderItem.findMany({
        where,
        select: {
          id: true,
          quantity: true,
          selectedWeightGrams: true,
          createdAt: true,
          variant: { select: { weightGrams: true } },
          product: { select: { name: true, purityKarat: true } },
          order: {
            select: { id: true, status: true, createdAt: true, userId: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shopOrderItem.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      orderId: r.order.id,
      orderStatus: r.order.status,
      productName: r.product?.name ?? '—',
      purityKarat: r.product?.purityKarat ?? null,
      weightGrams: s(r.selectedWeightGrams ?? r.variant?.weightGrams),
      quantity: r.quantity,
      createdAt: r.order.createdAt.toISOString(),
    }));
    const totals = rows.reduce(
      (t, r) => ({
        count: t.count + r.quantity,
        grams: t.grams.plus(
          toDecimal(r.selectedWeightGrams ?? r.variant?.weightGrams).times(
            r.quantity,
          ),
        ),
      }),
      { count: 0, grams: new Decimal(0) },
    );
    return {
      items,
      total,
      totals: {
        count: totals.count,
        grams: totals.grams.toString(),
        rows: total,
      },
    };
  }

  async items(query: BullionItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    if (query.bucket === 'AWAITING_CODE') {
      const r = await this.awaitingCodeItems(page, limit);
      return {
        data: r.items,
        page,
        limit,
        total: r.total,
        totalPages: Math.max(1, Math.ceil(r.total / limit)),
      };
    }
    const where: Prisma.HologramCodeWhereInput = {
      ...bucketWhere(query.bucket),
    };
    if (query.agentId) where.agentId = query.agentId;
    if (query.productId) where.productId = query.productId;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search } },
        {
          factorySerialNumber: { contains: query.search, mode: 'insensitive' },
        },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hologramCode.findMany({
        where,
        include: {
          product: { select: { name: true } },
          agent: { select: { code: true, name: true } },
          batch: { select: { batchNumber: true } },
          ownerships: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: { fullName: true, shopOrderId: true, createdAt: true },
          },
          agentSales: {
            where: { status: 'COMPLETED' },
            take: 1,
            select: { saleNumber: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.hologramCode.count({ where }),
    ]);
    const partnerOrders = await this.prisma.partnerOrder.findMany({
      where: { hologramCodeId: { in: rows.map((r) => r.id) } },
      select: {
        hologramCodeId: true,
        orderNumber: true,
        partner: { select: { name: true } },
      },
    });
    return {
      data: rows.map((r) => {
        const po = partnerOrders.find((p) => p.hologramCodeId === r.id);
        const owner = r.ownerships[0];
        const channel = r.agentSales[0]
          ? 'AGENT'
          : po
            ? 'PARTNER'
            : r.shopOrderItemId
              ? 'SHOP'
              : owner
                ? 'OTHER'
                : null;
        return {
          id: r.id,
          code: r.code,
          status: r.status,
          batchNumber: r.batch.batchNumber,
          productName: r.product?.name ?? null,
          weightGrams: r.weightGrams?.toString() ?? null,
          purityKarat: r.purityKarat,
          factorySerialNumber: r.factorySerialNumber,
          mintedAt: r.mintedAt?.toISOString() ?? null,
          vaultCodedAt: r.vaultCodedAt?.toISOString() ?? null,
          agent: r.agent,
          agentAllocatedAt: r.agentAllocatedAt?.toISOString() ?? null,
          ownerName: owner?.fullName ?? null,
          soldChannel: channel,
          reference:
            r.agentSales[0]?.saleNumber ??
            (po ? `${po.orderNumber} (${po.partner.name})` : null) ??
            owner?.shopOrderId ??
            null,
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * کدگذاری شمش‌های خزانه: اتصال کد خام به شمش فیزیکی (وزن، عیار، محصول، سریال).
   * وضعیت کد UNASSIGNED می‌ماند تا برای فروش فروشگاه، تحویل امانی یا فروش شریک آماده باشد.
   * اثر حسابداری ندارد (شمش قبلاً در موجودی 1025 است).
   */
  async codeBars(dto: CodeBarsDto) {
    const codes = dto.items.map((i) => i.code);
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) throw new BadRequestException(`کد ${dup} تکراری است`);
    for (const i of dto.items) {
      const w = new Decimal(i.weightGrams);
      if (w.lte(0) || w.decimalPlaces() > 4) {
        throw new BadRequestException(`وزن کد ${i.code} نامعتبر است`);
      }
    }
    const productIds = [
      ...new Set(dto.items.map((i) => i.productId).filter(Boolean)),
    ] as string[];
    if (productIds.length) {
      const found = await this.prisma.product.count({
        where: { id: { in: productIds } },
      });
      if (found !== productIds.length) {
        throw new BadRequestException('برخی محصولات انتخاب‌شده یافت نشدند');
      }
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" IN (${Prisma.join(codes)}) FOR UPDATE`;
        const rows = await tx.hologramCode.findMany({
          where: { code: { in: codes } },
          include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
        });
        const missing = codes.filter((c) => !rows.some((r) => r.code === c));
        if (missing.length) {
          throw new BadRequestException(
            `کد(های) یافت نشد: ${missing.join('، ')}`,
          );
        }
        const bad = rows.filter(
          (r) =>
            r.status !== 'UNASSIGNED' ||
            r.shopOrderItemId !== null ||
            r.ownerships.length > 0,
        );
        if (bad.length) {
          throw new ConflictException(
            `این کدها آزاد نیستند (فروخته‌شده، امانی یا باطل): ${bad.map((r) => r.code).join('، ')}`,
          );
        }
        const now = new Date();
        const values = dto.items.map(
          (i) => Prisma.sql`(
            ${i.code}::text,
            ${new Decimal(i.weightGrams).toString()}::numeric,
            ${i.purityKarat}::text,
            ${i.factorySerialNumber ?? null}::text,
            ${i.mintedAt ? new Date(i.mintedAt) : null}::timestamp,
            ${i.productId ?? null}::uuid
          )`,
        );
        const updated = await tx.$executeRaw`
          UPDATE "hologram_codes" AS h SET
            "weight_grams" = v.weight,
            "purity_karat" = v.purity::"GoldPurityKarat",
            "factory_serial_number" = COALESCE(v.serial, h."factory_serial_number"),
            "minted_at" = COALESCE(v.minted, h."minted_at"),
            "product_id" = COALESCE(v.product, h."product_id"),
            "vault_coded_at" = ${now},
            "updated_at" = ${now}
          FROM (VALUES ${Prisma.join(values)})
            AS v(code, weight, purity, serial, minted, product)
          WHERE h."code" = v.code AND h."status" = 'UNASSIGNED'::"HologramCodeStatus"`;
        if (updated !== dto.items.length) {
          throw new ConflictException(
            'وضعیت برخی کدها هم‌زمان تغییر کرد؛ دوباره تلاش کنید',
          );
        }
        const grams = dto.items.reduce(
          (t, i) => t.plus(i.weightGrams),
          new Decimal(0),
        );
        return {
          message: `${dto.items.length} شمش کدگذاری شد (${grams.toString()} گرم)`,
          count: dto.items.length,
          grams: grams.toString(),
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}
