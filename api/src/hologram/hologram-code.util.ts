// api/src/hologram/hologram-code.util.ts
//
// تولید و اعتبارسنجی کد ۸ رقمی هولوگرام. کد شامل ۷ رقم تصادفی (رمزنگارانه، نه
// Math.random) + ۱ رقم checksum به روش Luhn است تا:
//   ۱) کدهای حدسی تصادفی با احتمال بالا حتی از نظر فرمت هم نامعتبر تشخیص داده شوند
//      (بدون نیاز به query دیتابیس) و بار brute-force را کاهش دهند.
//   ۲) تولید کد ترتیبی/قابل‌پیش‌بینی نباشد (بند ۵.۴ سند معماری).

import { randomInt } from 'crypto';

export const HOLOGRAM_CODE_LENGTH = 8;
const PAYLOAD_LENGTH = HOLOGRAM_CODE_LENGTH - 1;

function luhnCheckDigit(payloadDigits: number[]): number {
  let sum = 0;
  let doubleNext = true; // از راست شروع می‌شود؛ رقم checksum خودش در سمت راست payload قرار می‌گیرد
  for (let i = payloadDigits.length - 1; i >= 0; i--) {
    let d = payloadDigits[i];
    if (doubleNext) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleNext = !doubleNext;
  }
  return (10 - (sum % 10)) % 10;
}

export function generateHologramCode(): string {
  const payload = Array.from({ length: PAYLOAD_LENGTH }, () =>
    randomInt(0, 10),
  );
  const check = luhnCheckDigit(payload);
  return [...payload, check].join('');
}

export function isValidHologramCodeFormat(code: string): boolean {
  if (typeof code !== 'string' || !/^\d{8}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const payload = digits.slice(0, PAYLOAD_LENGTH);
  const check = digits[PAYLOAD_LENGTH];
  return luhnCheckDigit(payload) === check;
}

/** نمایش ماسک‌شده کد ملی برای پاسخ عمومی (بدون احراز هویت استعلام‌گیرنده) — مثلاً 1234****** */
export function maskNationalCode(nationalCode: string): string {
  if (!nationalCode) return '';
  const visible = nationalCode.slice(0, 4);
  return (
    visible + '*'.repeat(Math.max(0, nationalCode.length - visible.length))
  );
}
