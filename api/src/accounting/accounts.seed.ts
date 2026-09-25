// api/src/accounting/accounts.seed.ts

import { AccountType } from '../generated/prisma/client';

export interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
  subType?: string;
  description?: string;
  /** حساب کنترلی: فقط از مسیر سیستمی تغییر می‌کند (پیش‌فرض: مجاز برای سند دستی) */
  allowManualEntry?: boolean;
}

/**
 * حساب‌های پایه (Chart of Accounts)
 * ⚠️ کد حساب (code) کلید یکتاست و هرگز نباید بعد از استفاده تغییر کند.
 * مانده‌ها (balanceRial/balanceGrams) عمداً seed نمی‌شوند —
 * فقط از طریق LedgerEntry تغییر می‌کنند.
 *
 * ماهیت حساب از رقم اول کد: 1 دارایی و 5 هزینه = بدهکار؛ 2 بدهی، 3 حقوق صاحبان سهام
 * و 4 درآمد = بستانکار.
 *
 * واحد ستون گرم: حساب‌های طلای آب‌شده (1020، 1060، 1090، 2020) = گرم معادل ۷۵۰ (۱۸ عیار)؛
 * حساب‌های شمش (1025، 1030، 1095، 5050، 5060) = وزن فیزیکی شمش.
 */
