// api/src/zarpayesh/zarpayesh.constants.ts
//
// ثابت‌های سامانه ناظر بر خرید و فروش بر خط طلا و نقره (زر پایش) — مطابق «API Developer Guide»
// نسخه‌ی ۳.۰.۰.۴ (پاییز ۱۴۰۵). نام مسیرها، فیلدها و جدول‌ها عیناً از مستند برداشته شده‌اند.

/** کد Provider در جدول integration_providers (فقط برای نگهداری رمزشده‌ی اعتبارنامه‌ها) */
export const ZARPAYESH_PROVIDER_CODE = 'ZARPAYESH';

/** کلیدهای اعتبارنامه‌ی سکو که سامانه ناظر در اختیار قرار می‌دهد */
export const ZARPAYESH_CREDENTIAL_KEYS = {
  /** فیلد account متد Login */
  ACCOUNT: 'ACCOUNT',
  /** فیلد password متد Login */
  PASSWORD: 'PASSWORD',
  /** کلید ۱۶ بایتی AES-128-GCM به‌صورت Hex (۳۲ کاراکتر) برای رمز کردن کد ملی و موبایل */
  AES_KEY: 'AES_KEY',
} as const;

export const ZARPAYESH_DEFAULT_BASE_URL = 'http://api.rpmms.ir';

/** متدهای مستند — کلید همان نام متد در مستند است و در لاگ‌ها ثبت می‌شود */
export const ZARPAYESH_ENDPOINTS = {
  // ── Account Methods ──
  Login: { method: 'POST', path: '/api/auth/session' },
  RefreshToken: { method: 'PUT', path: '/api/auth/session' },
  Logout: { method: 'DELETE', path: '/api/auth/session' },
  // ── Aurelink Methods ──
  Reserve: { method: 'POST', path: '/api/aure/Aurelink/Reserve' },
  Approve: { method: 'POST', path: '/api/aure/Aurelink/Approve' },
  Cancel: { method: 'POST', path: '/api/aure/Aurelink/Cancel' },
  TxnFollowup: { method: 'GET', path: '/api/aure/Aurelink/TxnFollowup' },
  GetUserBalance: { method: 'POST', path: '/api/aure/Aurelink/GetUserBalance' },
  MakeDeliveries: { method: 'POST', path: '/api/aure/Aurelink/MakeDeliveries' },
  MakeDeliverFollowup: {
    method: 'GET',
    path: '/api/aure/Aurelink/MakeDeliverFollowup',
  },
  SetDeliveries: { method: 'POST', path: '/api/aure/Aurelink/SetDeliveries' },
  GetDeliveries: { method: 'POST', path: '/api/aure/Aurelink/GetDeliveries' },
  Vaultlist: { method: 'GET', path: '/api/aure/Aurelink/Vaultlist' },
  AddPlatformUsers: {
    method: 'POST',
    path: '/api/aure/Aurelink/AddPlatformUsers',
  },
  EditPlatformUsers: {
    method: 'POST',
    path: '/api/aure/Aurelink/EditPlatformUsers',
  },
  Typelist: { method: 'GET', path: '/api/aure/Aurelink/Typelist' },
  cities: { method: 'GET', path: '/api/aure/Aurelink/cities' },
  states: { method: 'GET', path: '/api/aure/Aurelink/states' },
  PayTypelist: { method: 'GET', path: '/api/aure/Aurelink/PayTypelist' },
} as const;

export type ZarPayeshMethod = keyof typeof ZARPAYESH_ENDPOINTS;

/** Table 1: orderType */
export const ORDER_TYPE = {
  /** خرید کاربر از پلتفرم */
  USER_BUY: 1,
  /** فروش کاربر به پلتفرم */
  USER_SELL: 2,
} as const;

export const ORDER_TYPE_FA: Record<number, string> = {
  1: 'خرید کاربر از پلتفرم',
  2: 'فروش کاربر به پلتفرم',
};

/** Table 2: payType */
export const PAY_TYPE_FA: Record<number, string> = {
  1: 'ATM',
  2: 'پایانه فروشگاهی - POS',
  3: 'صفحه وب - IPG',
  4: 'کارت به کارت',
  5: 'پایا',
  6: 'ساتنا',
  7: 'چک بین بانکی',
  8: 'چک رمز دار',
  9: 'سامانه پل',
  10: 'ریال دیجیتال',
  11: 'کیف پول کاربر نزد سکو - wallet',
  12: 'هدیه',
};

/** Table 3: status (نتیجه‌ی Approve و وضعیت TxnFollowup) */
export const TXN_STATUS = {
  RESERVED: 1,
  APPROVED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
} as const;

export const TXN_STATUS_FA: Record<number, string> = {
  1: 'رزرو شده',
  2: 'تایید شده',
  3: 'ابطال شده',
  4: 'منقضی شده',
};

/** setStatusDeleveries در متد SetDeliveries */
export const DELIVERY_STATUS = {
  APPROVE: 1,
  SHIP: 2,
  DELIVERY: 3,
  CANCEL: 4,
} as const;

export const DELIVERY_STATUS_FA: Record<number, string> = {
  1: 'Approve — دارایی تحویل کاربر گردید',
  2: 'Ship — دارایی آماده ارسال',
  3: 'Delivery — دارایی ارسال شده',
  4: 'Cancel — ارسال دارایی لغو گردید',
};

