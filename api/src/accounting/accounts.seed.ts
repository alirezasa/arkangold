// api/src/accounting/accounts.seed.ts

import { AccountType } from '../generated/prisma/client';

export interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
  subType?: string;
}

/**
 * حساب‌های پایه (Chart of Accounts)
 * ⚠️ کد حساب (code) کلید یکتاست و هرگز نباید بعد از استفاده تغییر کند.
 * مانده‌ها (balanceRial/balanceGrams) عمداً seed نمی‌شوند —
 * فقط از طریق LedgerEntry تغییر می‌کنند.
 */
export const CHART_OF_ACCOUNTS_DEFAULTS: AccountSeed[] = [
  // ─── دارایی‌ها (ASSET) ───
  {
    code: '1010',
    name: 'موجودی نقد (ریال)',
    type: AccountType.ASSET,
    subType: 'CASH',
  },
  {
    code: '1020',
    name: 'موجودی طلای فیزیکی (گرم)',
    type: AccountType.ASSET,
    subType: 'GOLD_INVENTORY',
  },
  {
    code: '1030',
    name: 'موجودی شمش امانی نزد نمایندگان (گرم)',
    type: AccountType.ASSET,
    subType: 'AGENT_CONSIGNMENT',
  },
  {
    code: '1040',
    name: 'حساب‌های دریافتنی از نمایندگان فروش',
    type: AccountType.ASSET,
    subType: 'AGENT_RECEIVABLE',
  },

  // ─── بدهی‌ها (LIABILITY) ───
  {
    code: '2010',
    name: 'بدهی ریالی به کاربران',
    type: AccountType.LIABILITY,
    subType: 'USER_WALLET_RIAL',
  },
  {
    code: '2020',
    name: 'بدهی طلایی به کاربران (گرم)',
    type: AccountType.LIABILITY,
    subType: 'USER_WALLET_GOLD',
  },
  {
    code: '2030',
    name: 'مالیات پرداختنی',
    type: 'LIABILITY',
    subType: 'TAX_PAYABLE',
  },

  // ─── درآمدها (INCOME) ───
  {
    code: '4010',
    name: 'درآمد کارمزد معاملات',
    type: AccountType.INCOME,
    subType: 'TRADE_FEE',
  },
  {
    code: '4020',
    name: 'درآمد فروش فروشگاه',
    type: AccountType.INCOME,
    subType: 'SHOP_SALE',
  },
  {
    code: '4030',
    name: 'درآمد بسته‌بندی سفارش‌های فروشگاه',
    type: AccountType.INCOME,
    subType: 'SHOP_PACKAGING',
  },
  {
    code: '4040',
    name: 'درآمد فروش شمش از طریق نمایندگان',
    type: AccountType.INCOME,
    subType: 'AGENT_BAR_SALE',
  },
  {
    code: '4050',
    name: 'درآمد اجرت و حق ضرب شمش (فروش نمایندگی)',
    type: AccountType.INCOME,
    subType: 'AGENT_BAR_PREMIUM',
  },
  {
    code: '4060',
    name: 'درآمدهای متفرقه نمایندگان (جریمه/اصلاحیه)',
    type: AccountType.INCOME,
    subType: 'AGENT_OTHER_INCOME',
  },

  // ─── هزینه‌ها (EXPENSE) ───
  {
    code: '5010',
    name: 'هزینه حقوق و دستمزد (پی‌رول)',
    type: AccountType.EXPENSE,
    subType: 'PAYROLL',
  },
  {
    code: '5020',
    name: 'هزینه پاداش معرفی (Referral)',
    type: AccountType.EXPENSE,
    subType: 'REFERRAL_REWARD',
  },
  {
    code: '5030',
    name: 'هزینه تخفیف فروش (کد تخفیف)',
    type: AccountType.EXPENSE,
    subType: 'SALES_DISCOUNT',
  },
  {
    code: '5040',
    name: 'هزینه حق‌العمل (کمیسیون) نمایندگان فروش',
    type: AccountType.EXPENSE,
    subType: 'AGENT_COMMISSION',
  },
  {
    code: '5050',
    name: 'بهای تمام‌شده شمش فروخته‌شده توسط نمایندگان (گرم)',
    type: AccountType.EXPENSE,
    subType: 'AGENT_BAR_COGS',
  },
];
