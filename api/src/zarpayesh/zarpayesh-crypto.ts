// api/src/zarpayesh/zarpayesh-crypto.ts
//
// رمز کردن کد ملی و شماره موبایل برای سامانه ناظر — ترجمه‌ی خط به خط نمونه کد C# مستند
// (AesGcmEncryptionService، صفحات ۲۶ تا ۳۱):
//   الگوریتم AES-128-GCM، کلید ۱۶ بایتی به‌صورت Hex، Nonce تصادفی ۱۲ بایتی، Tag ۱۶ بایتی
//   چیدمان خروجی: Version(1 بایت = 1) + Nonce(12) + CipherText(طول داده) + Tag(16) → Base64
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const AES_KEY_SIZE = 16;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;
const VERSION = 1;

export class ZarPayeshCryptoError extends Error {}

/** معادل ConvertKey: کلید Hex باید دقیقاً ۱۶ بایت باشد */
export function parseAesKey(hexKey: string | null | undefined): Buffer {
  if (!hexKey || !hexKey.trim()) {
    throw new ZarPayeshCryptoError('AES key is required.');
  }
  const clean = hexKey.trim();
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new ZarPayeshCryptoError('AES key must be a valid Hex string.');
  }
  const key = Buffer.from(clean, 'hex');
  if (key.length !== AES_KEY_SIZE) {
    throw new ZarPayeshCryptoError(
      `AES key must be exactly ${AES_KEY_SIZE} bytes.`,
    );
  }
  return key;
}

/** AES-128-GCM ENCRYPT */
export function zarPayeshEncrypt(plaintext: string, hexKey: string): string {
  if (plaintext == null) throw new ZarPayeshCryptoError('plaintext is null');
  const key = parseAesKey(hexKey);
  const nonce = randomBytes(NONCE_SIZE);
  const cipher = createCipheriv('aes-128-gcm', key, nonce, {
    authTagLength: TAG_SIZE,
  });
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([VERSION]),
    nonce,
    ciphertext,
    tag,
  ]).toString('base64');
}

/** AES-128-GCM DECRYPT */
export function zarPayeshDecrypt(
  encryptedValue: string,
  hexKey: string,
): string {
  if (!encryptedValue || !encryptedValue.trim()) {
    throw new ZarPayeshCryptoError('Encrypted value is required.');
  }
  const key = parseAesKey(hexKey);
  const data = Buffer.from(encryptedValue.trim(), 'base64');
  // Buffer.from در Node روی Base64 نامعتبر خطا نمی‌دهد؛ معادل FormatException نسخه‌ی C#
  if (
    data.toString('base64').replace(/=+$/, '') !==
    encryptedValue.trim().replace(/=+$/, '')
  ) {
    throw new ZarPayeshCryptoError('Encrypted value is not valid Base64.');
  }
  if (data.length < 1 + NONCE_SIZE + TAG_SIZE) {
    throw new ZarPayeshCryptoError('Invalid encrypted data.');
  }
  let offset = 0;
  const version = data[offset++];
  if (version !== VERSION) {
    throw new ZarPayeshCryptoError(
      `Unsupported encryption version: ${version}`,
    );
  }
  const nonce = data.subarray(offset, offset + NONCE_SIZE);
  offset += NONCE_SIZE;
  const ciphertextLength = data.length - 1 - NONCE_SIZE - TAG_SIZE;
  const ciphertext = data.subarray(offset, offset + ciphertextLength);
  offset += ciphertextLength;
  const tag = data.subarray(offset, offset + TAG_SIZE);
  try {
    const decipher = createDecipheriv('aes-128-gcm', key, nonce, {
      authTagLength: TAG_SIZE,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ZarPayeshCryptoError('Unable to decrypt the value.');
  }
}

/** آزمون رفت‌وبرگشت با کلید ثبت‌شده (بدون افشای کلید) — برای «آزمون اتصال» پنل */
export function zarPayeshSelfTest(hexKey: string): boolean {
  const sample = '0012345679';
  const enc = zarPayeshEncrypt(sample, hexKey);
  const dec = zarPayeshDecrypt(enc, hexKey);
  return timingSafeEqual(Buffer.from(dec), Buffer.from(sample));
}

/** ساختار کد ملی (رقم کنترل) — خطای ۱۰۵۴ را پیش از ارسال می‌گیریم */
export function isValidNationalCode(code: string | null | undefined): boolean {
  if (!code || !/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const r = sum % 11;
  return r < 2 ? digits[9] === r : digits[9] === 11 - r;
}

/**
 * «به هنگام Encrypt این مقدار، شماره موبایل بایستی با صفر اول شروع شده باشد»
 * +989121234567 / 989121234567 / 9121234567 → 09121234567
 */
export function normalizeMobileForZarPayesh(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  if (/^00989\d{9}$/.test(digits)) return `0${digits.slice(4)}`;
  return digits;
}
