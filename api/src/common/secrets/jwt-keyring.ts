// api/src/common/secrets/jwt-keyring.ts
// FCS_COP_EXT.1.2 / FCS_COP_EXT.4.1 / FCS_CKM_EXT.1.2 — مدیریت کلیدهای JWT:
// - الگوریتم ثابت HS256 (HMAC-SHA256)؛ هیچ الگوریتم دیگری (از جمله none) پذیرفته نمی‌شود.
// - چرخش کلید بدون بیرون انداختن کاربران: توکن با شناسه‌ی کلید (kid) امضا می‌شود و در
//   دوره‌ی گذار، توکن‌های امضاشده با کلید قبلی (NAME_PREVIOUS) هم پذیرفته می‌شوند.
//   روش چرخش: مقدار فعلی را در NAME_PREVIOUS و کلید جدید را در NAME قرار دهید؛ پس از
//   گذشت عمر بیشینه‌ی توکن، NAME_PREVIOUS را حذف کنید.
import { createHash } from 'crypto';

export const JWT_ALGORITHM = 'HS256' as const;

export const JWT_KEY_NAMES = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_TEMP_SECRET',
  'JWT_RESET_SECRET',
  'JWT_ADMIN_SECRET',
  'JWT_ADMIN_REFRESH_SECRET',
] as const;

export type JwtKeyName = (typeof JWT_KEY_NAMES)[number];

/** شناسه‌ی کلید: خلاصه‌ی SHA-256 — خود کلید را افشا نمی‌کند (کلید ≥ ۲۵۶ بیت اجباری است) */
function keyIdOf(secret: string): string {
  return createHash('sha256').update(`jwt-kid:${secret}`).digest('hex').slice(0, 16);
}

export interface JwtKeyStatus {
  name: JwtKeyName;
  configured: boolean;
  bits: number;
  keyId: string | null;
  rotationInProgress: boolean;
  previousKeyId: string | null;
}

/** وضعیت کلیدها برای پنل ادمین — فقط طول و شناسه، هرگز خود کلید */
export function jwtKeyStatus(): JwtKeyStatus[] {
  return JWT_KEY_NAMES.map((name) => {
    const current = process.env[name];
    const previous = process.env[`${name}_PREVIOUS`];
    return {
      name,
      configured: !!current,
      bits: current ? Buffer.byteLength(current, 'utf8') * 8 : 0,
      keyId: current ? keyIdOf(current) : null,
      rotationInProgress: !!previous,
      previousKeyId: previous ? keyIdOf(previous) : null,
    };
  });
}

function requireSecret(name: JwtKeyName): string {
  const secret = process.env[name];
  if (!secret) throw new Error(`${name} تنظیم نشده است`);
  return secret;
}

/** گزینه‌های امضا: کلید فعلی + kid + الگوریتم ثابت */
export function jwtSignOptions(name: JwtKeyName) {
  const secret = requireSecret(name);
  return { secret, keyid: keyIdOf(secret), algorithm: JWT_ALGORITHM };
}

/** کلید مناسب برای اعتبارسنجی توکن بر اساس kid هدر آن؛ اگر kid ناشناخته باشد undefined */
export function jwtVerificationSecret(name: JwtKeyName, token: string): string | undefined {
  const current = process.env[name];
  const previous = process.env[`${name}_PREVIOUS`];

  let kid: unknown;
  try {
    kid = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')).kid;
  } catch {
    return undefined;
  }
  // توکن‌های صادرشده پیش از فعال شدن kid: فقط با کلید فعلی
  if (kid === undefined) return current;
  if (current && keyIdOf(current) === kid) return current;
  if (previous && keyIdOf(previous) === kid) return previous;
  return undefined;
}

/** گزینه‌های verify برای jwtService.verify؛ کلید ناشناخته → رشته‌ی خالی که verify را ناموفق می‌کند */
export function jwtVerifyOptions(name: JwtKeyName, token: string) {
  return {
    secret: jwtVerificationSecret(name, token) ?? '',
    algorithms: [JWT_ALGORITHM],
  };
}
