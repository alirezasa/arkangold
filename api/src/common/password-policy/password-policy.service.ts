// api/src/common/password-policy/password-policy.service.ts
//
// سیاست واحد رمز عبور برای کاربران، ادمین‌ها و نمایندگان (FIA_UAU_EXT.1):
//  1.1  حداقل طول (کاربر ۸، حساب‌های مدیریتی ۱۵ — قابل تنظیم، هرگز کمتر از ۸)
//  1.4  مقایسه با فهرست رمزهای پرتکرار (بیش از ۴۶ هزار رمز ۸+ کاراکتری از NCSC/HIBP + فهرست فارسی)
//  1.5  بدون هیچ قاعده‌ی ترکیب کاراکتر (حرف بزرگ/عدد/نماد اجباری نیست)
//  1.8  رمز برای هش دقیقاً همان‌طور که دریافت شده استفاده می‌شود؛ نرمال‌سازی فقط برای مقایسه با فهرست‌هاست
//  1.9  حداکثر طول ۱۲۸ کاراکتر (بیش از ۶۴ کاراکتر الزامی)
//  1.11 رد رمزهای ساخته‌شده از کلمات مرتبط با برنامه یا اطلاعات خود حساب
//  1.12 بررسی در فهرست آفلاین و (در صورت دسترسی) سرویس Have I Been Pwned با روش k-anonymity
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SystemConfigService } from '../../system-config/system-config.service';

export type PasswordAccountKind = 'user' | 'admin';

export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_ABSOLUTE_MIN_LENGTH = 8;
const DEFAULT_MIN_LENGTH: Record<PasswordAccountKind, number> = {
  user: 8,
  admin: 15,
};
const MIN_LENGTH_KEY: Record<PasswordAccountKind, string> = {
  user: 'security.password.user_min_length',
  admin: 'security.password.admin_min_length',
};

/** کلمات مرتبط با محتوای برنامه (نام برنامه، شرکت، دامنه و واژه‌های پلتفرمی) */
export const BUILTIN_CONTEXT_WORDS = [
  'arkan',
  'arkangold',
  'arkan.gold',
  'arkan gold',
  'gold',
  'tala',
  'yara',
  'yaratejarat',
  'ارکان',
  'آرکان',
  'ارکانگلد',
  'آرکانگلد',
  'گلد',
  'طلا',
  'یارا',
  'admin',
  'administrator',
  'root',
  'superadmin',
  'password',
  'passwd',
  'user',
  'guest',
  'test',
  'qwerty',
  'welcome',
  'login',
  'agent',
  'panel',
  'رمزعبور',
  'پسورد',
  'ادمین',
  'مدیر',
];

export interface PasswordContext {
  phone?: string | null;
  username?: string | null;
  fullName?: string | null;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const LEET: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  $: 's',
  '5': 's',
  '7': 't',
  '9': 'g',
};

/** نرمال‌سازی فقط برای مقایسه (هرگز روی رمزی که هش می‌شود اعمال نمی‌شود) */
export function normalizeForCompare(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, '');
}

function deLeet(s: string): string {
  return s.replace(/[@4013!$579]/g, (c) => LEET[c] ?? c);
}

@Injectable()
export class PasswordPolicyService implements OnModuleInit {
  private readonly logger = new Logger(PasswordPolicyService.name);
  private common = new Set<string>();
  private hibpBase = (
    process.env.HIBP_API_URL || 'https://api.pwnedpasswords.com'
  ).replace(/\/$/, '');

  constructor(private systemConfig: SystemConfigService) {}

