// api/src/branding/appearance.theme.ts
//
// رنگ‌ها و فونت قابل تنظیم سیستم (پنل مدیریت ← ظاهر و تم). پیش‌فرض‌ها دقیقاً همان رنگ‌های
// فعلی برند هستند (globals.css اپلیکیشن و پنل‌ها) تا بدون تنظیم، ظاهر هیچ تغییری نکند.
// خروجی برای پنل‌ها و اپلیکیشن یک CSS آماده است که فقط از مقادیر hex اعتبارسنجی‌شده و رشته‌های
// ثابت ساخته می‌شود؛ هیچ ورودی آزادی وارد CSS نمی‌شود.

export type ThemeColorKey =
  | 'primary'
  | 'primarySoft'
  | 'accent'
  | 'accentDark'
  | 'background'
  | 'surface'
  | 'border'
  | 'success'
  | 'danger'
  | 'warning'
  | 'darkPrimary'
  | 'darkBackground'
  | 'darkSurface'
  | 'darkBorder'
  | 'darkSidebar';

export interface ThemeColorDef {
  key: ThemeColorKey;
  /** متغیر CSS که این رنگ را می‌سازد */
  cssVar: string;
  label: string;
  hint: string;
  default: string;
  /** light: هر دو حالت روشن (اپلیکیشن و پنل‌ها) — dark: فقط حالت تاریک پنل‌ها */
  mode: 'light' | 'dark';
}

export const THEME_COLORS: ThemeColorDef[] = [
  {
    key: 'primary',
    cssVar: '--color-emerald',
    label: 'رنگ اصلی برند',
    hint: 'دکمه‌های اصلی، منوی کناری، سربرگ‌ها و نوار وضعیت موبایل',
    default: '#330509',
    mode: 'light',
  },
  {
    key: 'primarySoft',
    cssVar: '--color-emerald-light',
    label: 'زمینه‌ی ملایم',
    hint: 'پس‌زمینه‌ی کم‌رنگ کارت‌ها و برچسب‌های برجسته',
    default: '#e8f5f0',
    mode: 'light',
  },
  {
    key: 'accent',
    cssVar: '--color-gold-500',
    label: 'رنگ تأکیدی (طلایی)',
    hint: 'آیکون‌ها، حاشیه‌ی فیلد فعال، نشان‌ها و جزئیات طلایی',
    default: '#c5a059',
    mode: 'light',
  },
  {
    key: 'accentDark',
    cssVar: '--color-gold-600',
    label: 'طلایی تیره',
    hint: 'حالت hover و متن‌های طلایی',
    default: '#b5952f',
    mode: 'light',
  },
  {
    key: 'background',
    cssVar: '--color-bg-page',
    label: 'پس‌زمینه‌ی صفحه',
    hint: 'رنگ زمینه‌ی کل صفحات',
    default: '#f3f4f0',
    mode: 'light',
  },
  {
    key: 'surface',
    cssVar: '--color-surface',
    label: 'سطح کارت‌ها',
    hint: 'کارت‌ها، پنجره‌ها و جدول‌ها',
    default: '#ffffff',
    mode: 'light',
  },
  {
    key: 'border',
    cssVar: '--color-border',
    label: 'حاشیه‌ها',
    hint: 'خطوط جداکننده و حاشیه‌ی کارت‌ها',
    default: '#e2e0d8',
    mode: 'light',
  },
  {
    key: 'success',
    cssVar: '--color-green',
    label: 'موفقیت / خرید',
    hint: 'وضعیت‌های موفق و دکمه‌های خرید',
    default: '#004d40',
    mode: 'light',
  },
  {
    key: 'danger',
    cssVar: '--color-red',
    label: 'خطا / فروش',
    hint: 'پیام‌های خطا و دکمه‌های فروش',
    default: '#dc2626',
    mode: 'light',
  },
  {
    key: 'warning',
    cssVar: '--color-yellow',
    label: 'هشدار',
    hint: 'پیام‌ها و نشان‌های هشدار',
    default: '#ffc107',
    mode: 'light',
  },
  {
    key: 'darkPrimary',
    cssVar: '--color-emerald',
    label: 'رنگ اصلی در حالت تاریک',
    hint: 'نسخه‌ی روشن‌تر رنگ برند تا روی زمینه‌ی تیره خوانا باشد',
    default: '#c4505a',
    mode: 'dark',
  },
  {
    key: 'darkBackground',
    cssVar: '--color-bg-page',
    label: 'پس‌زمینه‌ی صفحه (تاریک)',
    hint: 'زمینه‌ی کل صفحات در حالت تاریک',
    default: '#121012',
    mode: 'dark',
  },
  {
    key: 'darkSurface',
    cssVar: '--color-surface',
    label: 'سطح کارت‌ها (تاریک)',
    hint: 'کارت‌ها، پنجره‌ها و جدول‌ها در حالت تاریک',
    default: '#1b181a',
    mode: 'dark',
  },
  {
    key: 'darkBorder',
    cssVar: '--color-border',
    label: 'حاشیه‌ها (تاریک)',
    hint: 'خطوط جداکننده در حالت تاریک',
    default: '#2e292c',
    mode: 'dark',
  },
  {
    key: 'darkSidebar',
    cssVar: '--color-sidebar',
    label: 'منوی کناری (تاریک)',
    hint: 'منوی کناری، سربرگ موبایل و منوی پایین در حالت تاریک',
    default: '#22090d',
    mode: 'dark',
  },
];

