// api/src/system-config/system-config.seed.ts

export const WALLET_CONFIG_DEFAULTS = [
  // ══ واریز آنلاین ══
  {
    key: 'deposit.online.enabled',
    value: 'false',
    description: 'فعال بودن درگاه آنلاین',
  },
  {
    key: 'deposit.online.min_amount',
    value: '100000',
    description: 'حداقل مبلغ واریز آنلاین (ریال)',
  },
  {
    key: 'deposit.online.max_amount',
    value: '4000000000',
    description: 'حداکثر مبلغ واریز آنلاین (ریال)',
  },
  {
    key: 'deposit.online.daily_limit',
    value: '4000000000',
    description: 'سقف واریز روزانه درگاه آنلاین (ریال)',
  },

  // ══ کارت به کارت ══
  {
    key: 'deposit.card_to_card.daily_limit',
    value: '150000000',
    description: 'سقف واریز روزانه کارت به کارت (ریال)',
  },
  {
    key: 'deposit.card_to_card.min_amount',
    value: '100000',
    description: 'حداقل مبلغ کارت به کارت (ریال)',
  },
  {
    key: 'deposit.card_to_card.max_amount',
    value: '150000000',
    description: 'حداکثر مبلغ کارت به کارت (ریال)',
  },
  {
    key: 'deposit.card_to_card.destination_card',
    value: '6037707500624484',
    description: 'شماره کارت مقصد',
  },
  {
    key: 'deposit.card_to_card.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب کارت مقصد',
  },
  {
    key: 'deposit.card_to_card.processing_time',
    value: 'کمتر از ۱۰ دقیقه',
    description: 'زمان پردازش',
  },

  // ══ حساب به حساب ══
  {
    key: 'deposit.bank_transfer.daily_limit',
    value: '0',
    description: 'سقف حساب به حساب (0=بدون محدودیت)',
  },
  {
    key: 'deposit.bank_transfer.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد',
  },
  {
    key: 'deposit.bank_transfer.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد',
  },
  {
    key: 'deposit.bank_transfer.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب حساب مقصد',
  },
  {
    key: 'deposit.bank_transfer.processing_time',
    value: 'واریز در سیکل پایا',
    description: 'زمان پردازش',
  },

  // ══ واریز شناسه‌دار ══
  {
    key: 'deposit.tracking_id.daily_limit',
    value: '4000000000',
    description: 'سقف روزانه (ریال)',
  },
  {
    key: 'deposit.tracking_id.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد',
  },
  {
    key: 'deposit.tracking_id.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد',
  },
  {
    key: 'deposit.tracking_id.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب حساب',
  },

  // ══ مبالغ بالا ══
  {
    key: 'deposit.large_transfer.min_amount',
    value: '4000000000',
    description: 'حداقل مبلغ (ریال)',
  },
  {
    key: 'deposit.large_transfer.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد',
  },
  {
    key: 'deposit.large_transfer.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد',
  },

  // ══ واریز مستقیم ══
  {
    key: 'deposit.direct.daily_limit',
    value: '150000000',
    description: 'سقف روزانه (ریال)',
  },
  {
    key: 'deposit.direct.destination_card',
    value: '6037707500624484',
    description: 'شماره کارت مقصد',
  },

  // ══ برداشت ══
  {
    key: 'withdrawal.daily_limit',
    value: '2000000000',
    description: 'سقف برداشت روزانه (ریال)',
  },
  {
    key: 'withdrawal.monthly_limit',
    value: '5000000000',
    description: 'سقف برداشت ماهانه (ریال)',
  },
  {
    key: 'withdrawal.min_amount',
    value: '100000',
    description: 'حداقل مبلغ برداشت (ریال)',
  },
  {
    key: 'withdrawal.max_amount',
    value: '2000000000',
    description: 'حداکثر مبلغ برداشت (ریال)',
  },
  {
    key: 'withdrawal.processing_time',
    value: 'سیکل پایا - روزهای کاری بین ۱۲:۴۵ تا ۱۳:۴۵',
    description: 'زمان پردازش',
  },

  // ══ معاملات طلا ══
  {
    key: 'trade.gold.min_grams',
    value: '0.1',
    description: 'حداقل مقدار خرید/فروش (گرم)',
  },
  {
    key: 'trade.gold.max_grams',
    value: '1000',
    description: 'حداکثر مقدار در یک معامله (گرم)',
  },
  {
    key: 'trade.gold.spread_percent',
    value: '0',
    description: 'اسپرد خرید/فروش (درصد)',
  },
  {
    key: 'trade.lock_duration_seconds',
    value: '120',
    description: 'مدت زمان قفل قیمت (ثانیه)',
  },
  {
    key: 'trade.gold.daily_buy_limit_grams',
    value: '50',
    description: 'سقف خرید روزانه (گرم)',
  },
  {
    key: 'trade.gold.daily_sell_limit_grams',
    value: '50',
    description: 'سقف فروش روزانه (گرم)',
  },
  {
    key: 'trade.gold.monthly_buy_limit_grams',
    value: '500',
    description: 'سقف خرید ماهانه (گرم)',
  },
  {
    key: 'trade.gold.monthly_sell_limit_grams',
    value: '500',
    description: 'سقف فروش ماهانه (گرم)',
  },

  // ══ کارمزد و مالیات ══
  { key: 'fee.buy_gold', value: '1.0', description: 'کارمزد خرید طلا (درصد)' },
  { key: 'fee.sell_gold', value: '1.0', description: 'کارمزد فروش طلا (درصد)' },
  { key: 'tax.buy', value: '0', description: 'مالیات خرید طلا (درصد)' },
  { key: 'tax.sell', value: '0', description: 'مالیات فروش طلا (درصد)' },

  // ══ درگاه‌های پرداخت ══
  {
    key: 'payment.zarinpal.enabled',
    value: 'false',
    description: 'فعال بودن زرین‌پال',
  },
  {
    key: 'payment.zarinpal.merchant_id',
    value: '',
    description: 'مرچنت‌آیدی زرین‌پال',
  },
  {
    key: 'payment.zarinpal.sandbox',
    value: 'true',
    description: 'حالت آزمایشی زرین‌پال',
  },

  {
    key: 'payment.behpardakht.enabled',
    value: 'false',
    description: 'فعال بودن به‌پرداخت ملت',
  },
  {
    key: 'payment.behpardakht.terminal_id',
    value: '',
    description: 'شماره ترمینال',
  },
  {
    key: 'payment.behpardakht.username',
    value: '',
    description: 'نام کاربری وب‌سرویس',
  },
  {
    key: 'payment.behpardakht.password',
    value: '',
    description: 'رمز عبور وب‌سرویس (رمزنگاری‌شده)',
  },

  {
    key: 'payment.gateway.callback_base_url',
    value: 'http://localhost:5000',
    description:
      'آدرس پایه API (نه فرانت) برای callback درگاه‌ها — کنترلر خودش کاربر را به فرانت ریدایرکت می‌کند',
  },

  // ══ انتقال داخلی کیف پول ══
  {
    key: 'transfer.daily_limit_rial',
    value: '4000000000',
    description: 'سقف انتقال داخلی روزانه (ریال) — معادل ۴۰۰ میلیون تومان',
  },
  {
    key: 'transfer.monthly_limit_rial',
    value: '10000000000',
    description: 'سقف انتقال داخلی ماهانه (ریال) — معادل ۱ میلیارد تومان',
  },
  {
    key: 'transfer.daily_limit_grams',
    value: '5',
    description: 'سقف انتقال داخلی روزانه طلا (گرم)',
  },
  {
    key: 'transfer.monthly_limit_grams',
    value: '20',
    description: 'سقف انتقال داخلی ماهانه طلا (گرم)',
  },

  // ══ پاداش معرفی (Referral) ══
  {
    key: 'referral.reward_amount_rial',
    value: '0',
    description:
      'مبلغ پاداش معرفی برای معرف پس از احراز هویت کاربر معرفی‌شده (ریال) — صفر یعنی غیرفعال',
  },
  {
    key: 'referral.reward_amount_grams',
    value: '0',
    description:
      'مقدار پاداش معرفی برای معرف پس از احراز هویت کاربر معرفی‌شده (گرم طلا) — صفر یعنی غیرفعال',
  },
];