  onModuleInit() {
    const dir = join(__dirname, 'data');
    for (const file of ['common-passwords.txt', 'common-passwords-fa.txt']) {
      try {
        for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
          const v = line.trim();
          if (v && !v.startsWith('#')) this.common.add(normalizeForCompare(v));
        }
      } catch (err) {
        this.logger.error(
          `فهرست رمزهای پرتکرار (${file}) بارگذاری نشد: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `[PasswordPolicy] ${this.common.size.toLocaleString('en-US')} رمز پرتکرار/افشاشده بارگذاری شد`,
    );
  }

  get commonListSize() {
    return this.common.size;
  }

  async minLength(kind: PasswordAccountKind): Promise<number> {
    const v = await this.systemConfig.getNumber(
      MIN_LENGTH_KEY[kind],
      DEFAULT_MIN_LENGTH[kind],
    );
    return Math.min(
      64,
      Math.max(PASSWORD_ABSOLUTE_MIN_LENGTH, Math.round(v) || 0),
    );
  }

  async hibpEnabled(): Promise<boolean> {
    return this.systemConfig.getBoolean('security.password.hibp_enabled', true);
  }

  async contextWords(): Promise<string[]> {
    const extra = (
      await this.systemConfig.get('security.password.blocked_words', '')
    )
      .split(/[,،\n]/)
      .map((w) => w.trim())
      .filter(Boolean);
    return [...BUILTIN_CONTEXT_WORDS, ...extra];
  }

  /** خلاصه‌ی سیاست برای نمایش در فرم‌ها و پنل امنیت */
  async describe() {
    return {
      userMinLength: await this.minLength('user'),
      adminMinLength: await this.minLength('admin'),
      maxLength: PASSWORD_MAX_LENGTH,
      complexityRules: false,
      commonListSize: this.common.size,
      hibpEnabled: await this.hibpEnabled(),
      contextWordCount: (await this.contextWords()).length,
      periodicExpiry: false,
    };
  }

  /**
   * اعتبارسنجی رمز جدید؛ در صورت رد، BadRequestException با پیام فارسی قابل نمایش.
   * رمز ورودی هیچ تغییری نمی‌کند (FIA_UAU_EXT.1.8).
   */
  async assertAcceptable(
    password: string,
    kind: PasswordAccountKind,
    ctx: PasswordContext = {},
  ): Promise<void> {
    const reason = await this.check(password, kind, ctx);
    if (reason) throw new BadRequestException(reason);
  }

  /** null یعنی پذیرفته شد؛ در غیر این صورت پیام دلیل رد */
  async check(
    password: string,
    kind: PasswordAccountKind,
    ctx: PasswordContext = {},
  ): Promise<string | null> {
    if (typeof password !== 'string' || !password) {
      return 'رمز عبور را وارد کنید';
    }
    // طول بر حسب کاراکتر (code point) — نه بایت — تا رمز فارسی هم منصفانه شمرده شود
    const length = [...password].length;
    const min = await this.minLength(kind);
    if (length < min) {
      return `رمز عبور باید حداقل ${min.toLocaleString('fa-IR')} کاراکتر باشد`;
    }
    if (length > PASSWORD_MAX_LENGTH) {
      return `رمز عبور حداکثر ${PASSWORD_MAX_LENGTH.toLocaleString('fa-IR')} کاراکتر است`;
    }

    const norm = normalizeForCompare(password);
    if (this.isTrivialPattern(norm)) {
      return 'رمز عبور از یک کاراکتر تکراری یا دنباله‌ی ساده تشکیل شده است؛ رمز دیگری انتخاب کنید';
    }
    if (this.common.has(norm) || this.common.has(norm.trim())) {
      return 'این رمز عبور جزو رمزهای رایج و افشاشده است و به‌راحتی حدس زده می‌شود؛ رمز دیگری انتخاب کنید';
    }

    const words = [...(await this.contextWords()), ...this.personalWords(ctx)];
    if (this.isBuiltFromContext(norm, words)) {
      return 'رمز عبور نباید از نام برنامه، نام کاربری، شماره موبایل یا کلمات قابل حدس ساخته شود؛ رمز دیگری انتخاب کنید';
    }

    if (await this.hibpEnabled()) {
      const breached = await this.isBreachedOnline(password);
      if (breached) {
        return 'این رمز عبور در نشت‌های اطلاعاتی منتشر شده است؛ لطفاً رمز دیگری انتخاب کنید';
      }
    }
    return null;
  }

  private personalWords(ctx: PasswordContext): string[] {
    const out: string[] = [];
    if (ctx.phone) {
      const digits = normalizeForCompare(ctx.phone).replace(/\D/g, '');
      if (digits.length >= 7) {
        out.push(digits, digits.replace(/^0/, ''), digits.slice(-7));
      }
    }
    if (ctx.username && ctx.username.length >= 3) {
      // نام کاربری و اجزای آن (مثلاً m.karimi ← karimi، h.rahimi85 ← rahimi)
      out.push(
        ctx.username,
        ...ctx.username.split(/[._\-\s@]+/).filter((p) => p.length >= 3),
        ...(ctx.username.match(/\p{L}{3,}/gu) ?? []),
      );
    }
    if (ctx.fullName) {
      out.push(
        ...ctx.fullName.split(/\s+/).filter((p) => [...p].length >= 3),
        ctx.fullName.replace(/\s+/g, ''),
      );
    }
    return out;
  }

  /**
   * رمز «ساخته‌شده از کلمه‌ی متنی» است اگر پس از حذف آن کلمه، بخش باقی‌مانده کوتاه (کمتر از ۸)،
   * فقط عدد/نماد، یا خودش رمزی پرتکرار باشد. مثال: Arkangold1404 و Admin@12345 رد می‌شوند
   * ولی goldfishswimmingintheocean پذیرفته می‌شود.
   */
  private isBuiltFromContext(norm: string, words: string[]): boolean {
    const variants = Array.from(new Set([norm, deLeet(norm)]));
    for (const raw of words) {
      const w = normalizeForCompare(raw);
      if ([...w].length < 3) continue;
      for (const v of variants) {
        if (!v.includes(w)) continue;
        const rest = v.split(w).join('');
        if (
          [...rest].length < PASSWORD_ABSOLUTE_MIN_LENGTH ||
          /^[\d\W_]*$/u.test(rest) ||
          this.common.has(rest)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private isTrivialPattern(norm: string): boolean {
    const chars = [...norm];
    if (new Set(chars).size <= 2) return true;
    // دنباله‌ی صعودی/نزولی کامل (مثل 123456789 یا abcdefgh)
    const codes = chars.map((c) => c.codePointAt(0));
    const step = codes[1] - codes[0];
    if (Math.abs(step) === 1) {
      return codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
    }
    return false;
  }

  /** HIBP Pwned Passwords با k-anonymity: فقط ۵ کاراکتر اول SHA-1 ارسال می‌شود؛ خطای شبکه = رد نکردن */
  async isBreachedOnline(password: string): Promise<boolean> {
    const sha1 = createHash('sha1')
      .update(password, 'utf8')
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(`${this.hibpBase}/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'arkan-gold-api' },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      for (const line of body.split('\n')) {
        const [s, count] = line.trim().split(':');
        if (s === suffix && Number(count) > 0) return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(
        `[PasswordPolicy] استعلام HIBP در دسترس نبود (${(err as Error).message})؛ فقط فهرست آفلاین بررسی شد`,
      );
      return false;
    }
  }
}
