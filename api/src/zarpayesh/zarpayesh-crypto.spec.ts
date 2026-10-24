// api/src/zarpayesh/zarpayesh-crypto.spec.ts
import {
  isValidNationalCode,
  normalizeMobileForZarPayesh,
  parseAesKey,
  zarPayeshDecrypt,
  zarPayeshEncrypt,
  zarPayeshSelfTest,
} from './zarpayesh-crypto';

// کلید نمونه‌ی مستند (صفحه‌ی ۳۰)
const KEY = '1C1C1C1C1C1C1C1C1D1D1D1D1D1D1D1D';

describe('رمزنگاری AES-128-GCM سامانه ناظر', () => {
  it('چیدمان خروجی: Version(1)=1 + Nonce(12) + CipherText(طول داده) + Tag(16) در Base64', () => {
    const enc = zarPayeshEncrypt('09121234567', KEY);
    const raw = Buffer.from(enc, 'base64');
    expect(raw[0]).toBe(1);
    expect(raw.length).toBe(1 + 12 + 11 + 16);
    // طول نمونه‌های مستند هم دقیقاً همین است: کد ملی ۱۰ رقمی → ۳۹ بایت، موبایل ۱۱ رقمی → ۴۰ بایت
    expect(
      Buffer.from(
        'ARTboqNM2Vc72G53aKAfqgQA0LU4krMrAw7OwPgQPL0mfGXBBpsE',
        'base64',
      ).length,
    ).toBe(1 + 12 + 10 + 16);
    expect(
      Buffer.from(
        'AQovX+hj59OzIwiXpJuvM0JF8gGy/++0Ji+b2BrbrG28d8sRqmbPbg==',
        'base64',
      ).length,
    ).toBe(1 + 12 + 11 + 16);
  });

  it('رفت‌وبرگشت؛ Nonce هر بار تصادفی است', () => {
    const a = zarPayeshEncrypt('1637086361', KEY);
    const b = zarPayeshEncrypt('1637086361', KEY);
    expect(a).not.toBe(b);
    expect(zarPayeshDecrypt(a, KEY)).toBe('1637086361');
    expect(zarPayeshDecrypt(b, KEY)).toBe('1637086361');
    expect(zarPayeshSelfTest(KEY)).toBe(true);
  });

  it('کلید اشتباه یا داده‌ی دستکاری‌شده رمزگشایی نمی‌شود', () => {
    const enc = zarPayeshEncrypt('1637086361', KEY);
    expect(() =>
      zarPayeshDecrypt(enc, '00112233445566778899AABBCCDDEEFF'),
    ).toThrow('Unable to decrypt the value.');
    const raw = Buffer.from(enc, 'base64');
    raw[15] ^= 0xff;
    expect(() => zarPayeshDecrypt(raw.toString('base64'), KEY)).toThrow();
  });

  it('اعتبارسنجی کلید و ورودی مطابق نمونه کد C#', () => {
    expect(() => parseAesKey('')).toThrow('AES key is required.');
    expect(() => parseAesKey('ZZ')).toThrow('valid Hex');
    expect(() => parseAesKey('1C1C')).toThrow('exactly 16 bytes');
    expect(parseAesKey(KEY).length).toBe(16);
    expect(() => zarPayeshDecrypt('', KEY)).toThrow(
      'Encrypted value is required.',
    );
    expect(() => zarPayeshDecrypt('AAAA', KEY)).toThrow(
      'Invalid encrypted data.',
    );
    const v2 = Buffer.from(zarPayeshEncrypt('1', KEY), 'base64');
    v2[0] = 2;
    expect(() => zarPayeshDecrypt(v2.toString('base64'), KEY)).toThrow(
      'Unsupported encryption version: 2',
    );
  });

  it('ساختار کد ملی (خطای ۱۰۵۴) و موبایل با صفر اول', () => {
    expect(isValidNationalCode('0012345679')).toBe(true);
    // نمونه‌ی مستند (1637086361) رقم کنترل معتبر ندارد — فقط نمونه است
    expect(isValidNationalCode('1637086361')).toBe(false);
    expect(isValidNationalCode('1111111111')).toBe(false);
    expect(isValidNationalCode('0012345678')).toBe(false);
    expect(normalizeMobileForZarPayesh('+989121234567')).toBe('09121234567');
    expect(normalizeMobileForZarPayesh('9121234567')).toBe('09121234567');
    expect(normalizeMobileForZarPayesh('09121234567')).toBe('09121234567');
  });
});
