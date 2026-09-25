// api/src/agent/agent.service.ts
//
// مدیریت نمایندگان فروش: تعریف نماینده و حساب‌های ورود، تحویل امانی/عودت شمش،
// تسویه و اصلاحیه، صورتحساب، اسناد حسابداری و گزارش‌ها. منطق فروش به مالک نهایی
// در AgentSaleService است.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { hashPassword } from '../common/crypto/password.util';
import { AGENT_ROLE_KEY } from '../admin-auth/rbac.const';
import { AgentAccountingService, agentTag } from './agent-accounting.service';
import {
  AllocateStockDto,
  ChangeAgentStatusDto,
  CreateAdjustmentDto,
  CreateAgentAccountDto,
  CreateAgentDto,
  CreateSettlementDto,
  InventoryQueryDto,
  ListAgentsQueryDto,
  ListSettlementsQueryDto,
  MovementsQueryDto,
  PageQueryDto,
  ReportQueryDto,
  StatementQueryDto,
  UpdateAgentAccountDto,
  UpdateAgentDto,
} from './agent.dto';

type Tx = Prisma.TransactionClient;

export const SETTLEMENT_METHOD_FA: Record<string, string> = {
  CASH: 'نقدی',
  BANK_TRANSFER: 'واریز بانکی (پایا/ساتنا)',
  CARD_TO_CARD: 'کارت به کارت',
  POS: 'کارتخوان',
  CHEQUE: 'چک',
};

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

// Prisma Accelerate تراکنش تعاملی بیش از ۱۵ ثانیه را رد می‌کند (P6005)
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    // تاریخ بدون ساعت = تا پایان همان روز
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

