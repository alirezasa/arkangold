import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingService,
  LedgerLineInput,
} from '../accounting/accounting.service';
import { Prisma } from '../generated/prisma/client';
import { CreatePayrollPlanDto, UpdatePayrollPlanDto } from '@arkan-gold/shared';

const D0 = new Prisma.Decimal(0);

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) {}

  // ══════════════════════════════════════════
  // ── مدیریت پلن‌های پی‌رول ──
  // ══════════════════════════════════════════
  async listPlans() {
    return this.prisma.payrollPlan.findMany({
      include: {
        users: { include: { user: { select: { id: true, phone: true } } } },
        logs: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlan(id: string) {
    const plan = await this.prisma.payrollPlan.findUnique({
      where: { id },
      include: {
        users: { include: { user: { select: { id: true, phone: true } } } },
        logs: { orderBy: { startedAt: 'desc' }, take: 20 },
      },
    });
    if (!plan) throw new NotFoundException('پلن پی‌رول یافت نشد');
    return plan;
  }

  async createPlan(adminUserId: string, dto: CreatePayrollPlanDto) {
    return this.prisma.payrollPlan.create({
      data: {
        name: dto.name,
        amountGrams: new Prisma.Decimal(dto.amountGrams),
        executionDay: dto.executionDay,
        isActive: dto.isActive ?? true,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdById: adminUserId,
        users: dto.userIds
          ? { create: dto.userIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: { users: true },
    });
  }

  async updatePlan(id: string, dto: UpdatePayrollPlanDto) {
    await this.getPlan(id);
    return this.prisma.payrollPlan.update({
      where: { id },
      data: {
        name: dto.name,
        amountGrams:
          dto.amountGrams !== undefined
            ? new Prisma.Decimal(dto.amountGrams)
            : undefined,
        executionDay: dto.executionDay,
        isActive: dto.isActive,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async addUsers(planId: string, userIds: string[]) {
    await this.getPlan(planId);
    await this.prisma.payrollPlanUser.createMany({
      data: userIds.map((userId) => ({ planId, userId })),
      skipDuplicates: true,
    });
    return this.getPlan(planId);
  }

  async removeUser(planId: string, userId: string) {
    await this.prisma.payrollPlanUser.deleteMany({
      where: { planId, userId },
    });
    return this.getPlan(planId);
  }

  // ══════════════════════════════════════════
  // ── اجرای پی‌رول — فقط با اقدام دستی ادمین ──
  // (بدون Cron خودکار؛ هر اجرا صرفاً با کلیک ادمین در پنل انجام می‌شود)
  // ══════════════════════════════════════════
  async executePlan(planId: string) {
    const plan = await this.prisma.payrollPlan.findUnique({
      where: { id: planId },
      include: { users: true },
    });
    if (!plan) throw new NotFoundException('پلن پی‌رول یافت نشد');
    if (!plan.isActive) {
      throw new BadRequestException('پلن غیرفعال است');
    }
    if (plan.users.length === 0) {
      throw new BadRequestException('این پلن هیچ کاربری ندارد');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── جلوگیری از اجرای دوباره در همان روز (idempotency) ──
    const existingLog = await this.prisma.payrollLog.findFirst({
      where: { planId, executionDate: today },
    });
    if (existingLog) {
      throw new BadRequestException(
        'پی‌رول این پلن امروز قبلاً اجرا شده است',
      );
    }

    const startedAt = new Date();
    let successful = 0;
    let failed = 0;
    const details: { userId: string; status: string; error?: string }[] = [];

    for (const planUser of plan.users) {
      try {
        await this.payUser(plan.id, plan.name, planUser.userId, plan.amountGrams);
        successful += 1;
        details.push({ userId: planUser.userId, status: 'SUCCESS' });
      } catch (err) {
        failed += 1;
        details.push({
          userId: planUser.userId,
          status: 'FAILED',
          error: (err as Error).message,
        });
        this.logger.error(
          `پرداخت حقوق برای کاربر ${planUser.userId} در پلن ${plan.id} ناموفق بود: ${(err as Error).message}`,
        );
      }
    }

    const status =
      failed === 0 ? 'SUCCESS' : successful === 0 ? 'FAILED' : 'PARTIAL';

    return this.prisma.payrollLog.create({
      data: {
        planId: plan.id,
        executionDate: today,
        status,
        totalUsers: plan.users.length,
        successful,
        failed,
        details,
        startedAt,
        finishedAt: new Date(),
      },
    });
  }

  // پرداخت حقوق: خزانه طلای شرکت (1020) کاهش می‌یابد، بدهی طلایی به کاربر
  // (2020) و هزینه حقوق (5010) افزایش می‌یابد؛ موجودی کیف‌پول کاربر بالا می‌رود.
  private async payUser(
    planId: string,
    planName: string,
    userId: string,
    amountGrams: Prisma.Decimal,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('کیف پول کاربر یافت نشد');

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { goldBalanceGrams: { increment: amountGrams } },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'SALARY',
          amountGrams,
          status: 'COMPLETED',
          description: `salary|plan:${planId}|${planName}`,
        },
      });

      const lines: LedgerLineInput[] = [
        { accountCode: '5010', side: 'DEBIT', amountGrams },
        { accountCode: '1020', side: 'CREDIT', amountGrams },
      ];

      await this.accountingService.postJournal(tx, {
        description: `پرداخت حقوق طلا - پلن ${planName} - کاربر ${userId}`,
        totalRial: D0,
        totalGrams: amountGrams,
        lines,
      });
    });
  }
}
