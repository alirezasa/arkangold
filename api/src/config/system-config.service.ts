import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PlatformLimits {
  depositGatewayMin: number;
  depositGatewayMax: number;
  depositShebaMin: number;
  withdrawMin: number;
  withdrawMaxDaily: number;
  withdrawApprovalThreshold: number; // بالاتر = ۲ ادمین
  platformSheba: string;
  platformBankName: string;
  maxBankAccounts: number;
}

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);
  private cache = new Map<string, string>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.loadCache();
  }

  // ── بارگذاری همه کانفیگ‌ها در حافظه ──
  async loadCache() {
    const configs = await this.prisma.systemConfig.findMany();
    configs.forEach((c) => this.cache.set(c.key, c.value));
    this.logger.log(`[SystemConfig] ${configs.length} کانفیگ بارگذاری شد`);
  }

  get(key: string, fallback = ''): string {
    return this.cache.get(key) ?? fallback;
  }

  getNumber(key: string, fallback = 0): number {
    const val = this.cache.get(key);
    return val ? Number(val) : fallback;
  }

  async set(key: string, value: string, description?: string) {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, description },
      update: { value },
    });
    this.cache.set(key, value);
  }

  getLimits(): PlatformLimits {
    return {
      depositGatewayMin: this.getNumber('DEPOSIT_GATEWAY_MIN', 5000),
      depositGatewayMax: this.getNumber('DEPOSIT_GATEWAY_MAX', 400_000_000),
      depositShebaMin: this.getNumber('DEPOSIT_SHEBA_MIN', 400_000_000),
      withdrawMin: this.getNumber('WITHDRAW_MIN', 50_000),
      withdrawMaxDaily: this.getNumber('WITHDRAW_MAX_DAILY', 500_000_000),
      withdrawApprovalThreshold: this.getNumber(
        'WITHDRAW_APPROVAL_THRESHOLD',
        50_000_000,
      ),
      platformSheba: this.get('PLATFORM_SHEBA', 'IR000000000000000000000000'),
      platformBankName: this.get('PLATFORM_BANK_NAME', 'بانک ملت'),
      maxBankAccounts: this.getNumber('MAX_BANK_ACCOUNTS', 5),
    };
  }

  // ── مقادیر پیش‌فرض هنگام اولین اجرا ──
  private async seedDefaults() {
    const defaults: Array<{ key: string; value: string; description: string }> =
      [
        {
          key: 'DEPOSIT_GATEWAY_MIN',
          value: '5000',
          description: 'حداقل واریز درگاه (تومان)',
        },
        {
          key: 'DEPOSIT_GATEWAY_MAX',
          value: '400000000',
          description: 'سقف واریز درگاه (تومان)',
        },
        {
          key: 'DEPOSIT_SHEBA_MIN',
          value: '400000000',
          description: 'حداقل واریز شبا (تومان)',
        },
        {
          key: 'WITHDRAW_MIN',
          value: '50000',
          description: 'حداقل برداشت (تومان)',
        },
        {
          key: 'WITHDRAW_MAX_DAILY',
          value: '500000000',
          description: 'سقف برداشت روزانه (تومان)',
        },
        {
          key: 'WITHDRAW_APPROVAL_THRESHOLD',
          value: '50000000',
          description: 'آستانه تایید دو ادمین (تومان)',
        },
        {
          key: 'PLATFORM_SHEBA',
          value: 'IR000000000000000000000000',
          description: 'شماره شبای پلتفرم',
        },
        {
          key: 'PLATFORM_BANK_NAME',
          value: 'بانک ملت',
          description: 'نام بانک پلتفرم',
        },
        {
          key: 'MAX_BANK_ACCOUNTS',
          value: '5',
          description: 'حداکثر کارت بانکی per user',
        },
        {
          key: 'DEFAULT_DAILY_BUY_LIMIT_GRAMS',
          value: '10',
          description: 'سقف خرید روزانه (گرم)',
        },
        {
          key: 'DEFAULT_DAILY_SELL_LIMIT_GRAMS',
          value: '10',
          description: 'سقف فروش روزانه (گرم)',
        },
        {
          key: 'DEFAULT_MONTHLY_WITHDRAW_LIMIT_RIAL',
          value: '100000000',
          description: 'سقف برداشت ماهانه (تومان)',
        },
        {
          key: 'DEFAULT_DAILY_TRANSFER_LIMIT_GRAMS',
          value: '100',
          description: 'سقف انتقال روزانه (گرم)',
        },
        {
          key: 'DEFAULT_FEE_BUY_GOLD',
          value: '1.00',
          description: 'کارمزد خرید طلا (%)',
        },
        {
          key: 'DEFAULT_FEE_SELL_GOLD',
          value: '0.50',
          description: 'کارمزد فروش طلا (%)',
        },
        {
          key: 'DEFAULT_FEE_WITHDRAWAL',
          value: '0.00',
          description: 'کارمزد برداشت (%)',
        },
        {
          key: 'DEFAULT_TAX_BUY',
          value: '9.00',
          description: 'مالیات خرید (%)',
        },
        {
          key: 'DEFAULT_TAX_SELL',
          value: '9.00',
          description: 'مالیات فروش (%)',
        },
      ];

    for (const d of defaults) {
      const exists = await this.prisma.systemConfig.findUnique({
        where: { key: d.key },
      });
      if (!exists) {
        await this.prisma.systemConfig.create({ data: d });
        this.logger.log(`[SystemConfig] seed: ${d.key}`);
      }
    }
  }
}
