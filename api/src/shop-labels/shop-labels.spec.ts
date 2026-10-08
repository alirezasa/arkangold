import {
  completeEan13,
  ean13CheckDigit,
  isValidEan13,
  randomEan13,
} from './ean13.util';
import { sanitizeElements } from './label-elements';
import { DEFAULT_LABEL_SIZES, DEFAULT_LABEL_TEMPLATES } from './label-defaults';

describe('EAN-13', () => {
  it('رقم کنترل استاندارد را محاسبه می‌کند', () => {
    // نمونه‌های مرجع GS1
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
  });

  it('ورودی ۱۲ رقمی و ارقام فارسی را کامل می‌کند و رقم کنترل غلط را رد می‌کند', () => {
    expect(completeEan13('۵۹۰۱۲۳۴۱۲۳۴۵')).toBe('5901234123457');
    expect(completeEan13('5901-2341-2345-7')).toBe('5901234123457');
    expect(completeEan13('5901234123450')).toBeNull();
    expect(completeEan13('abc')).toBeNull();
  });

  it('بارکد تصادفی با پیشوند و رقم کنترل معتبر می‌سازد', () => {
    for (let i = 0; i < 50; i++) {
      const code = randomEan13('200');
      expect(code.startsWith('200')).toBe(true);
      expect(isValidEan13(code)).toBe(true);
    }
    expect(() => randomEan13('1')).toThrow();
  });
});

describe('sanitizeElements', () => {
  it('کلیدهای اضافی را حذف و ابعاد را داخل برچسب نگه می‌دارد', () => {
    const [el] = sanitizeElements(
      [
        {
          id: 'a',
          type: 'text',
          x: 90,
          y: -5,
          w: 30,
          h: 10,
          content: 'سلام {{receiver.name}}',
          fontSize: 500,
          onclick: 'alert(1)',
        },
      ],
      100,
      50,
    );
    expect(el).toMatchObject({
      type: 'text',
      x: 70,
      y: 0,
      w: 30,
      fontSize: 72,
    });
    expect(el).not.toHaveProperty('onclick');
  });

  it('نوع ناشناخته و تصویر غیرمجاز را رد می‌کند', () => {
    expect(() =>
      sanitizeElements([{ type: 'script', x: 0, y: 0, w: 1, h: 1 }], 50, 30),
    ).toThrow();
    expect(() =>
      sanitizeElements(
        [
          {
            type: 'image',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            src: 'data:image/svg+xml;base64,AAAA',
          },
        ],
        50,
        30,
      ),
    ).toThrow();
  });

  it('شناسه‌ی تکراری را یکتا می‌کند', () => {
    const els = sanitizeElements(
      [
        { id: 'x', type: 'line', x: 0, y: 0, w: 10, h: 0.3 },
        { id: 'x', type: 'line', x: 0, y: 5, w: 10, h: 0.3 },
      ],
      50,
      30,
    );
    expect(new Set(els.map((e) => e.id)).size).toBe(2);
  });

  it('طرح‌های پیش‌فرض بدون تغییر از پاک‌سازی عبور می‌کنند', () => {
    for (const t of DEFAULT_LABEL_TEMPLATES) {
      const size = DEFAULT_LABEL_SIZES.find((s) => s.key === t.sizeKey);
      expect(sanitizeElements(t.elements, size.widthMm, size.heightMm)).toEqual(
        t.elements,
      );
    }
  });
});
