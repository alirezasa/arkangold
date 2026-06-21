export const WALLET_CONFIG_DEFAULTS = [
  // ── واریز آنلاین (درگاه) ──
  {
    key: 'deposit.online.daily_limit',
    value: '400000000',
    description: 'سقف واریز روزانه درگاه آنلاین (ریال)',
  },
  {
    key: 'deposit.online.min_amount',
    value: '100000',
    description: 'حداقل مبلغ واریز آنلاین (ریال)',
  },
  {
    key: 'deposit.online.max_amount',
    value: '400000000',
    description: 'حداکثر مبلغ واریز آنلاین در یک تراکنش (ریال)',
  },
  {
    key: 'deposit.online.enabled',
    value: 'false',
    description: 'فعال بودن درگاه آنلاین',
  },

  // ── کارت به کارت ──
  {
    key: 'deposit.card_to_card.daily_limit',
    value: '150000000',
    description: 'سقف واریز روزانه کارت به کارت (ریال)',
  },
  {
    key: 'deposit.card_to_card.min_amount',
    value: '100000',
    description: 'حداقل مبلغ واریز کارت به کارت (ریال)',
  },
  {
    key: 'deposit.card_to_card.max_amount',
    value: '150000000',
    description: 'حداکثر مبلغ واریز کارت به کارت در یک تراکنش (ریال)',
  },
  {
    key: 'deposit.card_to_card.destination_card',
    value: '6037707500624484',
    description: 'شماره کارت مقصد برای واریز کارت به کارت',
  },
  {
    key: 'deposit.card_to_card.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب کارت مقصد',
  },
  {
    key: 'deposit.card_to_card.processing_time',
    value: 'کمتر از ۱۵ دقیقه',
    description: 'زمان پردازش واریز کارت به کارت',
  },

  // ── حساب به حساب ──
  {
    key: 'deposit.bank_transfer.daily_limit',
    value: '0',
    description: 'سقف واریز روزانه حساب به حساب (۰ = بدون محدودیت)',
  },
  {
    key: 'deposit.bank_transfer.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد برای واریز حساب به حساب',
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
    description: 'زمان پردازش واریز حساب به حساب',
  },

  // ── واریز شناسه‌دار ──
  {
    key: 'deposit.tracking_id.daily_limit',
    value: '4000000000',
    description: 'سقف واریز روزانه شناسه‌دار (ریال)',
  },
  {
    key: 'deposit.tracking_id.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد برای واریز شناسه‌دار',
  },
  {
    key: 'deposit.tracking_id.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد برای واریز شناسه‌دار',
  },
  {
    key: 'deposit.tracking_id.destination_owner',
    value: 'بانک کشاورزی - یارا تجارت الکترونیک بنیان',
    description: 'نام صاحب حساب مقصد شناسه‌دار',
  },

  // ── مبالغ بالا (پیش‌فاکتور) ──
  {
    key: 'deposit.large_transfer.min_amount',
    value: '4000000000',
    description: 'حداقل مبلغ برای واریز مبالغ بالا (ریال)',
  },
  {
    key: 'deposit.large_transfer.destination_account',
    value: '1128175516',
    description: 'شماره حساب مقصد واریز مبالغ بالا',
  },
  {
    key: 'deposit.large_transfer.destination_sheba',
    value: 'IR370160000000001128175516',
    description: 'شماره شبا مقصد واریز مبالغ بالا',
  },

  // ── واریز مستقیم ──
  {
    key: 'deposit.direct.daily_limit',
    value: '150000000',
    description: 'سقف واریز روزانه مستقیم (ریال)',
  },
  {
    key: 'deposit.direct.destination_card',
    value: '6037707500624484',
    description: 'شماره کارت مقصد واریز مستقیم',
  },

  // ── برداشت ──
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
];
