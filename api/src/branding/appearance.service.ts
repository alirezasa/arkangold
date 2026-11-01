// api/src/branding/appearance.service.ts
//
// ظاهر و تم سیستم: رنگ‌های برند (حالت روشن اپلیکیشن/پنل‌ها و حالت تاریک پنل‌ها) و فونت سفارشی.
// تنظیمات در SystemConfig ذخیره می‌شوند (کلیدهای appearance.*) و از endpoint عمومی به‌صورت CSS
// آماده به اپلیکیشن، پنل مدیریت و پنل نمایندگان تحویل داده می‌شوند.
// فایل فونت پس از بررسی امنیتی (پسوند، بایت‌های جادویی، ساختار، ضدبدافزار) با نام تولیدی سرور
// در uploads/branding/fonts نوشته می‌شود؛ هیچ مسیر دلخواهی از تنظیمات خوانده نمی‌شود.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { join, resolve } from 'path';
import { SystemConfigService } from '../system-config/system-config.service';
import { FileSecurityService } from '../common/file-security/file-security.service';
import { BRANDING_FONT_POLICY } from '../common/file-security/upload-policies';
import { writeSanitizedFile } from '../common/file-security/local-file-store';
import {
  DEFAULT_THEME_COLORS,
  FONT_SLOTS,
  FontWeightSlot,
  HEX_COLOR_RE,
  THEME_COLORS,
  ThemeColors,
  ThemeFontInfo,
  buildThemeCss,
  normalizeThemeColors,
} from './appearance.theme';

const KEYS = {
  colors: 'appearance.colors',
  fontName: 'appearance.font_name',
  version: 'appearance.version',
  font: {
    regular: 'appearance.font_regular',
    bold: 'appearance.font_bold',
  } as Record<FontWeightSlot, string>,
};

const FONT_DIR = join(process.cwd(), 'uploads', 'branding', 'fonts');
const REF_PREFIX = 'font:';
const FONT_FILE_RE = /^[0-9a-f-]{36}\.(woff2|woff|ttf|otf)$/i;
const FONT_MIME: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

export interface FontFile {
  buffer: Buffer;
  mime: string;
}

@Injectable()
export class AppearanceService {
  private readonly logger = new Logger(AppearanceService.name);

  constructor(
    private systemConfig: SystemConfigService,
    private fileSecurity: FileSecurityService,
  ) {}

  static isSlot(v: string): v is FontWeightSlot {
    return (FONT_SLOTS as string[]).includes(v);
  }

  private async colors(): Promise<ThemeColors> {
    const raw = await this.systemConfig.get(KEYS.colors, '');
    if (!raw) return { ...DEFAULT_THEME_COLORS };
    try {
      return normalizeThemeColors(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_THEME_COLORS };
    }
  }

  /** نام فایل معتبر فونت از روی مرجع تنظیم؛ نامعتبر → null */
  private static fileNameOf(ref: string | null | undefined): string | null {
    if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
    const name = ref.slice(REF_PREFIX.length);
    return FONT_FILE_RE.test(name) ? name : null;
  }

  private async fontInfo(): Promise<ThemeFontInfo> {
    const ext = async (slot: FontWeightSlot) => {
      const name = AppearanceService.fileNameOf(
        await this.systemConfig.get(KEYS.font[slot], ''),
      );
      return name ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : null;
    };
    return {
      regular: await ext('regular'),
      bold: await ext('bold'),
      version: (await this.systemConfig.get(KEYS.version, '')) || '1',
    };
  }

  private async bumpVersion() {
    await this.systemConfig.set(KEYS.version, Date.now().toString(36));
  }

  /** CSS آماده برای اپلیکیشن و پنل‌ها (endpoint عمومی) */
  async getPublicTheme() {
    const [colors, font] = await Promise.all([this.colors(), this.fontInfo()]);
    return {
      css: buildThemeCss(colors, font),
      themeColor: colors.primary,
      darkThemeColor: colors.darkSidebar,
      version: font.version,
    };
  }

