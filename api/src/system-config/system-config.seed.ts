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
    description: 'حداکثر مبلغ کارت به کارت در یک تراکنش (ریال)',
  },
  {
    key: 'deposit.card_to_card.destination_card',
    value: '6037707500624484',
    description: 'شماره کارت مقصد کارت به کارت',
  },
  {
    key: 'deposit.card_to_card.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب کارت مقصد',
  },
  {
    key: 'deposit.card_to_card.processing_time',
    value: 'کمتر از ۱۰ دقیقه',
    description: 'زمان پردازش کارت به کارت',
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
    description: 'شماره حساب مقصد حساب به حساب',
  },
  {
    key: 'deposit.bank_transfer.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد حساب به حساب',
  },
  {
    key: 'deposit.bank_transfer.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب حساب مقصد',
  },
  {
    key: 'deposit.bank_transfer.processing_time',
    value: 'واریز در سیکل پایا',
    description: 'زمان پردازش حساب به حساب',
  },

  // ══ واریز شناسه‌دار ══
  {
    key: 'deposit.tracking_id.daily_limit',
    value: '4000000000',
    description: 'سقف واریز شناسه‌دار روزانه (ریال)',
  },
  {
    key: 'deposit.tracking_id.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد شناسه‌دار',
  },
  {
    key: 'deposit.tracking_id.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد شناسه‌دار',
  },
  {
    key: 'deposit.tracking_id.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب حساب شناسه‌دار',
  },

  // ══ مبالغ بالا ══
  {
    key: 'deposit.large_transfer.min_amount',
    value: '4000000000',
    description: 'حداقل مبلغ واریز مبالغ بالا (ریال)',
  },
  {
    key: 'deposit.large_transfer.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد مبالغ بالا',
  },
  {
    key: 'deposit.large_transfer.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد مبالغ بالا',
  },

  // ══ واریز مستقیم ══
  {
    key: 'deposit.direct.daily_limit',
    value: '150000000',
    description: 'سقف واریز مستقیم روزانه (ریال)',
  },
  {
    key: 'deposit.direct.destination_card',
    value: '6037707500624484',
    description: 'شماره کارت مقصد واریز مستقیم',
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
    description: 'حداکثر مبلغ برداشت در یک تراکنش (ریال)',
  },
  {
    key: 'withdrawal.processing_time',
    value: 'سیکل پایا - روزهای کاری بین ۱۲:۴۵ تا ۱۳:۴۵',
    description: 'زمان پردازش برداشت',
  },

  // ══ معاملات طلا ══
  {
    key: 'trade.gold.min_grams',
    value: '0.1',
    description: 'حداقل مقدار خرید/فروش طلا (گرم)',
  },
  {
    key: 'trade.gold.max_grams',
    value: '1000',
    description: 'حداکثر مقدار خرید/فروش طلا در یک معامله (گرم)',
  },
  {
    key: 'trade.gold.spread_percent',
    value: '0.3',
    description: 'اسپرد خرید/فروش طلا (درصد)',
  },
  {
    key: 'trade.lock_duration_seconds',
    value: '120',
    description: 'مدت زمان قفل قیمت (ثانیه)',
  },
  {
    key: 'trade.gold.daily_buy_limit_grams',
    value: '50',
    description: 'سقف خرید روزانه طلا (گرم)',
  },
  {
    key: 'trade.gold.daily_sell_limit_grams',
    value: '50',
    description: 'سقف فروش روزانه طلا (گرم)',
  },
  {
    key: 'trade.gold.monthly_buy_limit_grams',
    value: '500',
    description: 'سقف خرید ماهانه طلا (گرم)',
  },
  {
    key: 'trade.gold.monthly_sell_limit_grams',
    value: '500',
    description: 'سقف فروش ماهانه طلا (گرم)',
  },

  // ══ کارمزد و مالیات ══
  { key: 'fee.buy_gold', value: '1.0', description: 'کارمزد خرید طلا (درصد)' },
  { key: 'fee.sell_gold', value: '1.0', description: 'کارمزد فروش طلا (درصد)' },
  { key: 'tax.buy', value: '0', description: 'مالیات خرید طلا (درصد)' },
  { key: 'tax.sell', value: '0', description: 'مالیات فروش طلا (درصد)' },
];