function paged<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: DocumentSequenceService,
    private readonly agentAccounting: AgentAccountingService,
  ) {}

  // ══════════════════════════════════════════
  // ── تعریف نماینده ──
  // ══════════════════════════════════════════

  private async nextAgentCode(): Promise<string> {
    const last = await this.prisma.agent.findFirst({
      where: { code: { startsWith: 'AGT-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const n = last ? Number(last.code.replace('AGT-', '')) || 0 : 0;
    return `AGT-${String(n + 1).padStart(4, '0')}`;
  }

  private validateCommission(type: string, value: number) {
    if (type === 'PERCENT' && value > 50) {
      throw new BadRequestException(
        'درصد حق‌العمل نماینده نمی‌تواند بیش از ۵۰٪ باشد',
      );
    }
  }

  async create(adminId: string, dto: CreateAgentDto) {
    this.validateCommission(dto.commissionType, dto.commissionValue);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = await this.nextAgentCode();
      try {
        return await this.prisma.agent.create({
          data: {
            code,
            name: dto.name.trim(),
            managerName: dto.managerName.trim(),
            nationalCode: dto.nationalCode,
            phone: dto.phone,
            email: dto.email,
            province: dto.province,
            city: dto.city,
            address: dto.address,
            postalCode: dto.postalCode,
            contractNumber: dto.contractNumber,
            contractStartAt: dto.contractStartAt
              ? new Date(dto.contractStartAt)
              : null,
            contractEndAt: dto.contractEndAt
              ? new Date(dto.contractEndAt)
              : null,
            commissionType: dto.commissionType,
            commissionValue: dto.commissionValue,
            creditLimitRial:
              dto.creditLimitRial == null
                ? null
                : Math.round(dto.creditLimitRial),
            notes: dto.notes,
            createdById: adminId,
          },
        });
      } catch (err) {
        // برخورد هم‌زمان روی کد نماینده — کد بعدی امتحان می‌شود
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException(
      'تولید کد یکتای نماینده ناموفق بود؛ دوباره تلاش کنید',
    );
  }

  async update(agentId: string, dto: UpdateAgentDto) {
    const agent = await this.getAgentOrThrow(agentId);
    const commissionType = dto.commissionType ?? agent.commissionType;
    const commissionValue =
      dto.commissionValue ?? Number(agent.commissionValue);
    this.validateCommission(commissionType, commissionValue);

    let creditLimitRial: number | null | undefined = undefined;
    if (dto.creditLimitRial !== undefined) {
      if (dto.creditLimitRial === null) creditLimitRial = null;
      else if (!Number.isFinite(dto.creditLimitRial) || dto.creditLimitRial < 0)
        throw new BadRequestException('سقف اعتبار معتبر نیست');
      else creditLimitRial = Math.round(dto.creditLimitRial);
    }

    return this.prisma.agent.update({
      where: { id: agentId },
      data: {
        name: dto.name?.trim(),
        managerName: dto.managerName?.trim(),
        nationalCode: dto.nationalCode,
        phone: dto.phone,
        email: dto.email,
        province: dto.province,
        city: dto.city,
        address: dto.address,
        postalCode: dto.postalCode,
        contractNumber: dto.contractNumber,
        contractStartAt: dto.contractStartAt
          ? new Date(dto.contractStartAt)
          : undefined,
        contractEndAt: dto.contractEndAt
          ? new Date(dto.contractEndAt)
          : undefined,
        commissionType: dto.commissionType,
        commissionValue: dto.commissionValue,
        creditLimitRial,
        notes: dto.notes,
      },
    });
  }

  async changeStatus(agentId: string, dto: ChangeAgentStatusDto) {
    const agent = await this.getAgentOrThrow(agentId);
    if (dto.status === 'TERMINATED') {
      const [stock, pending] = await Promise.all([
        this.prisma.hologramCode.count({
          where: { agentId, status: 'AT_AGENT' },
        }),
        this.prisma.agentSettlement.count({
          where: { agentId, status: 'PENDING' },
        }),
      ]);
      if (stock > 0) {
        throw new ConflictException(
          `پیش از خاتمه همکاری، ${stock} شمش امانی باید از نماینده عودت گرفته شود`,
        );
      }
      if (pending > 0) {
        throw new ConflictException(
          'پیش از خاتمه همکاری، تسویه‌های در انتظار بررسی را تعیین تکلیف کنید',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.agent.update({
        where: { id: agentId },
        data: {
          status: dto.status,
          notes: dto.reason
            ? `${agent.notes ? `${agent.notes}\n` : ''}[${new Date().toISOString().slice(0, 10)}] تغییر وضعیت به ${dto.status}: ${dto.reason}`
            : undefined,
        },
      });
      // خاتمه همکاری: حساب‌های ورود نماینده غیرفعال و نشست‌هایشان باطل می‌شود
      if (dto.status === 'TERMINATED') {
        await tx.adminUser.updateMany({
          where: { agentId },
          data: { isActive: false },
        });
        await tx.adminSession.deleteMany({
          where: { adminUser: { agentId } },
        });
      }
    });

    return { message: 'وضعیت نماینده به‌روزرسانی شد', status: dto.status };
  }

  async getAgentOrThrow(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');
    return agent;
  }

  // ══════════════════════════════════════════
  // ── فهرست و جزئیات ──
  // ══════════════════════════════════════════

  private async stockByAgent(agentIds: string[]) {
    if (!agentIds.length)
      return new Map<string, { count: number; grams: string }>();
    const rows = await this.prisma.hologramCode.groupBy({
      by: ['agentId'],
      where: { agentId: { in: agentIds }, status: 'AT_AGENT' },
      _count: { _all: true },
      _sum: { weightGrams: true },
    });
    return new Map(
      rows.map((r) => [
        r.agentId ?? '',
        {
          count: r._count._all,
          grams: d(r._sum.weightGrams).toString(),
        },
      ]),
    );
  }

  async list(query: ListAgentsQueryDto) {
    const where: Prisma.AgentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { managerName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          _count: {
            select: {
              accounts: true,
              sales: { where: { status: 'COMPLETED' } },
              settlements: { where: { status: 'PENDING' } },
            },
          },
        },
      }),
      this.prisma.agent.count({ where }),
    ]);
    const stock = await this.stockByAgent(items.map((a) => a.id));
    return paged(
      items.map(({ _count, ...a }) => ({
        ...a,
        accountsCount: _count.accounts,
        salesCount: _count.sales,
        pendingSettlements: _count.settlements,
        stockCount: stock.get(a.id)?.count ?? 0,
        stockGrams: stock.get(a.id)?.grams ?? '0',
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /** خلاصه‌ی وضعیت یک نماینده — مشترک بین پنل مدیریت و پرتال نماینده */
  async summary(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [stock, salesAll, salesMonth, settled, pending] = await Promise.all([
      this.prisma.hologramCode.aggregate({
        where: { agentId, status: 'AT_AGENT' },
        _count: { _all: true },
        _sum: { weightGrams: true },
      }),
      this.prisma.agentSale.aggregate({
        where: { agentId, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: {
          totalRial: true,
          commissionRial: true,
          netPayableRial: true,
          weightGrams: true,
        },
      }),
      this.prisma.agentSale.aggregate({
        where: {
          agentId,
          status: 'COMPLETED',
          createdAt: { gte: monthStart },
        },
        _count: { _all: true },
        _sum: { totalRial: true, commissionRial: true, weightGrams: true },
      }),
      this.prisma.agentSettlement.aggregate({
        where: { agentId, status: 'APPROVED' },
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
      this.prisma.agentSettlement.aggregate({
        where: { agentId, status: 'PENDING' },
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
    ]);

    const balance = d(agent.balanceRial);
    const creditLimit = agent.creditLimitRial ? d(agent.creditLimitRial) : null;

    return {
      agent,
      stock: {
        count: stock._count._all,
        grams: d(stock._sum.weightGrams).toString(),
      },
      balanceRial: balance.toFixed(0),
      creditLimitRial: creditLimit?.toFixed(0) ?? null,
      availableCreditRial: creditLimit
        ? Decimal.max(creditLimit.minus(balance), 0).toFixed(0)
        : null,
      sales: {
        count: salesAll._count._all,
        totalRial: d(salesAll._sum.totalRial).toFixed(0),
        commissionRial: d(salesAll._sum.commissionRial).toFixed(0),
        netPayableRial: d(salesAll._sum.netPayableRial).toFixed(0),
        grams: d(salesAll._sum.weightGrams).toString(),
      },
      salesThisMonth: {
        count: salesMonth._count._all,
        totalRial: d(salesMonth._sum.totalRial).toFixed(0),
        commissionRial: d(salesMonth._sum.commissionRial).toFixed(0),
        grams: d(salesMonth._sum.weightGrams).toString(),
      },
      settlements: {
        approvedCount: settled._count._all,
        approvedRial: d(settled._sum.amountRial).toFixed(0),
        pendingCount: pending._count._all,
        pendingRial: d(pending._sum.amountRial).toFixed(0),
      },
    };
  }

  async detail(agentId: string) {
    const [summary, accounts] = await Promise.all([
      this.summary(agentId),
      this.prisma.adminUser.findMany({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          isActive: true,
          lastLoginAt: true,
          lastLoginIp: true,
          lockedUntil: true,
          createdAt: true,
        },
      }),
    ]);
    const createdBy = summary.agent.createdById
      ? await this.prisma.adminUser.findUnique({
          where: { id: summary.agent.createdById },
          select: { fullName: true },
        })
      : null;
    return { ...summary, accounts, createdBy: createdBy?.fullName ?? null };
  }

  /** آمار کلی نمایندگان برای داشبورد مدیریت */
  async overview() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [byStatus, stock, receivable, pending, month] = await Promise.all([
      this.prisma.agent.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.hologramCode.aggregate({
        where: { status: 'AT_AGENT' },
        _count: { _all: true },
        _sum: { weightGrams: true },
      }),
      this.prisma.agent.aggregate({ _sum: { balanceRial: true } }),
      this.prisma.agentSettlement.aggregate({
        where: { status: 'PENDING' },
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
      this.prisma.agentSale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: monthStart } },
        _count: { _all: true },
        _sum: { totalRial: true, commissionRial: true, weightGrams: true },
      }),
    ]);
    const statusCount = (s: string) =>
      byStatus.find((b) => b.status === s)?._count._all ?? 0;

    return {
      agents: {
        active: statusCount('ACTIVE'),
        suspended: statusCount('SUSPENDED'),
        terminated: statusCount('TERMINATED'),
      },
      stock: {
        count: stock._count._all,
        grams: d(stock._sum.weightGrams).toString(),
      },
      receivableRial: d(receivable._sum.balanceRial).toFixed(0),
      pendingSettlements: {
        count: pending._count._all,
        amountRial: d(pending._sum.amountRial).toFixed(0),
      },
      salesThisMonth: {
        count: month._count._all,
        totalRial: d(month._sum.totalRial).toFixed(0),
        commissionRial: d(month._sum.commissionRial).toFixed(0),
        grams: d(month._sum.weightGrams).toString(),
      },
    };
  }

  // ══════════════════════════════════════════
  // ── حساب‌های ورود نماینده به پنل ──
  // ══════════════════════════════════════════

  async createAccount(
    adminId: string,
    agentId: string,
    dto: CreateAgentAccountDto,
  ) {
    const agent = await this.getAgentOrThrow(agentId);
    if (agent.status === 'TERMINATED') {
      throw new ConflictException(
        'برای نماینده‌ی خاتمه‌یافته نمی‌توان حساب ورود ساخت',
      );
    }
    if (!/[A-Za-z]/.test(dto.password) || !/\d/.test(dto.password)) {
      throw new BadRequestException(
        'رمز عبور باید ترکیبی از حروف انگلیسی و عدد باشد',
      );
    }
    const role = await this.prisma.adminRole.findUnique({
      where: { key: AGENT_ROLE_KEY },
    });
    if (!role) {
      throw new NotFoundException(
        'نقش سیستمی «نماینده فروش» یافت نشد؛ سرویس را ری‌استارت کنید',
      );
    }
    const exists = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
    });
    if (exists)
      throw new ConflictException('این نام کاربری قبلاً استفاده شده است');

    const account = await this.prisma.adminUser.create({
      data: {
        username: dto.username,
        passwordHash: await hashPassword(dto.password),
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        roleId: role.id,
        agentId,
        createdById: adminId,
      },
    });
    return {
      id: account.id,
      username: account.username,
      fullName: account.fullName,
      phone: account.phone,
      isActive: account.isActive,
    };
  }

  async updateAccount(
    agentId: string,
    accountId: string,
    dto: UpdateAgentAccountDto,
  ) {
    const account = await this.prisma.adminUser.findUnique({
      where: { id: accountId },
    });
    if (!account || account.agentId !== agentId) {
      throw new NotFoundException('حساب ورود این نماینده یافت نشد');
    }
    const data: Prisma.AdminUserUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.newPassword) {
      if (!/[A-Za-z]/.test(dto.newPassword) || !/\d/.test(dto.newPassword)) {
        throw new BadRequestException(
          'رمز عبور باید ترکیبی از حروف انگلیسی و عدد باشد',
        );
      }
      data.passwordHash = await hashPassword(dto.newPassword);
      data.failedLoginCount = 0;
      data.lockedUntil = null;
    }
    if (dto.isActive === true) {
      const agent = await this.getAgentOrThrow(agentId);
      if (agent.status === 'TERMINATED') {
        throw new ConflictException(
          'حساب نماینده‌ی خاتمه‌یافته قابل فعال‌سازی نیست',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: accountId }, data });
      if (dto.isActive === false || dto.newPassword) {
        await tx.adminSession.deleteMany({ where: { adminUserId: accountId } });
      }
    });
    return { message: 'حساب ورود نماینده به‌روزرسانی شد' };
  }

  // ══════════════════════════════════════════
  // ── تحویل امانی و عودت شمش ──
  // ══════════════════════════════════════════

  async allocate(adminId: string, agentId: string, dto: AllocateStockDto) {
    const agent = await this.getAgentOrThrow(agentId);
    if (agent.status !== 'ACTIVE') {
      throw new ConflictException('تحویل شمش فقط به نماینده‌ی فعال ممکن است');
    }
    const codes = dto.items.map((i) => i.code);
    const duplicate = codes.find((c, i) => codes.indexOf(c) !== i);
    if (duplicate) {
      throw new BadRequestException(
        `کد ${duplicate} بیش از یک بار وارد شده است`,
      );
    }
    const productIds = [
      ...new Set(dto.items.map((i) => i.productId).filter(Boolean)),
    ] as string[];
    if (productIds.length) {
      const found = await this.prisma.product.count({
        where: { id: { in: productIds } },
      });
      if (found !== productIds.length) {
        throw new BadRequestException(
          'محصول انتخاب‌شده برای برخی شمش‌ها یافت نشد',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" IN (${Prisma.join(codes)}) FOR UPDATE`;
      const rows = await tx.hologramCode.findMany({
        where: { code: { in: codes } },
        include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
      });
      const byCode = new Map(rows.map((r) => [r.code, r]));
      const missing = codes.filter((c) => !byCode.has(c));
      if (missing.length) {
        throw new NotFoundException(
          `کد(های) هولوگرام یافت نشد: ${missing.join('، ')}`,
        );
      }
      const unavailable = rows.filter(
        (r) =>
          r.status !== 'UNASSIGNED' ||
          r.shopOrderItemId !== null ||
          r.ownerships.length > 0,
      );
      if (unavailable.length) {
        throw new ConflictException(
          `این کدها آزاد نیستند (تخصیص‌یافته، امانی یا باطل): ${unavailable
            .map((r) => r.code)
            .join('، ')}`,
        );
      }

      const voucherNumber = await this.sequence.next(tx, 'AGV');
      const now = new Date();
      let totalGrams = new Decimal(0);

      // همه‌ی شمش‌ها با یک UPDATE ... FROM (VALUES ...) به‌روز می‌شوند — به‌روزرسانی
      // تک‌به‌تک (یک round-trip برای هر شمش) در دسته‌های بزرگ از سقف ۱۵ ثانیه‌ی
      // تراکنش Accelerate عبور می‌کرد
      for (const item of dto.items) {
        totalGrams = totalGrams.plus(item.weightGrams);
      }
      const valueRows = dto.items.map(
        (item) => Prisma.sql`(
          ${item.code}::text,
          ${new Decimal(item.weightGrams).toString()}::numeric,
          ${item.purityKarat}::text,
          ${Math.round(item.premiumRial ?? 0)}::numeric,
          ${item.factorySerialNumber ?? null}::text,
          ${item.mintedAt ? new Date(item.mintedAt) : null}::timestamp,
          ${item.productId ?? null}::uuid
        )`,
      );
      const updated = await tx.$executeRaw`
        UPDATE "hologram_codes" AS h SET
          "status" = 'AT_AGENT'::"HologramCodeStatus",
          "agent_id" = ${agentId}::uuid,
          "agent_allocated_at" = ${now},
          "agent_premium_rial" = v.premium,
          "weight_grams" = v.weight,
          "purity_karat" = v.purity::"GoldPurityKarat",
          "factory_serial_number" = COALESCE(v.serial, h."factory_serial_number"),
          "minted_at" = COALESCE(v.minted, h."minted_at"),
          "product_id" = COALESCE(v.product, h."product_id"),
          "updated_at" = ${now}
        FROM (VALUES ${Prisma.join(valueRows)})
          AS v(code, weight, purity, premium, serial, minted, product)
        WHERE h."code" = v.code AND h."status" = 'UNASSIGNED'::"HologramCodeStatus"`;
      if (updated !== dto.items.length) {
        throw new ConflictException(
          'وضعیت برخی شمش‌ها هم‌زمان تغییر کرد؛ دوباره تلاش کنید',
        );
      }

      const journal = await this.agentAccounting.journalStockMovement(tx, {
        agentTag: agentTag(agent.code),
        agentName: agent.name,
        voucherNumber,
        totalGrams,
        count: dto.items.length,
        direction: 'ALLOCATION',
      });

      await tx.agentStockMovement.createMany({
        data: dto.items.map((item) => ({
          voucherNumber,
          agentId,
          hologramCodeId: byCode.get(item.code)?.id ?? '',
          type: 'ALLOCATION' as const,
          weightGrams: item.weightGrams,
          note: dto.note,
          journalEntryId: journal.id,
          performedByAdminId: adminId,
        })),
      });

      this.logger.log(
        `[Agent] حواله ${voucherNumber}: ${dto.items.length} شمش (${totalGrams.toString()} گرم) به نماینده ${agent.code} تحویل شد`,
      );
      return {
        message: `${dto.items.length} شمش به‌صورت امانی به نماینده تحویل شد`,
        voucherNumber,
        count: dto.items.length,
        totalGrams: totalGrams.toString(),
        journalEntryId: journal.id,
      };
    }, TX_OPTIONS);
  }

  async returnStock(
    adminId: string,
    agentId: string,
    dto: { codes: string[]; note?: string },
  ) {
    const agent = await this.getAgentOrThrow(agentId);
    const codes = [...new Set(dto.codes)];

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" IN (${Prisma.join(codes)}) FOR UPDATE`;
      const rows = await tx.hologramCode.findMany({
        where: { code: { in: codes } },
      });
      const invalid = codes.filter(
        (c) =>
          !rows.find(
            (r) =>
              r.code === c && r.status === 'AT_AGENT' && r.agentId === agentId,
          ),
      );
      if (invalid.length) {
        throw new ConflictException(
          `این کدها در موجودی امانی این نماینده نیستند: ${invalid.join('، ')}`,
        );
      }

      const voucherNumber = await this.sequence.next(tx, 'AGV');
      const totalGrams = rows.reduce(
        (sum, r) => sum.plus(d(r.weightGrams)),
        new Decimal(0),
      );

      await tx.hologramCode.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: {
          status: 'UNASSIGNED',
          agentId: null,
          agentAllocatedAt: null,
        },
      });

      const journal = await this.agentAccounting.journalStockMovement(tx, {
        agentTag: agentTag(agent.code),
        agentName: agent.name,
        voucherNumber,
        totalGrams,
        count: rows.length,
        direction: 'RETURN',
      });

      await tx.agentStockMovement.createMany({
        data: rows.map((r) => ({
          voucherNumber,
          agentId,
          hologramCodeId: r.id,
          type: 'RETURN' as const,
          weightGrams: r.weightGrams ?? 0,
          note: dto.note,
          journalEntryId: journal.id,
          performedByAdminId: adminId,
        })),
      });

      return {
        message: `${rows.length} شمش از نماینده عودت گرفته شد`,
        voucherNumber,
        count: rows.length,
        totalGrams: totalGrams.toString(),
        journalEntryId: journal.id,
      };
    }, TX_OPTIONS);
  }

  async inventory(agentId: string, query: InventoryQueryDto) {
    const where: Prisma.HologramCodeWhereInput = {
      agentId,
      status: 'AT_AGENT',
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search } },
              {
                factorySerialNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [items, total, sums] = await Promise.all([
      this.prisma.hologramCode.findMany({
        where,
        orderBy: { agentAllocatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          code: true,
          weightGrams: true,
          purityKarat: true,
          factorySerialNumber: true,
          mintedAt: true,
          agentAllocatedAt: true,
          agentPremiumRial: true,
          product: { select: { id: true, name: true } },
          batch: { select: { batchNumber: true } },
        },
      }),
      this.prisma.hologramCode.count({ where }),
      this.prisma.hologramCode.aggregate({
        where: { agentId, status: 'AT_AGENT' },
        _sum: { weightGrams: true },
      }),
    ]);
    return {
      ...paged(items, total, query.page, query.limit),
      totalGrams: d(sums._sum.weightGrams).toString(),
    };
  }

  async movements(agentId: string | null, query: MovementsQueryDto) {
    const where: Prisma.AgentStockMovementWhereInput = {
      ...(agentId ? { agentId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(dateRange(query.from, query.to)
        ? { createdAt: dateRange(query.from, query.to) }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.agentStockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          hologramCode: {
            select: {
              code: true,
              purityKarat: true,
              factorySerialNumber: true,
            },
          },
          performedByAdmin: { select: { fullName: true } },
          agent: { select: { code: true, name: true } },
        },
      }),
      this.prisma.agentStockMovement.count({ where }),
    ]);
    return paged(items, total, query.page, query.limit);
  }

  /** یک حواله‌ی کامل (برای چاپ رسید تحویل/عودت) */
  async voucher(voucherNumber: string, agentId?: string) {
    const rows = await this.prisma.agentStockMovement.findMany({
      where: { voucherNumber, ...(agentId ? { agentId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        hologramCode: {
          select: {
            code: true,
            purityKarat: true,
            factorySerialNumber: true,
            product: { select: { name: true } },
          },
        },
        performedByAdmin: { select: { fullName: true } },
        agent: true,
      },
    });
    if (!rows.length) throw new NotFoundException('حواله یافت نشد');
    const totalGrams = rows.reduce(
      (s, r) => s.plus(d(r.weightGrams)),
      new Decimal(0),
    );
    return {
      voucherNumber,
      type: rows[0].type,
      createdAt: rows[0].createdAt,
      note: rows[0].note,
      journalEntryId: rows[0].journalEntryId,
      performedBy: rows[0].performedByAdmin?.fullName ?? null,
      agent: rows[0].agent,
      count: rows.length,
      totalGrams: totalGrams.toString(),
      items: rows.map((r) => ({
        code: r.hologramCode.code,
        productName: r.hologramCode.product?.name ?? null,
        purityKarat: r.hologramCode.purityKarat,
        factorySerialNumber: r.hologramCode.factorySerialNumber,
        weightGrams: r.weightGrams.toString(),
      })),
    };
  }

  // ══════════════════════════════════════════
  // ── تسویه ──
  // ══════════════════════════════════════════

  /** اعلام واریز توسط خود نماینده (در انتظار تأیید مالی) */
  async submitSettlement(
    accountId: string,
    agentId: string,
    dto: CreateSettlementDto,
  ) {
    const agent = await this.getAgentOrThrow(agentId);
    if (agent.status === 'TERMINATED') {
      throw new ForbiddenException('همکاری این نماینده خاتمه یافته است');
    }
    return this.prisma.$transaction(async (tx) => {
      const settlementNumber = await this.sequence.next(tx, 'AGP');
      return tx.agentSettlement.create({
        data: {
          settlementNumber,
          agentId,
          amountRial: Math.round(dto.amountRial),
          method: dto.method,
          referenceNumber: dto.referenceNumber,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
          note: dto.note,
          status: 'PENDING',
          submittedByAdminId: accountId,
        },
      });
    });
  }

  /** ثبت مستقیم دریافت وجه از نماینده توسط واحد مالی (بلافاصله تأییدشده) */
  async recordSettlement(
    adminId: string,
    agentId: string,
    dto: CreateSettlementDto,
  ) {
    const agent = await this.getAgentOrThrow(agentId);
    return this.prisma.$transaction(async (tx) => {
      const settlementNumber = await this.sequence.next(tx, 'AGP');
      const settlement = await tx.agentSettlement.create({
        data: {
          settlementNumber,
          agentId,
          amountRial: Math.round(dto.amountRial),
          method: dto.method,
          referenceNumber: dto.referenceNumber,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          note: dto.note,
          status: 'PENDING',
          submittedByAdminId: adminId,
        },
      });
      return this.applySettlement(tx, settlement.id, adminId, agent.code);
    }, TX_OPTIONS);
  }

  async approveSettlement(adminId: string, settlementId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      const s = await tx.agentSettlement.findUnique({
        where: { id: settlementId },
        include: { agent: { select: { code: true } } },
      });
      if (!s) throw new NotFoundException('تسویه یافت نشد');
      if (s.status !== 'PENDING') {
        throw new ConflictException('این تسویه قبلاً بررسی شده است');
      }
      return this.applySettlement(tx, s.id, adminId, s.agent.code);
    }, TX_OPTIONS);
  }

  private async applySettlement(
    tx: Tx,
    settlementId: string,
    adminId: string,
    agentCode: string,
  ) {
    const s = await tx.agentSettlement.findUniqueOrThrow({
      where: { id: settlementId },
    });
    const amount = d(s.amountRial);
    const journal = await this.agentAccounting.journalSettlement(tx, {
      agentTag: agentTag(agentCode),
      settlementNumber: s.settlementNumber,
      amountRial: amount,
      methodLabel: SETTLEMENT_METHOD_FA[s.method] ?? s.method,
    });
    await this.agentAccounting.postLedger(tx, {
      agentId: s.agentId,
      type: 'SETTLEMENT',
      creditRial: amount,
      description: `تسویه ${SETTLEMENT_METHOD_FA[s.method] ?? s.method}${
        s.referenceNumber ? ` — مرجع ${s.referenceNumber}` : ''
      }`,
      referenceType: 'AGENT_SETTLEMENT',
      referenceId: s.id,
      referenceNumber: s.settlementNumber,
      journalEntryId: journal.id,
      createdByAdminId: adminId,
    });
    return tx.agentSettlement.update({
      where: { id: s.id },
      data: {
        status: 'APPROVED',
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        journalEntryId: journal.id,
      },
    });
  }

  async rejectSettlement(
    adminId: string,
    settlementId: string,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      const s = await tx.agentSettlement.findUnique({
        where: { id: settlementId },
      });
      if (!s) throw new NotFoundException('تسویه یافت نشد');
      if (s.status !== 'PENDING') {
        throw new ConflictException('این تسویه قبلاً بررسی شده است');
      }
      return tx.agentSettlement.update({
        where: { id: s.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
        },
      });
    });
  }

  async listSettlements(
    agentId: string | null,
    query: ListSettlementsQueryDto,
  ) {
    const scopeAgentId = agentId ?? query.agentId;
    const where: Prisma.AgentSettlementWhereInput = {
      ...(scopeAgentId ? { agentId: scopeAgentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(dateRange(query.from, query.to)
        ? { createdAt: dateRange(query.from, query.to) }
        : {}),
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.agentSettlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: { select: { id: true, code: true, name: true } },
          submittedByAdmin: { select: { fullName: true } },
          reviewedByAdmin: { select: { fullName: true } },
        },
      }),
      this.prisma.agentSettlement.count({ where }),
      this.prisma.agentSettlement.aggregate({
        where,
        _sum: { amountRial: true },
      }),
    ]);
    return {
      ...paged(items, total, query.page, query.limit),
      totalAmountRial: d(sum._sum.amountRial).toFixed(0),
    };
  }

  // ══════════════════════════════════════════
  // ── اصلاحیه حساب نماینده ──
  // ══════════════════════════════════════════

  async adjust(adminId: string, agentId: string, dto: CreateAdjustmentDto) {
    const agent = await this.getAgentOrThrow(agentId);
    const amount = new Decimal(dto.amountRial).toDecimalPlaces(0);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, 'AGJ');
      const journal = await this.agentAccounting.journalAdjustment(tx, {
        agentTag: agentTag(agent.code),
        number,
        amountRial: amount,
        direction: dto.direction,
        reason: dto.reason.trim(),
      });
      const entry = await this.agentAccounting.postLedger(tx, {
        agentId,
        type: 'ADJUSTMENT',
        debitRial: dto.direction === 'INCREASE' ? amount : undefined,
        creditRial: dto.direction === 'DECREASE' ? amount : undefined,
        description: `اصلاحیه ${
          dto.direction === 'INCREASE' ? 'افزایش' : 'کاهش'
        } بدهی: ${dto.reason.trim()}`,
        referenceType: 'AGENT_ADJUSTMENT',
        referenceNumber: number,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });
      return {
        message: 'اصلاحیه حساب نماینده ثبت شد',
        number,
        balanceAfterRial: entry.balanceAfterRial.toString(),
        journalEntryId: journal.id,
      };
    }, TX_OPTIONS);
  }

  // ══════════════════════════════════════════
  // ── صورتحساب و اسناد حسابداری ──
  // ══════════════════════════════════════════

  /**
   * صورتحساب نماینده در یک بازه: مانده‌ی ابتدای دوره، ردیف‌ها به ترتیب زمان
   * (با مانده‌ی پس از هر ردیف)، جمع بدهکار/بستانکار و مانده‌ی پایان دوره.
   */
  async statement(agentId: string, query: StatementQueryDto) {
    const agent = await this.getAgentOrThrow(agentId);
    const range = dateRange(query.from, query.to);
    const where: Prisma.AgentLedgerEntryWhereInput = {
      agentId,
      ...(range ? { createdAt: range } : {}),
    };

    const opening = range?.gte
      ? await this.prisma.agentLedgerEntry.findFirst({
          where: { agentId, createdAt: { lt: range.gte } },
          orderBy: { createdAt: 'desc' },
          select: { balanceAfterRial: true },
        })
      : null;

    const [entries, total, sums] = await Promise.all([
      this.prisma.agentLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { createdByAdmin: { select: { fullName: true } } },
      }),
      this.prisma.agentLedgerEntry.count({ where }),
      this.prisma.agentLedgerEntry.aggregate({
        where,
        _sum: { debitRial: true, creditRial: true },
      }),
    ]);

    const openingRial = d(opening?.balanceAfterRial);
    const totalDebit = d(sums._sum.debitRial);
    const totalCredit = d(sums._sum.creditRial);

    return {
      agent: { id: agent.id, code: agent.code, name: agent.name },
      openingBalanceRial: openingRial.toFixed(0),
      totalDebitRial: totalDebit.toFixed(0),
      totalCreditRial: totalCredit.toFixed(0),
      closingBalanceRial: openingRial
        .plus(totalDebit)
        .minus(totalCredit)
        .toFixed(0),
      currentBalanceRial: d(agent.balanceRial).toFixed(0),
      ...paged(entries, total, query.page, query.limit),
    };
  }

  /** اسناد دفتر کل مرتبط با یک نماینده (به همراه ردیف‌ها و نام حساب‌ها) */
  async journals(agentId: string, query: PageQueryDto) {
    const agent = await this.getAgentOrThrow(agentId);
    const where: Prisma.JournalEntryWhereInput = {
      description: { contains: agentTag(agent.code) },
    };
    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: { entryDate: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          ledgerEntries: {
            include: {
              account: { select: { code: true, name: true, type: true } },
            },
            orderBy: { side: 'asc' },
          },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return paged(items, total, query.page, query.limit);
  }

  // ══════════════════════════════════════════
  // ── گزارش عملکرد نمایندگان ──
  // ══════════════════════════════════════════

  async performanceReport(query: ReportQueryDto) {
    const range = dateRange(query.from, query.to);
    const agents = await this.prisma.agent.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        city: true,
        status: true,
        balanceRial: true,
        creditLimitRial: true,
        commissionType: true,
        commissionValue: true,
      },
    });
    const ids = agents.map((a) => a.id);

    const [sales, voided, settlements, allocations, returns, stock] =
      await Promise.all([
        this.prisma.agentSale.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: ids },
            status: 'COMPLETED',
            ...(range ? { createdAt: range } : {}),
          },
          _count: { _all: true },
          _sum: {
            weightGrams: true,
            totalRial: true,
            goldValueRial: true,
            premiumRial: true,
            commissionRial: true,
            netPayableRial: true,
          },
        }),
        this.prisma.agentSale.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: ids },
            status: 'VOIDED',
            ...(range ? { voidedAt: range } : {}),
          },
          _count: { _all: true },
        }),
        this.prisma.agentSettlement.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: ids },
            status: 'APPROVED',
            ...(range ? { reviewedAt: range } : {}),
          },
          _count: { _all: true },
          _sum: { amountRial: true },
        }),
        this.prisma.agentStockMovement.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: ids },
            type: 'ALLOCATION',
            ...(range ? { createdAt: range } : {}),
          },
          _count: { _all: true },
          _sum: { weightGrams: true },
        }),
        this.prisma.agentStockMovement.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: ids },
            type: 'RETURN',
            ...(range ? { createdAt: range } : {}),
          },
          _count: { _all: true },
          _sum: { weightGrams: true },
        }),
        this.stockByAgent(ids),
      ]);

    const pick = <T extends { agentId: string }>(rows: T[], id: string) =>
      rows.find((r) => r.agentId === id);

    const rows = agents.map((a) => {
      const s = pick(sales, a.id);
      const v = pick(voided, a.id);
      const st = pick(settlements, a.id);
      const al = pick(allocations, a.id);
      const rt = pick(returns, a.id);
      return {
        agent: {
          id: a.id,
          code: a.code,
          name: a.name,
          city: a.city,
          status: a.status,
          commissionType: a.commissionType,
          commissionValue: a.commissionValue.toString(),
        },
        salesCount: s?._count._all ?? 0,
        voidedCount: v?._count._all ?? 0,
        gramsSold: d(s?._sum.weightGrams).toString(),
        totalRial: d(s?._sum.totalRial).toFixed(0),
        goldValueRial: d(s?._sum.goldValueRial).toFixed(0),
        premiumRial: d(s?._sum.premiumRial).toFixed(0),
        commissionRial: d(s?._sum.commissionRial).toFixed(0),
        netPayableRial: d(s?._sum.netPayableRial).toFixed(0),
        settledCount: st?._count._all ?? 0,
        settledRial: d(st?._sum.amountRial).toFixed(0),
        allocatedCount: al?._count._all ?? 0,
        allocatedGrams: d(al?._sum.weightGrams).toString(),
        returnedCount: rt?._count._all ?? 0,
        returnedGrams: d(rt?._sum.weightGrams).toString(),
        stockCount: stock.get(a.id)?.count ?? 0,
        stockGrams: stock.get(a.id)?.grams ?? '0',
        balanceRial: d(a.balanceRial).toFixed(0),
        creditLimitRial: a.creditLimitRial?.toString() ?? null,
      };
    });

    type NumericKey =
      | 'gramsSold'
      | 'totalRial'
      | 'commissionRial'
      | 'netPayableRial'
      | 'settledRial'
      | 'stockGrams'
      | 'balanceRial';
    const sum = (key: NumericKey) =>
      rows
        .reduce((acc, r) => acc.plus(new Decimal(r[key])), new Decimal(0))
        .toString();

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      rows,
      totals: {
        salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
        voidedCount: rows.reduce((s, r) => s + r.voidedCount, 0),
        gramsSold: sum('gramsSold'),
        totalRial: sum('totalRial'),
        commissionRial: sum('commissionRial'),
        netPayableRial: sum('netPayableRial'),
        settledRial: sum('settledRial'),
        stockCount: rows.reduce((s, r) => s + r.stockCount, 0),
        stockGrams: sum('stockGrams'),
        balanceRial: sum('balanceRial'),
      },
    };
  }
}
