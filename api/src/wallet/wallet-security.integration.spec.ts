// api/src/wallet/wallet-security.integration.spec.ts
//
// آزمون یکپارچه‌ی کنترل‌های امنیتی کیف پول روی PostgreSQL واقعی:
//   انتقال داخلی فقط از موجودی آزاد (طلای رزروشده قابل انتقال نیست) ← گیرنده‌ی احرازنشده رد می‌شود
//   ← سقف روزانه‌ی برداشت با درخواست‌های همزمان دور زده نمی‌شود ← قید عدم منفی شدن موجودی
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest wallet-security
// بدون این متغیر آزمون رد (skip) می‌شود.
import { randomInt, randomUUID } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { WalletService } from './wallet.service';
import type { AccountingService } from '../accounting/accounting.service';
import type { SmsTemplateService } from '../notifications/sms-template.service';
import type { DepositService } from '../deposit/deposit.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const run = url ? describe : describe.skip;

const CONFIG: Record<string, string> = {
  'transfer.daily_limit_grams': '5',
  'transfer.monthly_limit_grams': '20',
  'withdrawal.min_amount': '100000',
  'withdrawal.max_amount': '5000000',
  'withdrawal.daily_limit': '6000000',
  'withdrawal.monthly_limit': '50000000',
};

run('کنترل‌های امنیتی کیف پول (یکپارچه با PostgreSQL)', () => {
  let prisma: PrismaService;
  let wallet: WalletService;

  const digits = (n: number) =>
    Array.from({ length: n }, () => randomInt(10)).join('');

  async function createUser(opts: {
    verified: boolean;
    goldGrams?: string;
    rial?: string;
  }) {
    const user = await prisma.user.create({
      data: {
        phone: `09${digits(9)}`,
        referralCode: `WS${digits(8)}`,
        status: 'ACTIVE',
        identity: {
          create: {
            firstName: 'آزمون',
            lastName: 'کیف پول',
            nationalCode: digits(10),
            status: opts.verified ? 'VERIFIED' : 'PENDING',
          },
        },
        wallet: {
          create: {
            cardNumber: `1000${digits(12)}`,
            goldBalanceGrams: opts.goldGrams ?? '0',
            rialBalance: opts.rial ?? '0',
          },
        },
      },
      include: { wallet: true },
    });
    return { id: user.id, wallet: user.wallet };
  }

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    const systemConfig = {
      get: (key: string, fallback?: string) =>
        Promise.resolve(CONFIG[key] ?? fallback ?? ''),
      getNumber: (key: string, fallback = 0) =>
        Promise.resolve(CONFIG[key] ? Number(CONFIG[key]) : fallback),
      getDecimal: (key: string, fallback: string) =>
        Promise.resolve(new Prisma.Decimal(CONFIG[key] ?? fallback)),
    } as unknown as SystemConfigService;
    wallet = new WalletService(
      prisma,
      systemConfig,
      {} as AccountingService,
      new DocumentSequenceService(prisma),
      { sendToUser: () => Promise.resolve() } as unknown as SmsTemplateService,
      {} as DepositService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('طلای رزروشده قابل انتقال نیست و فقط موجودی آزاد منتقل می‌شود', async () => {
    const sender = await createUser({ verified: true, goldGrams: '10' });
    const receiver = await createUser({ verified: true });
    await prisma.walletHold.create({
      data: {
        walletId: sender.wallet.id,
        amountGrams: '8',
        holdType: 'PHYSICAL_DELIVERY',
        referenceId: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await expect(
      wallet.internalTransfer(sender.id, receiver.wallet.cardNumber, 3),
    ).rejects.toThrow('موجودی طلای قابل انتقال کافی نیست');

    await wallet.internalTransfer(sender.id, receiver.wallet.cardNumber, 2);
    const [s, r] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { id: sender.wallet.id } }),
      prisma.wallet.findUniqueOrThrow({ where: { id: receiver.wallet.id } }),
    ]);
    expect(s.goldBalanceGrams.toString()).toBe('8');
    expect(r.goldBalanceGrams.toString()).toBe('2');
  });

  it('انتقال به کیف پول کاربر احرازنشده رد می‌شود', async () => {
    const sender = await createUser({ verified: true, goldGrams: '5' });
    const unverified = await createUser({ verified: false });
    await expect(
      wallet.internalTransfer(sender.id, unverified.wallet.cardNumber, 1),
    ).rejects.toThrow('گیرنده باید حساب فعال و احرازهویت‌شده داشته باشد');
  });

  it('سقف روزانه‌ی برداشت با درخواست‌های همزمان دور زده نمی‌شود', async () => {
    const user = await createUser({ verified: true, rial: '20000000' });
    const bank = await prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankName: 'آزمون',
        accountNumber: digits(10),
        cardNumber: `6037${digits(12)}`,
        sheba: `IR${digits(24)}`,
        isVerified: true,
        status: 'VERIFIED',
      },
    });

    // سقف روزانه ۶٬۰۰۰٬۰۰۰ ریال: از دو درخواست همزمان ۴٬۰۰۰٬۰۰۰ ریالی فقط یکی پذیرفته می‌شود
    const results = await Promise.allSettled([
      wallet.requestWithdrawal(user.id, bank.id, 4_000_000),
      wallet.requestWithdrawal(user.id, bank.id, 4_000_000),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as Error).message).toContain(
      'سقف برداشت روزانه',
    );
  });

  it('پایگاه داده موجودی منفی کیف پول را نمی‌پذیرد', async () => {
    const user = await createUser({ verified: true, goldGrams: '1' });
    await expect(
      prisma.wallet.update({
        where: { id: user.wallet.id },
        data: { goldBalanceGrams: { decrement: 2 } },
      }),
    ).rejects.toThrow(/wallets_balance_non_negative/);
  });
});