export const CHART_OF_ACCOUNTS_DEFAULTS: AccountSeed[] = [
  // ─── دارایی‌ها (ASSET) ───
  {
    code: '1010',
    name: 'موجودی نقد و بانک (ریال)',
    type: AccountType.ASSET,
    subType: 'CASH',
    description:
      'برای هر حساب بانکی/صندوق می‌توانید زیرحساب معین (مثلاً 101001 بانک ملت) تعریف کنید',
  },
  {
    code: '1020',
    name: 'موجودی طلای آب‌شده خزانه (گرم ۷۵۰)',
    type: AccountType.ASSET,
    subType: 'GOLD_INVENTORY',
    description:
      'پشتوانه‌ی فیزیکی طلای کیف پول کاربران — فقط با خرید/فروش واقعی از بازار، تحویل فیزیکی و شمارش خزانه تغییر می‌کند',
  },
  {
    code: '1025',
    name: 'موجودی شمش و مسکوکات خزانه (گرم)',
    type: AccountType.ASSET,
    subType: 'BULLION_INVENTORY',
    description: 'شمش‌های موجود در خزانه (کددار و بدون کد) به بهای تمام‌شده',
  },
  {
    code: '1030',
    name: 'موجودی شمش امانی نزد نمایندگان (گرم)',
    type: AccountType.ASSET,
    subType: 'AGENT_CONSIGNMENT',
    allowManualEntry: false,
  },
  {
    code: '1040',
    name: 'حساب‌های دریافتنی از نمایندگان فروش',
    type: AccountType.ASSET,
    subType: 'AGENT_RECEIVABLE',
    allowManualEntry: false,
  },
  {
    code: '1050',
    name: 'حساب‌های دریافتنی از شرکای فروش (اقساطی / اپ همکار)',
    type: AccountType.ASSET,
    subType: 'PARTNER_RECEIVABLE',
    allowManualEntry: false,
  },
  {
    code: '1060',
    name: 'طلای خریداری‌شده در راه (دریافت‌نشده)',
    type: AccountType.ASSET,
    subType: 'TREASURY_IN_TRANSIT',
    allowManualEntry: false,
    description: 'خرید قطعی‌شده از بازار که هنوز وارد خزانه نشده است',
  },
  {
    code: '1070',
    name: 'پیش‌پرداخت‌ها و سایر حساب‌های دریافتنی',
    type: AccountType.ASSET,
    subType: 'OTHER_RECEIVABLE',
  },
  {
    code: '1080',
    name: 'اعتبار مالیات بر ارزش افزوده خرید',
    type: AccountType.ASSET,
    subType: 'VAT_RECEIVABLE',
  },
  {
    code: '1090',
    name: 'واسط تأمین طلای آب‌شده — کسری پوشش (گرم ۷۵۰)',
    type: AccountType.ASSET,
    subType: 'GOLD_COVERAGE_CLEARING',
    description:
      'فقط گرم: فروش طلا به کاربران آن را افزایش و خرید از بازار آن را کاهش می‌دهد. مانده‌ی مثبت = طلایی که هنوز باید از بازار خریده شود',
  },
  {
    code: '1095',
    name: 'واسط مقداری ورود و خروج شمش (گرم)',
    type: AccountType.ASSET,
    subType: 'BULLION_CLEARING',
    description:
      'فقط گرم: طرف مقابل وزنی خرید/فروش شمش با بازار و موجودی افتتاحیه‌ی شمش',
  },
  {
    code: '1110',
    name: 'اموال، ماشین‌آلات و تجهیزات',
    type: AccountType.ASSET,
    subType: 'FIXED_ASSETS',
  },
  {
    code: '1120',
    name: 'استهلاک انباشته اموال و تجهیزات',
    type: AccountType.ASSET,
    subType: 'ACCUMULATED_DEPRECIATION',
    description: 'حساب کاهنده‌ی دارایی — مانده‌ی آن منفی نمایش داده می‌شود',
  },

  // ─── بدهی‌ها (LIABILITY) ───
  {
    code: '2010',
    name: 'بدهی ریالی به کاربران',
    type: AccountType.LIABILITY,
    subType: 'USER_WALLET_RIAL',
    allowManualEntry: false,
  },
  {
    code: '2020',
    name: 'بدهی طلایی به کاربران (گرم ۷۵۰)',
    type: AccountType.LIABILITY,
    subType: 'USER_WALLET_GOLD',
    allowManualEntry: false,
  },
  {
    code: '2030',
    name: 'مالیات پرداختنی',
    type: AccountType.LIABILITY,
    subType: 'TAX_PAYABLE',
  },
  {
    code: '2040',
    name: 'حساب‌های پرداختنی تأمین‌کنندگان طلا',
    type: AccountType.LIABILITY,
    subType: 'SUPPLIER_PAYABLE',
    allowManualEntry: false,
  },
  {
    code: '2050',
    name: 'حقوق و دستمزد پرداختنی',
    type: AccountType.LIABILITY,
    subType: 'SALARY_PAYABLE',
  },
  {
    code: '2060',
    name: 'سایر حساب‌ها و اسناد پرداختنی',
    type: AccountType.LIABILITY,
    subType: 'OTHER_PAYABLE',
  },

  // ─── حقوق صاحبان سهام (EQUITY) ───
  {
    code: '3010',
    name: 'سرمایه',
    type: AccountType.EQUITY,
    subType: 'CAPITAL',
  },
  {
    code: '3020',
    name: 'سود (زیان) انباشته',
    type: AccountType.EQUITY,
    subType: 'RETAINED_EARNINGS',
    description:
      'بستن سال مالی، مانده‌ی درآمدها و هزینه‌ها را به این حساب منتقل می‌کند',
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
    name: 'درآمد فروش شمش از طریق نمایندگان و شرکا',
    type: AccountType.INCOME,
    subType: 'AGENT_BAR_SALE',
  },
  {
    code: '4050',
    name: 'درآمد اجرت و حق ضرب شمش',
    type: AccountType.INCOME,
    subType: 'AGENT_BAR_PREMIUM',
  },
  {
    code: '4060',
    name: 'درآمدهای متفرقه نمایندگان (جریمه/اصلاحیه)',
    type: AccountType.INCOME,
    subType: 'AGENT_OTHER_INCOME',
  },
  {
    code: '4070',
    name: 'سود ارزیابی و فروش طلا',
    type: AccountType.INCOME,
    subType: 'GOLD_REVALUATION_GAIN',
  },
  {
    code: '4080',
    name: 'سایر درآمدها',
    type: AccountType.INCOME,
    subType: 'OTHER_INCOME',
  },

  // ─── هزینه‌ها (EXPENSE) ───
  {
    code: '5010',
    name: 'هزینه حقوق و دستمزد (پی‌رول طلایی)',
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
  {
    code: '5060',
    name: 'بهای تمام‌شده شمش فروخته‌شده (فروشگاه و شرکا)',
    type: AccountType.EXPENSE,
    subType: 'BAR_COGS',
  },
  {
    code: '5070',
    name: 'زیان ارزیابی و فروش طلا',
    type: AccountType.EXPENSE,
    subType: 'GOLD_REVALUATION_LOSS',
  },
  {
    code: '5080',
    name: 'کارمزد شرکای فروش اقساطی و اپ‌های همکار',
    type: AccountType.EXPENSE,
    subType: 'PARTNER_COMMISSION',
  },
  {
    code: '5090',
    name: 'کسری و ضایعات طلا',
    type: AccountType.EXPENSE,
    subType: 'GOLD_SHRINKAGE',
  },
  {
    code: '5100',
    name: 'هزینه اجاره',
    type: AccountType.EXPENSE,
    subType: 'RENT',
  },
  {
    code: '5110',
    name: 'هزینه آب، برق، تلفن و اینترنت',
    type: AccountType.EXPENSE,
    subType: 'UTILITIES',
  },
  {
    code: '5120',
    name: 'هزینه تبلیغات و بازاریابی',
    type: AccountType.EXPENSE,
    subType: 'MARKETING',
  },
  {
    code: '5130',
    name: 'کارمزد بانکی و درگاه پرداخت',
    type: AccountType.EXPENSE,
    subType: 'BANK_FEES',
  },
  {
    code: '5140',
    name: 'هزینه حمل، بیمه و نگهداری خزانه',
    type: AccountType.EXPENSE,
    subType: 'LOGISTICS',
  },
  {
    code: '5150',
    name: 'هزینه حقوق و دستمزد ریالی کارکنان',
    type: AccountType.EXPENSE,
    subType: 'STAFF_SALARY',
  },
  {
    code: '5160',
    name: 'هزینه استهلاک',
    type: AccountType.EXPENSE,
    subType: 'DEPRECIATION',
  },
  {
    code: '5170',
    name: 'هزینه‌های اداری و عمومی',
    type: AccountType.EXPENSE,
    subType: 'GENERAL_ADMIN',
  },
  {
    code: '5180',
    name: 'هزینه سرور، نرم‌افزار و خدمات فنی',
    type: AccountType.EXPENSE,
    subType: 'IT_SERVICES',
  },
];

/** کدهای حساب پرکاربرد — برای خوانایی کد و جلوگیری از اشتباه تایپی */
export const ACC = {
  CASH: '1010',
  GOLD_VAULT: '1020',
  BULLION: '1025',
  CONSIGNMENT: '1030',
  AGENT_RECEIVABLE: '1040',
  PARTNER_RECEIVABLE: '1050',
  GOLD_IN_TRANSIT: '1060',
  OTHER_RECEIVABLE: '1070',
  VAT_RECEIVABLE: '1080',
  GOLD_COVERAGE: '1090',
  BULLION_CLEARING: '1095',
  USER_RIAL: '2010',
  USER_GOLD: '2020',
  TAX_PAYABLE: '2030',
  SUPPLIER_PAYABLE: '2040',
  CAPITAL: '3010',
  RETAINED_EARNINGS: '3020',
  TRADE_FEE: '4010',
  SHOP_SALE: '4020',
  BAR_SALE: '4040',
  BAR_PREMIUM: '4050',
  GOLD_GAIN: '4070',
  PAYROLL: '5010',
  REFERRAL: '5020',
  BAR_COGS: '5060',
  GOLD_LOSS: '5070',
  PARTNER_COMMISSION: '5080',
  GOLD_SHRINKAGE: '5090',
} as const;