  /** وضعیت کامل برای صفحه‌ی ظاهر و تم پنل مدیریت */
  async getAdminSettings() {
    const [colors, font, fontName] = await Promise.all([
      this.colors(),
      this.fontInfo(),
      this.systemConfig.get(KEYS.fontName, ''),
    ]);
    return {
      colors,
      defaults: DEFAULT_THEME_COLORS,
      definitions: THEME_COLORS.map(
        ({ key, cssVar, label, hint, mode, default: d }) => ({
          key,
          cssVar,
          label,
          hint,
          mode,
          default: d,
        }),
      ),
      font: { ...font, name: fontName || null },
    };
  }

  async updateColors(input: Record<string, unknown>, fontName?: string | null) {
    const current = await this.colors();
    for (const def of THEME_COLORS) {
      const v = input[def.key];
      if (v === undefined) continue;
      if (typeof v !== 'string' || !HEX_COLOR_RE.test(v)) {
        throw new BadRequestException(`رنگ «${def.label}» نامعتبر است`);
      }
      current[def.key] = v.toLowerCase();
    }
    // فقط مقادیر متفاوت با پیش‌فرض ذخیره می‌شوند تا تغییر پیش‌فرض‌ها در نسخه‌های بعد اعمال شود
    const diff = Object.fromEntries(
      THEME_COLORS.filter((d) => current[d.key] !== d.default).map((d) => [
        d.key,
        current[d.key],
      ]),
    );
    await this.systemConfig.set(
      KEYS.colors,
      Object.keys(diff).length ? JSON.stringify(diff) : '',
    );
    if (fontName !== undefined) {
      await this.systemConfig.set(
        KEYS.fontName,
        (fontName ?? '').trim().slice(0, 60),
      );
    }
    await this.bumpVersion();
    return { message: 'تنظیمات ظاهر ذخیره شد', colors: current };
  }

  async resetColors() {
    await this.systemConfig.set(KEYS.colors, '');
    await this.bumpVersion();
    return {
      message: 'رنگ‌ها به پیش‌فرض برگشت',
      colors: { ...DEFAULT_THEME_COLORS },
    };
  }

  async uploadFont(slot: FontWeightSlot, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('فایل فونت را انتخاب کنید');
    const clean = await this.fileSecurity.process(file, BRANDING_FONT_POLICY);
    const { filename } = await writeSanitizedFile(FONT_DIR, clean);
    const previous = AppearanceService.fileNameOf(
      await this.systemConfig.get(KEYS.font[slot], ''),
    );
    await this.systemConfig.set(KEYS.font[slot], `${REF_PREFIX}${filename}`);
    await this.bumpVersion();
    if (previous) await this.deleteFile(previous);
    return { message: 'فونت ذخیره شد', slot };
  }

  async removeFont(slot: FontWeightSlot) {
    const previous = AppearanceService.fileNameOf(
      await this.systemConfig.get(KEYS.font[slot], ''),
    );
    await this.systemConfig.set(KEYS.font[slot], '');
    await this.bumpVersion();
    if (previous) await this.deleteFile(previous);
    return { message: 'فونت حذف شد و فونت پیش‌فرض اعمال می‌شود', slot };
  }

  async readFont(slot: FontWeightSlot): Promise<FontFile> {
    const name = AppearanceService.fileNameOf(
      await this.systemConfig.get(KEYS.font[slot], ''),
    );
    if (!name) throw new NotFoundException('فونت تنظیم نشده است');
    const base = resolve(FONT_DIR);
    const full = resolve(base, name);
    if (!full.startsWith(base)) throw new NotFoundException();
    try {
      const buffer = await fs.readFile(full);
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
      return { buffer, mime: FONT_MIME[ext] ?? 'application/octet-stream' };
    } catch {
      this.logger.warn(`[Appearance] فایل فونت ${name} یافت نشد`);
      throw new NotFoundException('فونت یافت نشد');
    }
  }

  private async deleteFile(name: string) {
    if (!FONT_FILE_RE.test(name)) return;
    const base = resolve(FONT_DIR);
    const full = resolve(base, name);
    if (!full.startsWith(base)) return;
    await fs.unlink(full).catch(() => undefined);
  }
}
