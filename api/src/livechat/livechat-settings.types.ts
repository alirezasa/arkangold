// api/src/livechat/livechat-settings.types.ts
//
// ساختار تنظیمات چت آنلاین. مقدار ذخیره‌شده در livechat_settings.data همیشه با پیش‌فرض‌ها
// ادغام می‌شود تا افزودن تنظیم جدید در نسخه‌های بعد نیاز به مهاجرت داده نداشته باشد.

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // ۰ = شنبه ... ۶ = جمعه

export interface WorkingDay {
  day: WeekdayIndex;
  open: boolean;
  /** «HH:mm» به وقت تهران */
  start: string;
  end: string;
}

export interface LivechatSettingsData {
  /** کلید اصلی روشن/خاموش کردن چت در اپ */
  enabled: boolean;
  widget: {
    title: string;
    subtitle: string;
    offlineSubtitle: string;
    welcomeMessage: string;
    primaryColor: string;
    accentColor: string;
    position: 'left' | 'right';
    /** فاصله از لبه‌ی کناری و پایین صفحه (پیکسل) */
    offsetX: number;
    offsetBottom: number;
    launcherText: string;
    showLauncherText: boolean;
    showOnMobile: boolean;
    /** مسیرهایی از اپ که دکمه‌ی چت در آن‌ها نمایش داده نمی‌شود (پیشوند مسیر) */
    hiddenPaths: string[];
    showOperatorAvatar: boolean;
    soundEnabled: boolean;
    allowFileUpload: boolean;
    allowVisitorEndChat: boolean;
    composerPlaceholder: string;
  };
  bot: {
    enabled: boolean;
    /** پرسش آغازین منوی اصلی — «در چه موردی سوال دارید؟» */
    greeting: string;
    showMainMenuButton: boolean;
    mainMenuLabel: string;
    showOperatorButton: boolean;
    operatorButtonLabel: string;
    backLabel: string;
    /** رفتار با پیامی که بازدیدکننده در حالت ربات تایپ می‌کند */
    freeTextBehavior: 'smart' | 'handoff' | 'menu';
    fallbackText: string;
    handoffText: string;
  };
  smart: {
    enabled: boolean;
    /** حداقل امتیاز تطبیق برای پاسخ مستقیم (۰ تا ۱) */
    minConfidence: number;
    /** حداقل امتیاز برای پیشنهاد «شاید منظورتان این بود» */
    suggestThreshold: number;
    maxSuggestions: number;
    suggestText: string;
    /** هنگام انتظار در صف/آفلاین هم ربات به پرسش‌ها پاسخ دهد */
    answerWhileWaiting: boolean;
    /** نوشتن این عبارت‌ها یعنی درخواست اتصال به کارشناس */
    handoffKeywords: string[];
    askHelpful: boolean;
    helpfulQuestion: string;
    logUnanswered: boolean;
  };
  routing: {
    /** auto: تخصیص خودکار به کم‌مشغله‌ترین اپراتور؛ manual: صف و پذیرش دستی */
    mode: 'auto' | 'manual';
    showQueuePosition: boolean;
    queueText: string;
    assignedText: string;
    transferText: string;
    /** گفتگوی بی‌فعالیت پس از این مدت بسته می‌شود (۰ = هرگز) */
    autoCloseMinutes: number;
    closedText: string;
    /** اگر پس از این مدت هیچ اپراتوری گفتگو را نپذیرفت، فرم پیام آفلاین نمایش داده شود (۰ = خاموش) */
    queueTimeoutSeconds: number;
  };
  workingHours: {
    enabled: boolean;
    days: WorkingDay[];
    /** تعطیلات شمسی «۱۴۰۴/۰۱/۰۱» (علاوه بر تعطیلات تقویم سیستم) */
    holidays: string[];
    useSystemHolidays: boolean;
  };
  offline: {
    /** form: دریافت پیام و شماره تماس؛ message: گفتگو آزاد و ماندن در صف؛ hide: پنهان شدن دکمه‌ی چت */
    mode: 'form' | 'message' | 'hide';
    title: string;
    text: string;
    requirePhone: boolean;
    thanksText: string;
  };
  preChat: {
    enabled: boolean;
    onlyGuests: boolean;
    askName: boolean;
    askPhone: boolean;
    requirePhone: boolean;
    askDepartment: boolean;
    intro: string;
  };
  rating: {
    enabled: boolean;
    text: string;
    askComment: boolean;
    thanksText: string;
  };
  notifications: {
    /** اگر بازدیدکننده هنگام پاسخ اپراتور آنلاین نبود و شماره‌اش معلوم است، پیامک بگیرد */
    smsVisitorOnReply: boolean;
    smsVisitorText: string;
    smsCooldownMinutes: number;
    /** پیامک به شماره‌های مدیران هنگام ثبت پیام آفلاین */
    smsAdminsOnOffline: boolean;
    adminPhones: string[];
    smsAdminText: string;
    /** نشانی‌ای که در پیامک برای باز کردن چت قرار می‌گیرد */
    chatLink: string;
  };
  privacy: {
    /** اپراتورها متن در حال تایپ بازدیدکننده را پیش از ارسال ببینند */
    typingPreview: boolean;
    maxMessageLength: number;
    ipBlocklist: string[];
  };
}

const workday = (day: WeekdayIndex, open = true): WorkingDay => ({
  day,
  open,
  start: '09:00',
  end: day === 5 ? '13:00' : '18:00',
});

