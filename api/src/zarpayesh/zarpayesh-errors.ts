// api/src/zarpayesh/zarpayesh-errors.ts
import { zarPayeshErrorText } from './zarpayesh.constants';

export type ZarPayeshErrorKind =
  /** تنظیمات/اعتبارنامه ناقص یا اتصال غیرفعال */
  | 'CONFIGURATION'
  /** ورود ناموفق یا توکن نامعتبر */
  | 'AUTHENTICATION'
  /** رد درخواست با کد خطای مستند (۱۰۰۱ تا ۱۰۹۹) یا HTTP 4xx */
  | 'REJECTED'
  /** Timeout — ممکن است درخواست در سامانه ناظر اجرا شده باشد (نتیجه نامشخص) */
  | 'TIMEOUT'
  /** پاسخ دریافت نشد (قطعی شبکه/DNS) — نتیجه نامشخص */
  | 'CONNECTION'
  /** HTTP 5xx یا خطای سیستمی ۱۰۹۹ */
  | 'SERVER'
  /** پاسخ غیرقابل تفسیر */
  | 'INVALID_RESPONSE'
  /** رمزنگاری کد ملی/موبایل */
  | 'CRYPTO'
  /** داده‌ی کاربر برای ارسال ناقص/نامعتبر است */
  | 'VALIDATION';

/** خطای سامانه ناظر؛ code همان کد مستند (مثل 1005) یا null */
export class ZarPayeshError extends Error {
  constructor(
    message: string,
    public readonly kind: ZarPayeshErrorKind,
    public readonly code: number | null = null,
    public readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'ZarPayeshError';
  }

  /** نتیجه‌ی واقعی درخواست در سامانه ناظر نامشخص است (باید با Followup بررسی شود) */
  get uncertain(): boolean {
    return (
      this.kind === 'TIMEOUT' ||
      this.kind === 'CONNECTION' ||
      (this.kind === 'SERVER' && this.code == null)
    );
  }

  /** کد قابل ذخیره در لاگ/رکورد */
  get logCode(): string {
    return this.code != null ? String(this.code) : this.kind;
  }

  static fromCode(
    code: number,
    serverMessage?: string | null,
    httpStatus?: number | null,
  ): ZarPayeshError {
    const text = zarPayeshErrorText(code);
    const message = text
      ? `${code}: ${text}`
      : `${code}: ${serverMessage || 'خطای ناشناخته سامانه ناظر'}`;
    const kind: ZarPayeshErrorKind =
      code === 1099
        ? 'SERVER'
        : code === 1032 || code === 1009
          ? 'AUTHENTICATION'
          : 'REJECTED';
    return new ZarPayeshError(message, kind, code, httpStatus ?? null);
  }
}

/** پیام کاربرپسند برای نمایش به مشتری هنگام رد معامله */
export function userFacingTradeMessage(err: unknown): string {
  if (err instanceof ZarPayeshError) {
    switch (err.code) {
      case 1005:
      case 1052:
        return 'موجودی شما در سامانه ناظر بر معاملات طلا برای این معامله کافی نیست. لطفاً با پشتیبانی تماس بگیرید';
      case 1004:
      case 1049:
        return 'موجودی قابل معامله‌ی آرکان گلد در سامانه ناظر برای این مقدار کافی نیست. لطفاً مقدار کمتری را امتحان کنید یا بعداً تلاش کنید';
      case 1041:
      case 1042:
      case 1044:
      case 1050:
        return 'مبلغ این معامله خارج از سقف مجاز تعیین‌شده توسط سامانه ناظر است';
      case 1043:
      case 1045:
        return 'تعداد معاملات مجاز شما در سامانه ناظر برای این بازه تکمیل شده است';
      case 1033:
        return 'معامله در این ساعت توسط سامانه ناظر مجاز نیست';
      case 1010:
        return 'حساب شما در سامانه ناظر بر معاملات طلا فعلاً اجازه‌ی معامله ندارد';
      case 1054:
      case 1002:
        return 'اطلاعات هویتی شما در سامانه ناظر بر معاملات طلا ثبت نشده یا نامعتبر است. لطفاً با پشتیبانی تماس بگیرید';
      default:
        break;
    }
    if (err.kind === 'VALIDATION') return err.message;
  }
  return 'ثبت معامله در سامانه ناظر بر معاملات طلا با خطا مواجه شد و معامله انجام نشد. لطفاً چند لحظه دیگر دوباره تلاش کنید';
}
