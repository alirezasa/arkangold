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
];