export type ThemeColors = Record<ThemeColorKey, string>;

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export const DEFAULT_THEME_COLORS: ThemeColors = Object.fromEntries(
  THEME_COLORS.map((c) => [c.key, c.default]),
) as ThemeColors;

/** ادغام مقدار ذخیره‌شده با پیش‌فرض‌ها؛ هر مقدار نامعتبر نادیده گرفته می‌شود */
export function normalizeThemeColors(raw: unknown): ThemeColors {
  const out: ThemeColors = { ...DEFAULT_THEME_COLORS };
  if (!raw || typeof raw !== 'object') return out;
  for (const def of THEME_COLORS) {
    const v = (raw as Record<string, unknown>)[def.key];
    if (typeof v === 'string' && HEX_COLOR_RE.test(v)) {
      out[def.key] = v.toLowerCase();
    }
  }
  return out;
}

export type FontWeightSlot = 'regular' | 'bold';
export const FONT_SLOTS: FontWeightSlot[] = ['regular', 'bold'];

export interface ThemeFontInfo {
  /** پسوند ذخیره‌شده‌ی فایل هر وزن (یا null اگر بارگذاری نشده) */
  regular: string | null;
  bold: string | null;
  /** نسخه برای شکستن کش مرورگر پس از هر تغییر */
  version: string;
}

const FONT_FORMAT: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

/** نام خانواده‌ی فونت سفارشی در CSS (ثابت؛ نام ورودی کاربر وارد CSS نمی‌شود) */
export const CUSTOM_FONT_FAMILY = 'ArkanBrandFont';

const mix = (color: string, pct: number, base: string) =>
  `color-mix(in srgb, ${color} ${pct}%, ${base})`;

/**
 * ساخت CSS نهایی. رنگ‌های حالت روشن روی :root (اپلیکیشن و پنل‌ها)، رنگ‌های حالت تاریک روی
 * :root.dark (فقط پنل‌ها کلاس dark دارند) و فقط برای نمایشگر (چاپ همیشه روشن است).
 */
export function buildThemeCss(
  colors: ThemeColors,
  font: ThemeFontInfo,
): string {
  const light: string[] = [];
  const dark: string[] = [];
  for (const def of THEME_COLORS) {
    (def.mode === 'light' ? light : dark).push(
      `${def.cssVar}:${colors[def.key]}`,
    );
  }
  // سایه‌های طلایی فقط اگر رنگ تأکیدی تغییر کرده باشد از آن مشتق می‌شوند (پیش‌فرض دست نمی‌خورد)
  if (colors.accent !== DEFAULT_THEME_COLORS.accent) {
    light.push(
      `--color-gold-50:${mix(colors.accent, 10, '#ffffff')}`,
      `--color-gold-100:${mix(colors.accent, 22, '#ffffff')}`,
      `--color-gold-900:${mix(colors.accent, 35, '#000000')}`,
    );
  }
  light.push('--color-sidebar:var(--color-emerald)');

  const parts: string[] = [];
  const v = encodeURIComponent(font.version);
  const regular = font.regular;
  const bold = font.bold;
  if (regular || bold) {
    const face = (slot: FontWeightSlot, ext: string, weight: string) =>
      `@font-face{font-family:"${CUSTOM_FONT_FAMILY}";src:url("/brand/font/${slot}?v=${v}") format("${FONT_FORMAT[ext] ?? 'woff2'}");font-weight:${weight};font-style:normal;font-display:swap}`;
    if (regular)
      parts.push(face('regular', regular, bold ? '100 499' : '100 900'));
    if (bold) parts.push(face('bold', bold, regular ? '500 900' : '100 900'));
    light.push(
      `--font-sans:"${CUSTOM_FONT_FAMILY}",var(--font-dana),system-ui,-apple-system,sans-serif`,
    );
  }
  parts.push(`:root{${light.join(';')}}`);
  parts.push(`@media screen{:root.dark{${dark.join(';')}}}`);
  return parts.join('\n');
}