export const DEFAULT_LIVECHAT_SETTINGS: LivechatSettingsData = {
  enabled: true,
  widget: {
    title: 'پشتیبانی آرکان گلد',
    subtitle: 'معمولاً در کمتر از چند دقیقه پاسخ می‌دهیم',
    offlineSubtitle: 'پیام بگذارید؛ در اولین فرصت پاسخ می‌دهیم',
    welcomeMessage: 'سلام 👋 به پشتیبانی آرکان گلد خوش آمدید.',
    primaryColor: '#330509',
    accentColor: '#c5a059',
    position: 'left',
    offsetX: 16,
    offsetBottom: 20,
    launcherText: 'گفتگو با پشتیبانی',
    showLauncherText: false,
    showOnMobile: true,
    hiddenPaths: ['/invoice', '/courier', '/verifyInvoice'],
    showOperatorAvatar: true,
    soundEnabled: true,
    allowFileUpload: true,
    allowVisitorEndChat: true,
    composerPlaceholder: 'پیام خود را بنویسید…',
  },
  bot: {
    enabled: true,
    greeting: 'در چه موردی سوال دارید؟',
    showMainMenuButton: true,
    mainMenuLabel: 'منوی اصلی',
    showOperatorButton: true,
    operatorButtonLabel: 'گفتگو با کارشناس',
    backLabel: 'بازگشت',
    freeTextBehavior: 'smart',
    fallbackText:
      'متوجه پرسش شما نشدم. می‌توانید یکی از گزینه‌ها را انتخاب کنید یا با کارشناس گفتگو کنید.',
    handoffText:
      'درخواست شما برای کارشناسان ارسال شد؛ لطفاً چند لحظه منتظر بمانید.',
  },
  smart: {
    enabled: true,
    minConfidence: 0.6,
    suggestThreshold: 0.3,
    maxSuggestions: 3,
    suggestText: 'شاید منظورتان یکی از این موارد باشد:',
    answerWhileWaiting: true,
    handoffKeywords: [
      'کارشناس',
      'اپراتور',
      'پشتیبان',
      'آدم واقعی',
      'انسان',
      'صحبت با کارشناس',
      'تماس با پشتیبانی',
    ],
    askHelpful: true,
    helpfulQuestion: 'این پاسخ مفید بود؟',
    logUnanswered: true,
  },
  routing: {
    mode: 'auto',
    showQueuePosition: true,
    queueText: 'شما نفر {{position}} در صف انتظار هستید.',
    assignedText: '{{operator}} به گفتگو پیوست.',
    transferText: 'گفتگو به {{target}} منتقل شد.',
    autoCloseMinutes: 30,
    closedText: 'گفتگو به پایان رسید. هر زمان سوالی داشتید در خدمتیم.',
    queueTimeoutSeconds: 180,
  },
  workingHours: {
    enabled: true,
    days: [
      workday(0),
      workday(1),
      workday(2),
      workday(3),
      workday(4),
      workday(5),
      workday(6, false),
    ],
    holidays: [],
    useSystemHolidays: true,
  },
  offline: {
    mode: 'form',
    title: 'در حال حاضر کارشناسان آنلاین نیستند',
    text: 'پیام خود را بگذارید؛ در اولین فرصت کاری پاسخ می‌دهیم و با پیامک خبرتان می‌کنیم.',
    requirePhone: true,
    thanksText:
      'پیام شما ثبت شد. پاسخ کارشناس همین‌جا نمایش داده می‌شود و پیامک اطلاع‌رسانی دریافت می‌کنید.',
  },
  preChat: {
    enabled: true,
    onlyGuests: true,
    askName: true,
    askPhone: true,
    requirePhone: false,
    askDepartment: false,
    intro: 'برای اتصال به کارشناس، لطفاً نام و شماره تماس خود را وارد کنید.',
  },
  rating: {
    enabled: true,
    text: 'از گفتگو با ما چقدر راضی بودید؟',
    askComment: true,
    thanksText: 'از بازخورد شما سپاسگزاریم 🙏',
  },
  notifications: {
    smsVisitorOnReply: true,
    smsVisitorText:
      'آرکان گلد: کارشناس پشتیبانی به پیام شما پاسخ داد. مشاهده: {{link}}',
    smsCooldownMinutes: 30,
    smsAdminsOnOffline: false,
    adminPhones: [],
    smsAdminText: 'چت آرکان گلد: پیام جدید از {{visitor}}: {{preview}}',
    chatLink: 'https://app.arkan.gold/dashboard?chat=open',
  },
  privacy: {
    typingPreview: true,
    maxMessageLength: 2000,
    ipBlocklist: [],
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * ادغام عمیق مقدار ذخیره‌شده با پیش‌فرض: فقط کلیدهای شناخته‌شده و با همان نوع پیش‌فرض
 * پذیرفته می‌شوند (کلید ناشناخته یا نوع نادرست نادیده گرفته می‌شود).
 */
export function mergeSettings<T>(defaults: T, stored: unknown): T {
  // خروجی هیچ‌وقت به اشیای پیش‌فرض ارجاع نمی‌دهد (تغییر آن، پیش‌فرض‌ها را خراب نکند)
  if (Array.isArray(defaults)) {
    return structuredClone(Array.isArray(stored) ? stored : defaults) as T;
  }
  if (isRecord(defaults)) {
    const src = isRecord(stored) ? stored : {};
    const out: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(defaults)) {
      out[key] = mergeSettings(def, key in src ? src[key] : undefined);
    }
    return out as T;
  }
  return (typeof stored === typeof defaults ? stored : defaults) as T;
}
