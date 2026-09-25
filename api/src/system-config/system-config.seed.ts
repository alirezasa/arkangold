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
  {
    key: 'deposit.card_to_card.enabled',
    value: 'true',
    description: 'فعال بودن واریز کارت به کارت',
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
  {
    key: 'deposit.bank_transfer.enabled',
    value: 'true',
    description: 'فعال بودن واریز حساب به حساب',
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
  {
    key: 'deposit.tracking_id.enabled',
    value: 'true',
    description: 'فعال بودن واریز شناسه‌دار',
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
  {
    key: 'deposit.large_transfer.enabled',
    value: 'true',
    description: 'فعال بودن واریز مبالغ بالا (پیش‌فاکتور)',
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
  {
    key: 'deposit.direct.enabled',
    value: 'true',
    description: 'فعال بودن واریز مستقیم',
  },

  // ══ زمان نشست‌ها (Session) ══
  {
    key: 'session.user.timeout_minutes',
    value: '15',
    description:
      'مدت اعتبار نشست کاربران پس از ورود (دقیقه؛ بین ۵ تا ۱۴۴۰) — پس از آن کاربر باید دوباره وارد شود',
  },
  {
    key: 'session.user.refresh_days',
    value: '7',
    description: 'حداکثر عمر توکن تمدید (Refresh) کاربران (روز؛ بین ۱ تا ۹۰)',
  },
  {
    key: 'session.admin.timeout_minutes',
    value: '30',
    description:
      'مدت اعتبار نشست ادمین‌ها پس از ورود (دقیقه؛ بین ۵ تا ۴۸۰) — پس از آن ادمین باید دوباره وارد شود',
  },
  {
    key: 'session.admin.refresh_hours',
    value: '24',
    description:
      'حداکثر عمر توکن تمدید (Refresh) ادمین‌ها (ساعت؛ بین ۱ تا ۱۶۸)',
  },

  // ══ خدمات صفحه اصلی اپلیکیشن (بنرها) ══
  {
    key: 'service.melted_gold.enabled',
    value: 'true',
    description: 'فعال بودن خدمت «طلای آب‌شده» (بنر و صفحه)',
  },
  {
    key: 'service.gold_ingot.enabled',
    value: 'true',
    description: 'فعال بودن خدمت «شمش طلا» (بنر و صفحه)',
  },
  {
    key: 'service.jewelry.enabled',
    value: 'true',
    description: 'فعال بودن خدمت «زیورآلات» (بنر و فروشگاه)',
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

  // ══ احراز هویت (KYC) ══
  {
    key: 'identity.finotech.sandbox',
    value: 'true',
    description: 'حالت آزمایشی (Sandbox) استعلام اطلاعات هویتی فینوتک',
  },

  {
    key: 'payment.gateway.callback_base_url',
    value: 'http://localhost:5000',
    description:
      'آدرس پایه API (نه فرانت) برای callback درگاه‌ها — کنترلر خودش کاربر را به فرانت ریدایرکت می‌کند',
  },

  // ══ انتقال داخلی کیف پول (فقط طلا — انتقال ریالی/تومانی مجاز نیست) ══
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

  // ══ پاداش دعوت از دوستان (Referral) ══
  // از صفحه «دعوت از دوستان» پنل ادمین هم قابل تنظیم است
  {
    key: 'referral.enabled',
    value: 'true',
    description: 'فعال بودن پرداخت پاداش دعوت از دوستان',
  },
  {
    key: 'referral.reward_trigger',
    value: 'IDENTITY_VERIFIED',
    description:
      'زمان پرداخت پاداش به معرف: IDENTITY_VERIFIED = پس از احراز هویت دوست دعوت‌شده، SIGNUP = بلافاصله پس از ثبت‌نام',
  },
  {
    key: 'referral.reward_amount_rial',
    value: '0',
    description:
      'پاداش ریالی هر دعوت که به کیف پول ریالی معرف واریز می‌شود (ریال) — صفر یعنی بدون پاداش ریالی',
  },
  {
    key: 'referral.reward_amount_mg',
    value: '0',
    description:
      'پاداش طلایی هر دعوت که به کیف پول طلای معرف واریز می‌شود (میلی‌گرم) — صفر یعنی بدون پاداش طلایی',
  },
  {
    key: 'company.legal_name',
    value: 'گنجینه طلای پروانه زر',
    description: 'نام حقوقی شرکت',
  },
  { key: 'company.brand_name', value: 'آرکان گلد', description: 'نام تجاری' },
  {
    key: 'company.company_type',
    value: '',
    description: 'نوع شرکت (سهامی خاص / مسئولیت محدود)',
  },
  {
    key: 'company.national_id',
    value: '',
    description: 'شناسه ملی — الزامی برای صدور سند',
  },
  {
    key: 'company.registration_number',
    value: '',
    description: 'شماره ثبت — الزامی',
  },
  { key: 'company.economic_code', value: '', description: 'کد اقتصادی' },
  {
    key: 'company.address',
    value: '',
    description: 'نشانی دفتر مرکزی — الزامی',
  },
  { key: 'company.postal_code', value: '', description: 'کد پستی' },
  { key: 'company.phone', value: '', description: 'تلفن' },
  { key: 'company.website', value: 'arkan.gold', description: 'وب‌سایت' },
  {
    key: 'company.logo_path',
    value: '/logo.png',
    description: 'مسیر لوگو در public',
  },
  {
    key: 'company.seal_image_path',
    value: '/brand/seal.png',
    description: 'مسیر تصویر مهر و امضا در public',
  },

  // ══ اسناد ══
  {
    key: 'document.verify_base_url',
    value: 'https://arkan.gold/verify',
    description: 'آدرس پایه استعلام سند (QR)',
  },
  {
    key: 'document.invoice_orientation',
    value: 'landscape',
    description: 'جهت چاپ فاکتور فروش: landscape | portrait',
  },
  {
    key: 'document.proforma_orientation',
    value: 'portrait',
    description: 'جهت چاپ پیش‌فاکتور: portrait | landscape',
  },

  // ══ پیش‌فاکتور واریز ══
  {
    key: 'proforma.validity_working_days',
    value: '2',
    description: 'مهلت اعتبار پیش‌فاکتور بر حسب روز کاری',
  },
  {
    key: 'proforma.tracking_prefix',
    value: '1023',
    description: 'پیشوند ۴ رقمی شناسه واریز (کد پذیرنده)',
  },
  {
    key: 'proforma.subject_text',
    value:
      'درخواست واریز وجه جهت شارژ کیف پول تومانی و انجام خرید طلا از طریق پلتفرم آرکان گلد',
    description: 'متن ستون «موضوع» در پیش‌فاکتور',
  },
  {
    key: 'proforma.legal_clauses',
    value: [
      'این پیش‌فاکتور صرفاً به منظور ارائه به بانک و در راستای تسهیل فرآیند واریز وجه از حساب شخصی متقاضی به حساب شرکت صادر شده است و به هیچ عنوان به منزله فاکتور قطعی، تعهد به فروش، یا انجام معامله نهایی تلقی نمی‌گردد.',
      'واریز به حساب مذکور با هدف افزایش موجودی «کیف پول تومانی» حساب کاربری متقاضی در «آرکان گلد» و جهت خرید برخط طلا می‌باشد.',
      'پس از انجام موفق تراکنش بانکی و تکمیل عملیات واریز وجه به حساب شرکت، مبلغ واریز شده مطابق ضوابط سامانه و در چرخه پایا به «کیف پول تومانی» متقاضی افزوده خواهد شد.',
      'واریز باید صرفاً از حساب بانکی متعلق به همین شخص انجام شود؛ واریز از حساب شخص ثالث پذیرفته نمی‌شود و مبلغ عیناً مسترد خواهد شد.',
      'شناسه واریز اختصاصی مندرج در این سند باید حتماً در فیلد «شناسه پایا» درج شود؛ در غیر این صورت تطبیق و شارژ کیف پول با تاخیر مواجه خواهد شد.',
      'پس از افزایش موجودی تومانی، خرید طلا منوط به انجام کلیه فرآیندهای قانونی، نظارتی و عملیاتی مربوطه در سامانه «آرکان گلد» می‌باشد.',
      'این معرفی‌نامه و پیش‌فاکتور فاقد هرگونه تعهد مالی یا حقوقی مازاد بر مفاد مندرج بوده و صرفاً با هدف شفاف‌سازی مقصد واریز وجه و ارائه اطلاعات لازم به آن بانک محترم صادر شده است.',
    ].join('\n'),
    description: 'بندهای حقوقی پیش‌فاکتور — هر بند در یک خط',
  },

  // ══ حساب مقصد واریز مبالغ بالا ══
  // ⚠ تناقض شناسایی‌شده: کلیدهای deposit.* فعلی روی «یارا تجارت الکترونیک بنیان»
  //   تنظیم شده‌اند. اگر حساب واقعاً به نام «گنجینه طلای پروانه زر» است،
  //   این مقادیر باید اصلاح شوند وگرنه بانک واریز را رد می‌کند.
  {
    key: 'deposit.large_transfer.destination_owner',
    value: '',
    description: 'نام صاحب حساب مقصد — باید دقیقاً با نام روی شبا یکی باشد',
  },
  {
    key: 'deposit.large_transfer.destination_bank',
    value: '',
    description: 'نام بانک مقصد',
  },

  // ══ تقویم ══
  {
    key: 'calendar.holidays',
    value: '',
    description: 'تعطیلات رسمی، جدا شده با کاما — مثال: ۱۴۰۴/۰۱/۰۱,۱۴۰۴/۰۱/۰۲',
  },

  // ══ اصالت‌سنجی هولوگرام — امنیت استعلام عمومی ══
  {
    key: 'hologram.inquiry.rate_limit_per_minute',
    value: '5',
    description: 'حداکثر تعداد استعلام مجاز به ازای هر IP در هر دقیقه',
  },
  {
    key: 'hologram.inquiry.invalid_attempts_threshold',
    value: '5',
    description:
      'حداکثر تعداد استعلام نامعتبر مجاز به ازای هر IP پیش از مسدودسازی',
  },
  {
    key: 'hologram.inquiry.invalid_attempts_window_minutes',
    value: '60',
    description: 'بازه زمانی شمارش استعلام‌های نامعتبر برای مسدودسازی (دقیقه)',
  },
  {
    key: 'hologram.inquiry.block_duration_minutes',
    value: '1440',
    description:
      'مدت زمان مسدودسازی IP پس از عبور از آستانه استعلام نامعتبر (دقیقه)',
  },
  {
    key: 'hologram.transfer.expiry_hours',
    value: '72',
    description: 'مهلت تأیید گیرنده برای درخواست انتقال مالکیت شمش (ساعت)',
  },

  // ══ نمایندگان فروش ══
  {
    key: 'agent.sale.require_identity_verification',
    value: 'true',
    description:
      'استعلام اجباری هویت خریدار از ثبت احوال هنگام ثبت فروش توسط نماینده (true/false)',
  },
  {
    key: 'agent.sale.quote_ttl_seconds',
    value: '180',
    description:
      'مدت اعتبار قیمت استعلام‌شده برای ثبت فروش نماینده (ثانیه) — پس از آن باید دوباره استعلام شود',
  },
  {
    key: 'agent.sale.notify_buyer_sms',
    value: 'true',
    description:
      'ارسال پیامک ثبت مالکیت شمش و راهنمای ورود به پنل برای خریدار نهایی (true/false)',
  },

  // ══ بسته‌بندی ارسال فروشگاه ══
  {
    key: 'shop.packaging.free_threshold_rial',
    value: '0',
    description:
      'آستانه عمومی رایگان شدن بسته‌بندی: اگر جمع اقلام سفارش (ریال، پیش از کد تخفیف) به این مبلغ برسد، بسته‌بندی‌های مشمول رایگان می‌شوند — ۰ = غیرفعال',
  },

  // ══ حسابداری ══
  {
    key: 'accounting.locked_until',
    value: '',
    description:
      'تاریخ قفل دوره مالی (YYYY-MM-DD): ثبت سند دستی با تاریخ تا این روز مجاز نیست — خالی = بدون قفل',
  },
  {
    key: 'accounting.allow_self_approve',
    value: 'false',
    description:
      'اجازه‌ی تأیید سند دستی توسط همان کاربری که آن را ثبت کرده (کنترل دوگانه) — true/false',
  },

  // ══ خزانه و پوشش طلای آب‌شده ══
  {
    key: 'treasury.target_reserve_percent',
    value: '100',
    description:
      'درصد هدف پوشش طلای کاربران با طلای فیزیکی خزانه (۱۰۰ = پوشش کامل)',
  },
  {
    key: 'treasury.safety_buffer_grams',
    value: '0',
    description:
      'ذخیره‌ی احتیاطی مازاد بر بدهی طلایی کاربران (گرم ۷۵۰) که در گزارش خرید لحاظ می‌شود',
  },
  {
    key: 'treasury.purchase_lot_grams',
    value: '0',
    description:
      'واحد گرد کردن مقدار پیشنهادی خرید از بازار (گرم) — مثلاً ۱۰ یعنی مضرب ۱۰ گرم؛ ۰ = بدون گرد کردن',
  },
  {
    key: 'treasury.alert_coverage_percent',
    value: '95',
    description:
      'اگر نسبت پوشش خزانه از این درصد کمتر شود، هشدار خرید به مدیران مالی ارسال می‌شود',
  },

  {
    key: 'treasury.last_alert_date',
    value: '',
    description:
      'تاریخ آخرین پیامک هشدار کسری پوشش خزانه (سیستمی — برای جلوگیری از ارسال تکراری در یک روز)',
  },

  // ══ شرکای فروش (اقساطی / اپ‌های همکار) ══
  {
    key: 'partner.api.enabled',
    value: 'false',
    description:
      'فعال بودن API عمومی شرکای فروش (اسنپ‌پی، دیجی‌پی و اپ‌های همکار) — true/false',
  },
  {
    key: 'partner.quote_ttl_minutes',
    value: '30',
    description:
      'اعتبار قیمت سفارش‌های ثبت‌شده از API شرکا (دقیقه) — تأیید پس از این مدت رد می‌شود',
  },
  {
    key: 'partner.quote_spread_percent',
    value: '0',
    description:
      'اسپرد قیمت فروش طلای آب‌شده به مشتریان شرکا نسبت به قیمت لحظه‌ای (درصد)',
  },
  {
    key: 'partner.fee_percent',
    value: '0',
    description: 'کارمزد خدمات آرکان روی فروش از طریق شرکا (درصد از ارزش طلا)',
  },
];
