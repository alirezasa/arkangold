// api/src/notifications/sms-templates.catalog.ts
//
// فهرست رویدادهای پیامکی سیستم و متن پیش‌فرض هر کدام.
// - ردیف هر رویداد هنگام استارت در جدول sms_templates ساخته می‌شود (اگر وجود نداشته باشد)؛
//   متن، فعال/غیرفعال بودن، سامانه‌ی ارسال و شناسه‌ی قالب سامانه از پنل ادمین تغییر می‌کند
//   و با Restart بازنویسی نمی‌شود.
// - متغیرها با {name} در متن قرار می‌گیرند. {brand} (نام تجاری از تنظیمات شرکت) همیشه در دسترس است.
// - در حالت PATTERN، نام پارامترهای قالب در پنل قاصدک/sms.ir باید دقیقاً همین نام متغیرها باشد.

export type SmsTemplateCategory =
  'AUTH' | 'SECURITY' | 'ORDER' | 'FINANCE' | 'AGENT' | 'GENERAL';

export interface SmsVariableDef {
  name: string;
  label: string;
  sample: string;
}

export interface SmsTemplateDef {
  key: string;
  title: string;
  category: SmsTemplateCategory;
  body: string;
  variables: SmsVariableDef[];
  /** متن حاوی کد یکبارمصرف — در لاگ ماسک می‌شود و شکست ارسال به فراخواننده گزارش می‌شود */
  sensitive?: boolean;
  /** پیش‌فرض فعال بودن (رویدادهای اختیاری غیرفعال ساخته می‌شوند) */
  defaultActive?: boolean;
}

const V = {
  brand: { name: 'brand', label: 'نام تجاری', sample: 'آرکان گلد' },
  name: { name: 'name', label: 'نام کاربر', sample: 'علی رضایی' },
  code: { name: 'code', label: 'کد یکبارمصرف', sample: '482915' },
  cardLast4: { name: 'cardLast4', label: '۴ رقم آخر کارت', sample: '4437' },
  orderNumber: {
    name: 'orderNumber',
    label: 'شماره سفارش',
    sample: 'AG-1405-SHO-000128',
  },
  amount: { name: 'amount', label: 'مبلغ (تومان)', sample: '۱۲,۵۰۰,۰۰۰' },
  carrier: { name: 'carrier', label: 'روش/شرکت ارسال', sample: 'پست پیشتاز' },
  trackingCode: {
    name: 'trackingCode',
    label: 'کد رهگیری مرسوله',
    sample: '123456789012345678',
  },
  trackingUrl: {
    name: 'trackingUrl',
    label: 'لینک رهگیری',
    sample: 'https://tracking.post.ir',
  },
  deliveryCode: { name: 'deliveryCode', label: 'کد تحویل', sample: '7391' },
  reason: { name: 'reason', label: 'دلیل', sample: 'عدم تطابق اطلاعات' },
  requestNumber: {
    name: 'requestNumber',
    label: 'شماره درخواست',
    sample: 'AG-1405-WDR-000045',
  },
  bankRef: {
    name: 'bankRef',
    label: 'شماره پیگیری بانک',
    sample: '140507120001',
  },
  courierName: { name: 'courierName', label: 'نام پیک', sample: 'محمد احمدی' },
  courierPhone: {
    name: 'courierPhone',
    label: 'موبایل پیک',
    sample: '09121234567',
  },
  link: {
    name: 'link',
    label: 'لینک',
    sample: 'https://app.arkan.gold/courier/abc',
  },
  contractNumber: {
    name: 'contractNumber',
    label: 'شماره قرارداد',
    sample: 'AG-1405-CTR-000012',
  },
  agentName: {
    name: 'agentName',
    label: 'نام نماینده',
    sample: 'طلای پارسیان',
  },
  customerName: {
    name: 'customerName',
    label: 'نام مشتری',
    sample: 'علی رضایی',
  },
  device: {
    name: 'device',
    label: 'دستگاه/مرورگر',
    sample: 'Chrome روی Android',
  },
  ip: { name: 'ip', label: 'IP (ماسک‌شده)', sample: '5.112.x.x' },
  time: { name: 'time', label: 'زمان', sample: '۱۴۰۵/۰۷/۱۳ ساعت ۱۰:۲۴' },
  count: { name: 'count', label: 'تعداد', sample: '۵' },
  change: {
    name: 'change',
    label: 'تغییر امنیتی',
    sample: 'ورود دومرحله‌ای فعال شد',
  },
  username: { name: 'username', label: 'نام کاربری', sample: 'r.ahmadi' },
  tempPassword: {
    name: 'tempPassword',
    label: 'رمز موقت',
    sample: 'Kp7v-Q2mX-9wTz-Hd4r',
  },
  hours: { name: 'hours', label: 'مدت اعتبار (ساعت)', sample: '۲۴' },
  panelUrl: {
    name: 'panelUrl',
    label: 'نشانی پنل',
    sample: 'admin.arkan.gold',
  },
  item: {
    name: 'item',
    label: 'اعتبارنامه',
    sample: 'کلید API شریک «اسنپ‌پی»',
  },
  partnerName: { name: 'partnerName', label: 'نام شریک', sample: 'اسنپ‌پی' },
  keyPrefix: {
    name: 'keyPrefix',
    label: 'پیشوند کلید',
    sample: 'ak_live_7f3a9c',
  },
  days: { name: 'days', label: 'روزهای باقی‌مانده', sample: '۱۵' },
  date: { name: 'date', label: 'تاریخ انقضا', sample: '۱۴۰۵/۰۸/۰۱' },
} satisfies Record<string, SmsVariableDef>;

