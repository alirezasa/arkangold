// api/src/shop-labels/label-elements.ts
//
// ساختار عناصر طرح برچسب و پاک‌سازی ورودی پنل ادمین. طرح به‌صورت JSON ذخیره می‌شود؛
// هر کلیدی خارج از این فهرست حذف و هر عدد به بازه‌ی مجاز محدود می‌شود تا طرح خراب
// یا حجیم (مثلاً تصویر چند مگابایتی) وارد پایگاه داده نشود.
import { BadRequestException } from '@nestjs/common';

export const LABEL_ELEMENT_TYPES = [
  'text',
  'barcode',
  'items',
  'line',
  'box',
  'image',
] as const;
export type LabelElementType = (typeof LABEL_ELEMENT_TYPES)[number];

export const BARCODE_FORMATS = ['EAN13', 'CODE128'] as const;
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

interface BaseElement {
  id: string;
  type: LabelElementType;
  /** موقعیت و ابعاد به میلی‌متر از گوشه‌ی بالا-چپ برچسب */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  /** متن با جای‌گذاری فیلدها، مثل «گیرنده: {{receiver.name}}» */
  content: string;
  /** اندازه قلم (pt) */
  fontSize: number;
  bold: boolean;
  align: 'right' | 'center' | 'left';
  valign: 'top' | 'middle' | 'bottom';
  dir: 'rtl' | 'ltr';
  /** متن سفید روی زمینه‌ی مشکی */
  invert: boolean;
  border: boolean;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  format: BarcodeFormat;
  /** مقدار بارکد با جای‌گذاری فیلد، مثل {{item.barcode}} */
  source: string;
  showText: boolean;
  fontSize: number;
}

export interface ItemsElement extends BaseElement {
  type: 'items';
  fontSize: number;
  showWeight: boolean;
  showBarcode: boolean;
}

export interface LineElement extends BaseElement {
  type: 'line';
  /** ضخامت خط (mm) — جهت خط از پهنا/ارتفاع کادر تعیین می‌شود */
  thickness: number;
}

export interface BoxElement extends BaseElement {
  type: 'box';
  thickness: number;
  radius: number;
  fill: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  /** تصویر به‌صورت data URL (png/jpeg/webp) */
  src: string;
}

export type LabelElement =
  | TextElement
  | BarcodeElement
  | ItemsElement
  | LineElement
  | BoxElement
  | ImageElement;

export const MAX_ELEMENTS = 60;
/** سقف حجم هر تصویر (data URL) — لوگوی برچسب حرارتی بیش از این لازم ندارد */
export const MAX_IMAGE_DATA_URL_LENGTH = 200_000;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

type Raw = Record<string, unknown>;

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
};
const str = (v: unknown, maxLen: number, fallback = '') =>
  typeof v === 'string' ? v.slice(0, maxLen) : fallback;
const bool = (v: unknown, fallback = false) =>
  typeof v === 'boolean' ? v : fallback;
const oneOf = <T extends string>(
  v: unknown,
  list: readonly T[],
  fallback: T,
) => (list.includes(v as T) ? (v as T) : fallback);

/**
 * پاک‌سازی و اعتبارسنجی آرایه‌ی عناصر نسبت به ابعاد برچسب.
 * عنصر با نوع ناشناخته یا تصویر نامعتبر خطای ۴۰۰ می‌دهد (نه حذف بی‌صدا)
 * تا طراح بداند چه چیزی ذخیره نشده است.
 */
export function sanitizeElements(
  raw: unknown,
  widthMm: number,
  heightMm: number,
): LabelElement[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException('عناصر طرح باید آرایه باشد');
  }
  if (raw.length > MAX_ELEMENTS) {
    throw new BadRequestException(
      `حداکثر ${MAX_ELEMENTS} عنصر در هر طرح مجاز است`,
    );
  }
  const seen = new Set<string>();
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`عنصر ${index + 1} نامعتبر است`);
    }
    const r = item as Raw;
    const type = r.type as LabelElementType;
    if (!LABEL_ELEMENT_TYPES.includes(type)) {
      throw new BadRequestException(`نوع عنصر ${index + 1} ناشناخته است`);
    }
    let id = str(r.id, 40).replace(/[^\w-]/g, '');
    if (!id || seen.has(id)) id = `el${index + 1}`;
    seen.add(id);

    const w = num(r.w, 1, widthMm, Math.min(20, widthMm));
    const h = num(r.h, 0.1, heightMm, Math.min(5, heightMm));
    const base = {
      id,
      x: num(r.x, 0, Math.max(0, widthMm - w), 0),
      y: num(r.y, 0, Math.max(0, heightMm - h), 0),
      w,
      h,
    };

    switch (type) {
      case 'text':
        return {
          ...base,
          type,
          content: str(r.content, 1000),
          fontSize: num(r.fontSize, 4, 72, 10),
          bold: bool(r.bold),
          align: oneOf(r.align, ['right', 'center', 'left'] as const, 'right'),
          valign: oneOf(r.valign, ['top', 'middle', 'bottom'] as const, 'top'),
          dir: oneOf(r.dir, ['rtl', 'ltr'] as const, 'rtl'),
          invert: bool(r.invert),
          border: bool(r.border),
        };
      case 'barcode':
        return {
          ...base,
          type,
          format: oneOf(r.format, BARCODE_FORMATS, 'EAN13'),
          source: str(r.source, 200, '{{item.barcode}}'),
          showText: bool(r.showText, true),
          fontSize: num(r.fontSize, 4, 24, 8),
        };
      case 'items':
        return {
          ...base,
          type,
          fontSize: num(r.fontSize, 4, 36, 8),
          showWeight: bool(r.showWeight, true),
          showBarcode: bool(r.showBarcode),
        };
      case 'line':
        return { ...base, type, thickness: num(r.thickness, 0.1, 5, 0.3) };
      case 'box':
        return {
          ...base,
          type,
          thickness: num(r.thickness, 0.1, 5, 0.3),
          radius: num(r.radius, 0, 20, 0),
          fill: bool(r.fill),
        };
      case 'image': {
        const src = str(r.src, MAX_IMAGE_DATA_URL_LENGTH + 1);
        if (src && !IMAGE_DATA_URL.test(src)) {
          throw new BadRequestException(
            'تصویر برچسب باید PNG، JPEG یا WebP باشد',
          );
        }
        if (src.length > MAX_IMAGE_DATA_URL_LENGTH) {
          throw new BadRequestException(
            'حجم تصویر برچسب زیاد است (حداکثر حدود ۱۵۰ کیلوبایت)',
          );
        }
        return { ...base, type, src };
      }
    }
  });
}
