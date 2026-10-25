// api/src/agent/agent-wallet.service.ts
//
// کیف پول ریالی نماینده — کاملاً جدا از کیف پول کاربران (Wallet / حساب 2010). هر تغییر
// موجودی فقط از مسیر post() و داخل همان تراکنش عملیات اصلی انجام می‌شود: ردیف کیف پول قفل
// (FOR UPDATE)، مانده بررسی، ردیف گردش append-only با «مانده پس از» ثبت و سند دفتر کل
// (حساب 2070) در همان تراکنش. قید CHECK پایگاه داده (مانده ≥ ۰، رزرو ≤ مانده) آخرین خط دفاع است.
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export type AgentWalletTxType =
  | 'DEPOSIT'
  | 'PURCHASE'
  | 'PURCHASE_REFUND'
  | 'BUYBACK'
  | 'WITHDRAWAL'
  | 'WITHDRAWAL_REVERSAL'
  | 'DEBT_SETTLEMENT'
  | 'ADJUSTMENT';

export const WALLET_TX_TYPE_FA: Record<AgentWalletTxType, string> = {
  DEPOSIT: 'واریز',
  PURCHASE: 'پرداخت سفارش خرید شمش',
  PURCHASE_REFUND: 'برگشت وجه سفارش',
  BUYBACK: 'فروش شمش به شرکت',
  WITHDRAWAL: 'برداشت به حساب بانکی',
  WITHDRAWAL_REVERSAL: 'برگشت برداشت',
  DEBT_SETTLEMENT: 'تسویه بدهی از کیف پول',
  ADJUSTMENT: 'اصلاحیه مالی',
};

export interface WalletPostInput {
  agentId: string;
  type: AgentWalletTxType;
  creditRial?: Decimal;
  debitRial?: Decimal;
  description: string;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  journalEntryId?: string | null;
  createdByAdminId?: string | null;
  /** برای برداشت نهایی: همان مبلغ از رزرو هم آزاد می‌شود */
  consumeBlockedRial?: Decimal;
}

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

@Injectable()
export class AgentWalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** کیف پول نماینده (در صورت نبود ساخته می‌شود) با قفل ردیف */
  async lockWallet(tx: Tx, agentId: string) {
    await tx.$executeRaw`
      INSERT INTO "agent_wallets" ("id", "agent_id", "balance_rial", "blocked_rial", "created_at", "updated_at")
      VALUES (${uuidv4()}::uuid, ${agentId}::uuid, 0, 0, NOW(), NOW())
      ON CONFLICT ("agent_id") DO NOTHING`;
    await tx.$executeRaw`SELECT 1 FROM "agent_wallets" WHERE "agent_id" = ${agentId}::uuid FOR UPDATE`;
    return tx.agentWallet.findUniqueOrThrow({ where: { agentId } });
  }

  /** ثبت گردش کیف پول — همیشه داخل تراکنش عملیات اصلی */
  async post(tx: Tx, input: WalletPostInput) {
    const wallet = await this.lockWallet(tx, input.agentId);
    const credit = (input.creditRial ?? new Decimal(0)).toDecimalPlaces(0);
    const debit = (input.debitRial ?? new Decimal(0)).toDecimalPlaces(0);
    if (credit.isNegative() || debit.isNegative()) {
      throw new BadRequestException('مبلغ گردش کیف پول نامعتبر است');
    }
    if (credit.isZero() && debit.isZero()) {
      throw new BadRequestException('مبلغ گردش کیف پول صفر است');
    }
    const consume = (
      input.consumeBlockedRial ?? new Decimal(0)
    ).toDecimalPlaces(0);
    const balance = d(wallet.balanceRial);
    const blocked = d(wallet.blockedRial).minus(consume);
    if (blocked.isNegative()) {
      throw new ConflictException('مبلغ رزرو کیف پول با درخواست مطابقت ندارد');
    }
    const available = balance.minus(blocked);
    if (debit.greaterThan(available.plus(credit))) {
      throw new ConflictException(
        `موجودی قابل استفاده‌ی کیف پول کافی نیست (موجودی قابل استفاده: ${available
          .dividedBy(10)
          .toDecimalPlaces(0)
          .toNumber()
          .toLocaleString('fa-IR')} تومان)`,
      );
    }
    const after = balance.plus(credit).minus(debit);
    await tx.agentWallet.update({
      where: { id: wallet.id },
      data: { balanceRial: after.toFixed(0), blockedRial: blocked.toFixed(0) },
    });
    return tx.agentWalletTransaction.create({
      data: {
        walletId: wallet.id,
        agentId: input.agentId,
        type: input.type,
        creditRial: credit.toFixed(0),
        debitRial: debit.toFixed(0),
        balanceAfterRial: after.toFixed(0),
        description: input.description,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        referenceNumber: input.referenceNumber ?? null,
        journalEntryId: input.journalEntryId ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      },
    });
  }

  /** رزرو مبلغ برای برداشت در جریان (مانده تغییر نمی‌کند، قابل استفاده کم می‌شود) */
  async block(tx: Tx, agentId: string, amount: Decimal) {
    const wallet = await this.lockWallet(tx, agentId);
    const available = d(wallet.balanceRial).minus(d(wallet.blockedRial));
    if (amount.greaterThan(available)) {
      throw new ConflictException('موجودی قابل برداشت کیف پول کافی نیست');
    }
    await tx.agentWallet.update({
      where: { id: wallet.id },
      data: { blockedRial: d(wallet.blockedRial).plus(amount).toFixed(0) },
    });
  }

  /** آزادسازی رزرو (رد یا لغو برداشت) */
  async release(tx: Tx, agentId: string, amount: Decimal) {
    const wallet = await this.lockWallet(tx, agentId);
    const next = Decimal.max(d(wallet.blockedRial).minus(amount), 0);
    await tx.agentWallet.update({
      where: { id: wallet.id },
      data: { blockedRial: next.toFixed(0) },
    });
  }

  async summary(agentId: string) {
    const wallet = await this.prisma.agentWallet.findUnique({
      where: { agentId },
    });
    const balance = d(wallet?.balanceRial);
    const blocked = d(wallet?.blockedRial);
    return {
      balanceRial: balance.toFixed(0),
      blockedRial: blocked.toFixed(0),
      availableRial: balance.minus(blocked).toFixed(0),
      currency: 'IRR' as const,
    };
  }

  async transactions(
    agentId: string,
    query: { page: number; limit: number; type?: string },
  ) {
    const where: Prisma.AgentWalletTransactionWhereInput = {
      agentId,
      ...(query.type ? { type: query.type as AgentWalletTxType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.agentWalletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.agentWalletTransaction.count({ where }),
    ]);
    return {
      data: items.map((t) => ({
        ...t,
        typeLabel: WALLET_TX_TYPE_FA[t.type] ?? t.type,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** جمع کیف پول همه‌ی نمایندگان — برای تطبیق با مانده‌ی حساب 2070 */
  async totals() {
    const agg = await this.prisma.agentWallet.aggregate({
      _sum: { balanceRial: true, blockedRial: true },
    });
    return {
      balanceRial: d(agg._sum.balanceRial).toFixed(0),
      blockedRial: d(agg._sum.blockedRial).toFixed(0),
    };
  }
}