export const SMS_TEMPLATE_CATALOG: SmsTemplateDef[] = [
  // ─────────────────────────── احراز هویت ───────────────────────────
  {
    key: 'AUTH_LOGIN_OTP',
    title: 'کد ورود',
    category: 'AUTH',
    body: '{brand}\nکد ورود شما: {code}\nاین کد را در اختیار دیگران قرار ندهید.',
    variables: [V.code, V.brand],
    sensitive: true,
  },
  {
    key: 'AUTH_REGISTER_OTP',
    title: 'کد ثبت‌نام',
    category: 'AUTH',
    body: '{brand}\nکد تأیید ثبت‌نام: {code}',
    variables: [V.code, V.brand],
    sensitive: true,
  },
  {
    key: 'AUTH_RESET_PASSWORD_OTP',
    title: 'کد بازیابی رمز عبور',
    category: 'AUTH',
    body: '{brand}\nکد بازیابی رمز عبور: {code}\nاگر این درخواست از طرف شما نیست، به پشتیبانی اطلاع دهید.',
    variables: [V.code, V.brand],
    sensitive: true,
  },
  {
    key: 'AUTH_CHANGE_PHONE_OTP',
    title: 'کد تأیید تغییر شماره موبایل',
    category: 'AUTH',
    body: '{brand}\nکد تأیید ثبت این شماره برای حساب کاربری شما: {code}\nاگر این درخواست از طرف شما نیست، آن را نادیده بگیرید.',
    variables: [V.code, V.brand],
    sensitive: true,
  },

  // ─────────────────────────── هشدارهای امنیتی (FIA) ───────────────────────────
  {
    key: 'AUTH_NEW_DEVICE_LOGIN',
    title: 'ورود از دستگاه جدید',
    category: 'SECURITY',
    body: '{name} عزیز، ورود جدید به حساب شما در {brand}\nدستگاه: {device}\nIP: {ip}\nزمان: {time}\nاگر شما نبودید، فوراً رمز عبور را تغییر دهید و با پشتیبانی تماس بگیرید.',
    variables: [V.name, V.device, V.ip, V.time, V.brand],
    defaultActive: true,
  },
  {
    key: 'AUTH_FAILED_ATTEMPTS_ALERT',
    title: 'تلاش‌های ناموفق ورود',
    category: 'SECURITY',
    body: '{name} عزیز، {count} تلاش ناموفق برای ورود به حساب شما در {brand} ثبت شد (آخرین IP: {ip}، {time}). اگر شما نبودید، رمز عبور خود را تغییر دهید و ورود دومرحله‌ای را فعال کنید.',
    variables: [V.name, V.count, V.ip, V.time, V.brand],
    defaultActive: true,
  },
  {
    key: 'AUTH_SECURITY_CHANGE',
    title: 'تغییر تنظیمات امنیتی حساب',
    category: 'SECURITY',
    body: '{name} عزیز، تغییر امنیتی در حساب {brand}: {change}\nزمان: {time}\nاگر این تغییر توسط شما انجام نشده، فوراً با پشتیبانی تماس بگیرید.',
    variables: [V.name, V.change, V.time, V.brand],
    defaultActive: true,
  },
  {
    key: 'ADMIN_TEMP_PASSWORD',
    title: 'رمز موقت حساب پنل مدیریت/نمایندگی',
    category: 'SECURITY',
    body: '{brand}\n{name} گرامی، رمز موقت حساب {username}: {tempPassword}\nاین رمز {hours} ساعت اعتبار دارد و در اولین ورود ({panelUrl}) باید تغییر کند. آن را در اختیار هیچ‌کس قرار ندهید.',
    variables: [
      V.name,
      V.username,
      V.tempPassword,
      V.hours,
      V.panelUrl,
      V.brand,
    ],
    sensitive: true,
  },
  {
    key: 'ADMIN_NEW_DEVICE_LOGIN',
    title: 'ورود ادمین از دستگاه جدید',
    category: 'SECURITY',
    body: '{brand}\n{name} گرامی، ورود جدید به حساب {username} در پنل\nدستگاه: {device}\nIP: {ip}\nزمان: {time}\nاگر شما نبودید، فوراً به مدیر امنیت اطلاع دهید.',
    variables: [V.name, V.username, V.device, V.ip, V.time, V.brand],
    defaultActive: true,
  },
  {
    key: 'ADMIN_FAILED_ATTEMPTS_ALERT',
    title: 'تلاش‌های ناموفق ورود به پنل',
    category: 'SECURITY',
    body: '{brand}\n{name} گرامی، {count} تلاش ناموفق برای ورود به حساب {username} ثبت شد (آخرین IP: {ip}، {time}).',
    variables: [V.name, V.count, V.username, V.ip, V.time, V.brand],
    defaultActive: true,
  },
  {
    key: 'ADMIN_SECURITY_CHANGE',
    title: 'تغییر امنیتی حساب پنل',
    category: 'SECURITY',
    body: '{brand}\n{name} گرامی، تغییر امنیتی در حساب {username}: {change}\nزمان: {time}',
    variables: [V.name, V.username, V.change, V.time, V.brand],
    defaultActive: true,
  },
  {
    key: 'PARTNER_API_KEY_EXPIRING',
    title: 'یادآوری انقضای کلید API شریک',
    category: 'SECURITY',
    body: '{partnerName} گرامی، کلید API شما در {brand} (پیشوند {keyPrefix}) {days} روز دیگر در تاریخ {date} منقضی می‌شود. برای دریافت کلید جدید پیش از این تاریخ با مدیر حساب خود تماس بگیرید؛ پس از انقضا درخواست‌های API پذیرفته نمی‌شوند.',
    variables: [V.partnerName, V.keyPrefix, V.days, V.date, V.brand],
    defaultActive: true,
  },
  {
    key: 'ADMIN_EXPIRY_ALERT',
    title: 'یادآوری انقضای اعتبارنامه (مدیران امنیت)',
    category: 'SECURITY',
    body: '{brand}\nیادآوری انقضا: {item}\n{days} روز باقی‌مانده (تا {date}). برای تمدید به پنل مدیریت ← «امنیت و رمزنگاری» مراجعه کنید.',
    variables: [V.item, V.days, V.date, V.brand],
    defaultActive: true,
  },

  // ─────────────────────────── سفارشات فروشگاه ───────────────────────────
  {
    key: 'SHOP_ORDER_CREATED',
    title: 'ثبت سفارش (در انتظار پرداخت)',
    category: 'ORDER',
    body: '{name} عزیز، سفارش {orderNumber} به مبلغ {amount} تومان ثبت شد و در انتظار پرداخت است.\n{brand}',
    variables: [V.name, V.orderNumber, V.amount, V.brand],
    defaultActive: false,
  },
  {
    key: 'SHOP_ORDER_PAID',
    title: 'پرداخت موفق سفارش',
    category: 'ORDER',
    body: '{name} عزیز، پرداخت سفارش {orderNumber} به مبلغ {amount} تومان با موفقیت انجام شد. سفارش شما در صف آماده‌سازی است.\n{brand}',
    variables: [V.name, V.orderNumber, V.amount, V.brand],
  },
  {
    key: 'SHOP_ORDER_PROCESSING',
    title: 'شروع آماده‌سازی سفارش',
    category: 'ORDER',
    body: '{name} عزیز، سفارش {orderNumber} در حال آماده‌سازی و بسته‌بندی است.\n{brand}',
    variables: [V.name, V.orderNumber, V.brand],
  },
  {
    key: 'SHOP_ORDER_SHIPPED',
    title: 'ارسال سفارش (پست / پیک)',
    category: 'ORDER',
    body: '{name} عزیز، سفارش {orderNumber} از طریق {carrier} ارسال شد.\nکد رهگیری: {trackingCode}\nکد تحویل شما: {deliveryCode}\nهنگام دریافت مرسوله، این کد را به مأمور تحویل بگویید و آن را در اختیار دیگران قرار ندهید.\n{brand}',
    variables: [
      V.name,
      V.orderNumber,
      V.carrier,
      V.trackingCode,
      V.trackingUrl,
      V.deliveryCode,
      V.brand,
    ],
  },
  {
    key: 'SHOP_ORDER_READY_FOR_PICKUP',
    title: 'آماده‌ی تحویل حضوری',
    category: 'ORDER',
    body: '{name} عزیز، سفارش {orderNumber} آماده‌ی تحویل حضوری است.\nکد تحویل شما: {deliveryCode}\nهنگام مراجعه همراه با کارت ملی این کد را ارائه کنید.\n{brand}',
    variables: [V.name, V.orderNumber, V.deliveryCode, V.brand],
  },
  {
    key: 'SHOP_ORDER_DELIVERY_CODE',
    title: 'ارسال مجدد کد تحویل',
    category: 'ORDER',
    body: '{brand}\nکد تحویل سفارش {orderNumber}: {deliveryCode}\nاین کد را فقط هنگام دریافت مرسوله به مأمور تحویل بگویید.',
    variables: [V.orderNumber, V.deliveryCode, V.brand],
    sensitive: true,
  },
  {
    key: 'SHOP_ORDER_COURIER_ASSIGNED',
    title: 'ارسال اطلاعات مرسوله برای پیک',
    category: 'ORDER',
    body: '{brand}\nتحویل سفارش {orderNumber} به {customerName}\nپس از دریافت کد تحویل از مشتری، از این لینک تحویل را ثبت کنید:\n{link}',
    variables: [V.orderNumber, V.customerName, V.link, V.brand],
  },
  {
    key: 'SHOP_ORDER_DELIVERED',
    title: 'تحویل سفارش',
    category: 'ORDER',
    body: '{name} عزیز، سفارش {orderNumber} تحویل شد. از خرید شما سپاسگزاریم.\n{brand}',
    variables: [V.name, V.orderNumber, V.brand],
  },
  {
    key: 'SHOP_ORDER_CANCELLED',
    title: 'لغو سفارش',
    category: 'ORDER',
    body: '{name} عزیز، سفارش {orderNumber} لغو شد.{reason}\nدر صورت پرداخت، مبلغ به کیف پول شما بازگردانده شده است.\n{brand}',
    variables: [V.name, V.orderNumber, V.reason, V.brand],
  },

  // ─────────────────────────── مالی ───────────────────────────
  {
    key: 'DEPOSIT_APPROVED',
    title: 'تأیید واریز و شارژ کیف پول',
    category: 'FINANCE',
    body: '{name} عزیز، واریز {amount} تومان (درخواست {requestNumber}) تأیید و کیف پول شما شارژ شد.\n{brand}',
    variables: [V.name, V.amount, V.requestNumber, V.brand],
  },
  {
    key: 'DEPOSIT_REJECTED',
    title: 'رد درخواست واریز',
    category: 'FINANCE',
    body: '{name} عزیز، درخواست واریز {requestNumber} تأیید نشد.\nدلیل: {reason}\n{brand}',
    variables: [V.name, V.requestNumber, V.reason, V.brand],
  },
  {
    key: 'BANK_ACCOUNT_VERIFIED',
    title: 'تأیید کارت بانکی',
    category: 'FINANCE',
    body: '{name} عزیز، کارت بانکی {cardLast4}**** شما تأیید شد و برای برداشت قابل استفاده است.\n{brand}',
    variables: [V.name, V.cardLast4, V.brand],
  },
  {
    key: 'BANK_ACCOUNT_REJECTED',
    title: 'رد کارت بانکی',
    category: 'FINANCE',
    body: '{name} عزیز، کارت بانکی {cardLast4}**** شما تأیید نشد.\nدلیل: {reason}\n{brand}',
    variables: [V.name, V.cardLast4, V.reason, V.brand],
  },
  {
    key: 'WITHDRAWAL_REQUESTED',
    title: 'ثبت درخواست برداشت',
    category: 'FINANCE',
    body: '{name} عزیز، درخواست برداشت {amount} تومان با شماره {requestNumber} ثبت شد.\n{brand}',
    variables: [V.name, V.amount, V.requestNumber, V.brand],
    defaultActive: false,
  },
  {
    key: 'WITHDRAWAL_APPROVED',
    title: 'تأیید درخواست برداشت',
    category: 'FINANCE',
    body: '{name} عزیز، درخواست برداشت {requestNumber} به مبلغ {amount} تومان تأیید شد و در صف پرداخت بانکی قرار گرفت.\n{brand}',
    variables: [V.name, V.amount, V.requestNumber, V.brand],
  },
  {
    key: 'WITHDRAWAL_PAID',
    title: 'پرداخت برداشت به حساب بانکی',
    category: 'FINANCE',
    body: '{name} عزیز، مبلغ {amount} تومان (درخواست {requestNumber}) به حساب بانکی شما واریز شد.\nشماره پیگیری: {bankRef}\n{brand}',
    variables: [V.name, V.amount, V.requestNumber, V.bankRef, V.brand],
  },
  {
    key: 'WITHDRAWAL_REJECTED',
    title: 'رد درخواست برداشت',
    category: 'FINANCE',
    body: '{name} عزیز، درخواست برداشت {requestNumber} رد شد و مبلغ به موجودی قابل برداشت شما بازگشت.\nدلیل: {reason}\n{brand}',
    variables: [V.name, V.requestNumber, V.reason, V.brand],
  },

  {
    key: 'WITHDRAWAL_RETURNED',
    title: 'برگشت وجه برداشت از بانک',
    category: 'FINANCE',
    body: '{name} عزیز، مبلغ برداشت {requestNumber} از سوی بانک برگشت خورد و {amount} تومان به کیف پول شما بازگردانده شد.\nدلیل: {reason}\n{brand}',
    variables: [V.name, V.requestNumber, V.amount, V.reason, V.brand],
  },

  // ─────────────────────────── نمایندگان ───────────────────────────
  {
    key: 'AGENT_LOGIN_OTP',
    title: 'کد ورود به پنل نمایندگان',
    category: 'AGENT',
    body: '{brand}\nکد ورود به پنل نمایندگان: {code}\nاین کد را در اختیار دیگران قرار ندهید.',
    variables: [V.code, V.brand],
    sensitive: true,
  },
  {
    key: 'AGENT_CONTRACT_ISSUED',
    title: 'صدور قرارداد نمایندگی برای امضا',
    category: 'AGENT',
    body: '{agentName} گرامی، قرارداد نمایندگی شماره {contractNumber} برای شما صادر شد. لطفاً از پنل نمایندگی بخش «قراردادها» آن را مطالعه و امضا کنید.\n{brand}',
    variables: [V.agentName, V.contractNumber, V.brand],
  },
  {
    key: 'AGENT_CONTRACT_SIGN_OTP',
    title: 'کد امضای الکترونیک قرارداد',
    category: 'AGENT',
    body: '{brand}\nکد امضای قرارداد {contractNumber}: {code}\nبا وارد کردن این کد، مفاد قرارداد را می‌پذیرید. این کد را به هیچ‌کس ندهید.',
    variables: [V.code, V.contractNumber, V.brand],
    sensitive: true,
  },
  {
    key: 'AGENT_CONTRACT_SIGNED',
    title: 'تأیید امضای قرارداد',
    category: 'AGENT',
    body: '{agentName} گرامی، قرارداد {contractNumber} با موفقیت به‌صورت الکترونیک امضا شد.\n{brand}',
    variables: [V.agentName, V.contractNumber, V.brand],
  },
];

export const SMS_TEMPLATE_BY_KEY = new Map(
  SMS_TEMPLATE_CATALOG.map((t) => [t.key, t]),
);

export const SMS_CATEGORY_LABEL: Record<SmsTemplateCategory, string> = {
  AUTH: 'احراز هویت و ورود',
  SECURITY: 'هشدارهای امنیتی حساب',
  ORDER: 'سفارشات فروشگاه',
  FINANCE: 'واریز و برداشت',
  AGENT: 'نمایندگان',
  GENERAL: 'عمومی',
};
