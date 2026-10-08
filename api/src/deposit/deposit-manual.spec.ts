// api/src/deposit/deposit-manual.spec.ts
//
// واریز کارت به کارت / حساب به حساب: نمایش اطلاعات مقصد هیچ رکوردی نمی‌سازد، درخواست فقط
// با «ثبت واریز» به‌صورت DepositRequest (نه تراکنش PENDING) ساخته می‌شود و سقف روزانه
// بر اساس درخواست‌های همان روش محاسبه می‌شود.
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DepositService } from './deposit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemConfigService } from '../system-config/system-config.service';
import type { StorageService } from '../common/storage/storage.service';
import type { DocumentSequenceService } from '../common/documents/document-sequence.service';
import type { InvoiceService } from '../invoice/invoice.service';
import type { DepositTrackingService } from './deposit-tracking.service';

const USER = 'user-1';
const CARD = '11111111-1111-1111-1111-111111111111';

function setup(
  opts: {
    config?: Record<string, string | number | boolean>;
    verifiedIdentity?: boolean;
    cardVerified?: boolean;
    usedTodayRial?: number;
  } = {},
) {
  const config: Record<string, string | number | boolean> = {
    'deposit.card_to_card.destination_card': '6037991234567890',
    'deposit.card_to_card.destination_owner': 'آرکان گلد',
    'deposit.bank_transfer.destination_sheba': 'IR120000000000000000000001',
    'deposit.bank_transfer.destination_owner': 'آرکان گلد',
    ...opts.config,
  };
  const created: Record<string, unknown>[] = [];
  const transactionCreate = jest.fn();

  const db = {
    userIdentity: {
      findUnique: () =>
        Promise.resolve({
          status: opts.verifiedIdentity === false ? 'PENDING' : 'VERIFIED',
        }),
    },
    bankAccount: {
      findFirst: () =>
        Promise.resolve({
          id: CARD,
          userId: USER,
          bankName: 'ملت',
          cardNumber: '6104337912345678',
          sheba: null,
          isVerified: opts.cardVerified !== false,
        }),
    },
    wallet: { findUnique: () => Promise.resolve({ id: 'wallet-1' }) },
    depositRequest: {
      // جست‌وجوی idempotencyKey در این آزمون‌ها همیشه خالی است
      findUnique: ({ where }: { where: { id?: string } }) =>
        Promise.resolve(created.find((d) => d.id === where.id) ?? null),
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          created.find((d) => d.id === where.id)
            ? {
                ...created.find((d) => d.id === where.id),
                proformaInvoice: null,
                receipts: [],
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 3_600_000),
                reviewedAt: null,
                rejectionReason: null,
                rejectionCount: 0,
              }
            : null,
        ),
      create: ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `dep-${created.length + 1}` };
        created.push(row);
        return Promise.resolve(row);
      },
      aggregate: () =>
        Promise.resolve({ _sum: { amountRial: opts.usedTodayRial ?? 0 } }),
    },
    transaction: { create: transactionCreate },
  };
  const prisma = {
    ...db,
    $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
  } as unknown as PrismaService;

  const systemConfig = {
    get: (k: string, d = '') => Promise.resolve(String(config[k] ?? d)),
    getNumber: (k: string, d: number) =>
      Promise.resolve(k in config ? Number(config[k]) : d),
    getBoolean: (k: string, d: boolean) =>
      Promise.resolve(k in config ? Boolean(config[k]) : d),
  } as unknown as SystemConfigService;

  const service = new DepositService(
    prisma,
    systemConfig,
    {} as StorageService,
    {
      next: () => Promise.resolve('AG-1405-DEP-000001'),
    } as unknown as DocumentSequenceService,
    {} as InvoiceService,
    {
      generate: () => Promise.resolve('1234567890123452'),
    } as unknown as DepositTrackingService,
  );
  return { service, created, transactionCreate };
}

describe('DepositService — کارت به کارت / حساب به حساب', () => {
  it('prepareManual فقط اطلاعات مقصد را برمی‌گرداند و هیچ رکوردی نمی‌سازد', async () => {
    const { service, created, transactionCreate } = setup();
    const res = await service.prepareManual(USER, 'BANK_TRANSFER', CARD);
    expect(res.destination.sheba).toBe('IR120000000000000000000001');
    expect(created).toHaveLength(0);
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it('ثبت واریز: DepositRequest در انتظار فیش، بدون تراکنش کیف پول', async () => {
    const { service, created, transactionCreate } = setup();
    const res = await service.createManual(USER, {
      method: 'CARD_TO_CARD',
      amountRial: 5_000_000,
      sourceCardId: CARD,
    });
    expect(res.status).toBe('PENDING_PAYMENT');
    expect(res.method).toBe('CARD_TO_CARD');
    expect(created[0]).toMatchObject({
      method: 'CARD_TO_CARD',
      amountRial: 5_000_000,
      destinationSnapshot: {
        card: '6037991234567890',
        source: { cardNumber: '6104337912345678' },
      },
    });
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it('کارت تأییدنشده پذیرفته نمی‌شود', async () => {
    const { service } = setup({ cardVerified: false });
    await expect(
      service.prepareManual(USER, 'CARD_TO_CARD', CARD, 5_000_000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('بدون احراز هویت پذیرفته نمی‌شود', async () => {
    const { service } = setup({ verifiedIdentity: false });
    await expect(
      service.prepareManual(USER, 'BANK_TRANSFER', CARD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('روش غیرفعال از پنل ادمین رد می‌شود', async () => {
    const { service } = setup({
      config: { 'deposit.card_to_card.enabled': false },
    });
    await expect(
      service.prepareManual(USER, 'CARD_TO_CARD', CARD, 5_000_000),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('سقف روزانه بر اساس درخواست‌های واریز همان روش', async () => {
    const { service } = setup({
      config: { 'deposit.card_to_card.daily_limit': 10_000_000 },
      usedTodayRial: 8_000_000,
    });
    await expect(
      service.createManual(USER, {
        method: 'CARD_TO_CARD',
        amountRial: 5_000_000,
        sourceCardId: CARD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
