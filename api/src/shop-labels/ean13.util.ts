// api/src/shop-labels/ean13.util.ts
//
// ابزار بارکد EAN-13: محاسبه رقم کنترل، اعتبارسنجی و ساخت بارکد داخلی.
// بارکدهای داخلی با پیشوند «۲» (محدوده‌ی GS1 برای مصرف درون‌سازمانی) ساخته می‌شوند تا
// با بارکد رسمی کالاهای دیگر تداخل نداشته باشند؛ اگر شرکت پیشوند رسمی GS1 ایران (۶۲۶...)
// دارد، می‌تواند آن را در تنظیمات برچسب جایگزین کند.
import { randomInt } from 'crypto';

/** رقم کنترل EAN-13 برای ۱۲ رقم اول */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('EAN-13 باید ۱۲ رقم داده داشته باشد');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return (
    /^\d{13}$/.test(code) &&
    ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
  );
}

/** ارقام فارسی/عربی را به انگلیسی تبدیل و فاصله/خط تیره را حذف می‌کند */
export function normalizeBarcodeInput(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s-]/g, '');
}

/**
 * ورودی ۱۲ رقمی → رقم کنترل اضافه می‌شود؛ ورودی ۱۳ رقمی → باید رقم کنترل درست داشته باشد.
 * در صورت نامعتبر بودن null برمی‌گرداند.
 */
export function completeEan13(raw: string): string | null {
  const code = normalizeBarcodeInput(raw);
  if (/^\d{12}$/.test(code)) return code + String(ean13CheckDigit(code));
  return isValidEan13(code) ? code : null;
}

export function isValidEanPrefix(prefix: string): boolean {
  return /^\d{2,9}$/.test(prefix);
}

/** بارکد تصادفی با پیشوند داده‌شده (یکتایی را فراخوان بررسی می‌کند) */
export function randomEan13(prefix: string): string {
  if (!isValidEanPrefix(prefix)) {
    throw new Error('پیشوند بارکد باید ۲ تا ۹ رقم باشد');
  }
  let body = prefix;
  while (body.length < 12) body += String(randomInt(0, 10));
  return body + String(ean13CheckDigit(body));
}
