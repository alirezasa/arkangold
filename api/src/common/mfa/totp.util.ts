// api/src/common/mfa/totp.util.ts
// پیاده‌سازی TOTP مطابق RFC 6238 (HMAC-SHA1، ۶ رقم، گام ۳۰ ثانیه) — سازگار با
// Google Authenticator، Microsoft Authenticator، FreeOTP و Aegis.
//
// FIA_UAU_EXT.3.3: راز با CSPRNG (۱۶۰ بیت) تولید می‌شود.
// FIA_UAU_EXT.3.5: هر کد حداکثر در پنجره‌ی ±۱ گام (۹۰ ثانیه، کمتر از سقف ۱۲۰ ثانیه) پذیرفته می‌شود.
// FIA_UAU_EXT.3.8: زمان فقط از ساعت سرور (UTC، هماهنگ با NTP) خوانده می‌شود، نه از کلاینت.
// FIA_UAU_EXT.3.1: شماره‌ی گام آخرین کد مصرف‌شده نگهداری می‌شود تا همان کد (حتی در پنجره‌ی
// اعتبار خودش) دوباره پذیرفته نشود.
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** تعداد گام‌های مجاز قبل/بعد برای جبران اختلاف ساعت گوشی */
export const TOTP_WINDOW = 1;
const SECRET_BYTES = 20;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** شماره‌ی گام زمانی فعلی از ساعت سرور */
export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  key.fill(0);
  const offset = h[h.length - 1] & 0x0f;
  const bin =
    ((h[offset] & 0x7f) << 24) |
    (h[offset + 1] << 16) |
    (h[offset + 2] << 8) |
    h[offset + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * بررسی کد؛ در صورت درستی شماره‌ی گام منطبق برگردانده می‌شود (برای جلوگیری از استفاده‌ی مجدد).
 * گام‌های کوچک‌تر یا مساوی lastUsedStep پذیرفته نمی‌شوند.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  lastUsedStep: number | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = currentStep(nowMs);
  let matched: number | null = null;
  for (let s = now - TOTP_WINDOW; s <= now + TOTP_WINDOW; s++) {
    const expected = Buffer.from(hotp(secretB32, s));
    // مقایسه‌ی زمان-ثابت؛ حلقه برای همه‌ی گام‌ها کامل اجرا می‌شود
    if (timingSafeEqual(expected, Buffer.from(code)) && matched === null) {
      matched = s;
    }
  }
  if (matched === null) return null;
  if (
    lastUsedStep !== null &&
    lastUsedStep !== undefined &&
    matched <= lastUsedStep
  ) {
    return null;
  }
  return matched;
}

export function otpauthUri(secretB32: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── کدهای بازیابی (lookup secrets) ──
// ۱۰ کد، هر کد ۱۰ کاراکتر از الفبای ۳۲تایی بدون حروف مبهم = ۵۰ بیت آنتروپی.
// چون آنتروپی کمتر از ۱۱۲ بیت است، طبق FIA_UAU_EXT.3.2 با bcrypt (نمک تصادفی ۱۲۸ بیتی) ذخیره می‌شوند.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const bytes = randomBytes(10);
    let s = '';
    for (const b of bytes) s += RECOVERY_ALPHABET[b & 31];
    codes.push(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return codes;
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