/** لیست خطاهای مستند (صفحات ۲۴ و ۲۵) */
export const ZARPAYESH_ERROR_CODES: Record<number, string> = {
  1001: 'سکو مورد نظر در لیست سکوهای مجاز نمی باشد',
  1002: 'مشخصات کاربری با این کد ملی یافت نشد',
  1003: 'کد ارسالی خزانه در سامانه یافت نشد – خزانه ناشناس',
  1004: 'پلتفرم موجودی کافی برای ادامه عملیات را ندارد',
  1005: 'کاربر معرفی شده موجودی کافی ندارد',
  1006: 'اطلاعاتی با این کد رزرو یافت نشد',
  1007: 'تراکنش ناموفق – درخواست دوباره در همین لحظه تکرار گردد.',
  1008: 'کد رهگیری نامعتبر است',
  1009: 'مشخصات کاربری شما نامعتبر است',
  1010: 'کاربر فعلا اجازه فعالیت ندارد',
  1011: 'بدلیل ورود ناموفق بیشتر از ۵ بار – کاربر غیر فعال شده است',
  1012: 'مراحل تحویل کالا رعایت نگردیده است',
  1013: 'درخواست لغو در این مرحله قابل انجام نمیباشد',
  1014: 'این درخواست قابل انجام نمیباشد',
  1015: 'اقلام اطلاعاتی اجباری، ارسال نشده است',
  1016: 'کاربر ارسالی تکراری است.اطلاعات موجود میباشد',
  1017: 'درخواست مورد نظر شما منقضی شده است',
  1018: 'دارایی مورد نظر در لیست دارایی‌های مجاز نمی باشد',
  1019: 'شناسه نوع سفارش موجود نمی باشد.',
  1020: 'نوع ابزار پرداخت انتخابی موجود نمی باشد.',
  1021: 'نوع ابزار پرداخت انتخابی مجاز نمی باشد.',
  1022: 'کد تحویل کاربر معتبر نمی باشد. (در تراکنش تحویل فیزیکی)',
  1023: 'مبلغ ارسالی در متد تایید/خاتمه با مبلغ رزرو شده همخوان نمی باشد.',
  1024: 'نوع سفارش ارسالی در متد تایید/خاتمه با نوع سفارش رزرو شده همخوان نمی باشد.',
  1025: 'امکان لغو کردن تراکنشی که سابقاً نهایی شده است وجود ندارد.',
  1026: 'امکان تغییر وضعیت دارایی که تحویل مشتری شده است، وجود ندارد.',
  1027: 'امکان تغییر وضعیت دارایی که لغو شده است، وجود ندارد.',
  1028: 'به دلیل عدم مراجعه کاربر در زمان توافق شده برای تحویل دارایی، تراکنش به صورت خودکار لغو گردید.',
  1029: 'کد شهر معتبر نمی باشد.',
  1030: 'کد استان معتبر نمی باشد.',
  1031: 'کدملی/شناسه ملی قابل ویرایش نمی باشد.',
  1032: 'اطلاعات ارسالی لاگین اشتباه می باشد',
  1033: 'بازه زمانی برای فعالیت از سمت سکو رعایت نشده است',
  1034: 'وضعیت ارسالی تکراری است',
  1035: 'کد رهگیری و یا کد تحویل ارسالی نامعتبر است',
  1036: 'کدکپچا صحیح نمی باشد مجدد تلاش کنید',
  1037: 'کد ارسالی، تکراری می باشد (srcTrackingNumber)',
  1038: 'کد ارسالی، موجود می باشد (srcTrackingNumber)',
  1039: 'کد ارسالی پلتفرم در سامانه یافت نشد – پلتفرم ناشناس',
  1040: 'کد ارسالی دارایی در سامانه یافت نشد – دارایی ناشناس',
  1041: 'مبلغ تراکنش در هر معامله ، مغایر با حد تعیین شده میباشد',
  1042: 'سکو سقف مبلغی تراکنش را رعایت ننموده است',
  1043: 'سکو سقف تعدادی تراکنش را رعایت ننموده است',
  1044: 'کاربر سکو سقف مبلغی تراکنش را رعایت ننموده است',
  1045: 'کاربر سکو سقف تعدادی تراکنش را رعایت ننموده است',
  1046: 'خزانه مورد نظر در لیست سکوهای مجاز نمی باشد',
  1047: 'درخواست تکراری می باشد، برای آگاهی از آخرین وضعیت درخواست، متد Followup را فراخوانی نمایید.',
  1048: 'برداشت دارایی برای پلتفرم مدنظر مجاز نمی باشد',
  1049: 'میزان برداشت از دارایی پلتفرم، بیش از موجودی قابل برداشت می باشد',
  1050: 'محدوده مبلغی در هر تراکنش رعایت نگردیده است',
  1051: 'اطلاعات مربوط به سکوی شما هنوز بروزرسانی نشده است',
  1052: 'کاربر موجودی برای این دارایی ندارد',
  1053: 'مقدار رمز شده ارسالی ، قابل رمزگشایی نیست',
  1054: 'ساختار کد ملی صحیح نمیباشد',
  1099: 'خطای سیستمی',
};

/** خطاهایی که با تکرار همان درخواست (کمی بعد) ممکن است برطرف شوند */
export const RETRYABLE_ERROR_CODES = new Set([1007, 1099]);

/** خطاهای ورود — باید توکن/نشست کنار گذاشته شود */
export const AUTH_ERROR_CODES = new Set([1009, 1010, 1011, 1032, 1036]);

/** srcTrackingNumber تکراری — با شماره‌ی بعدی دوباره تلاش می‌شود */
export const DUPLICATE_TRACKING_CODES = new Set([1037, 1038]);

export function zarPayeshErrorText(code: number | string | null | undefined) {
  if (code == null) return null;
  return ZARPAYESH_ERROR_CODES[Number(code)] ?? null;
}
