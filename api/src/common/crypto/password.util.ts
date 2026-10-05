// api/src/common/crypto/password.util.ts
// FCS_COP_EXT.3.2: ذخیره‌ی رمز عبور با تابع استخراج کلید مورد تأیید (bcrypt، هزینه‌ی ۱۲).
// bcrypt نمک ۱۲۸ بیتی را برای هر رمز با CSPRNG تولید و درون خروجی ذخیره می‌کند.
//
// FIA_UAU_EXT.1.8 و 1.9: bcrypt فقط ۷۲ بایت اول ورودی را در نظر می‌گیرد و بقیه را بی‌صدا
// نادیده می‌گیرد؛ یعنی رمز طولانی (یا رمز فارسی بیش از ~۳۶ حرف) عملاً کوتاه می‌شد.
// قالب جدید «ph1»: ابتدا SHA-384 کل رمز (بدون هیچ تغییری روی ورودی) و سپس bcrypt روی
// base64 آن (۶۴ کاراکتر ASCII، بدون بایت صفر). بنابراین هر بایتِ رمز، با هر طولی، در
// مقایسه اثر دارد. هش‌های قدیمی (bcrypt مستقیم) همچنان پذیرفته و در اولین ورود موفق
// به قالب جدید ارتقا داده می‌شوند.
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;
/** bcrypt فقط ۷۲ بایت اول ورودی را در نظر می‌گیرد */
export const BCRYPT_MAX_BYTES = 72;

const PREHASH_PREFIX = 'ph1$';

function prehash(password: string): string {
  return createHash('sha384').update(password, 'utf8').digest('base64');
}

export async function hashPassword(password: string): Promise<string> {
  return PREHASH_PREFIX + (await bcrypt.hash(prehash(password), BCRYPT_COST));
}

export interface PasswordCheck {
  valid: boolean;
  /** هش با قالب قدیمی است و باید پس از ورود موفق بازتولید شود */
  needsRehash: boolean;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<PasswordCheck> {
  if (!storedHash) {
    await dummyPasswordCheck();
    return { valid: false, needsRehash: false };
  }
  if (storedHash.startsWith(PREHASH_PREFIX)) {
    const valid = await bcrypt.compare(
      prehash(password),
      storedHash.slice(PREHASH_PREFIX.length),
    );
    return { valid, needsRehash: false };
  }
  // قالب قدیمی: ورودی بلندتر از ۷۲ بایت هرگز معادل رمز ذخیره‌شده (که حداکثر ۷۲ بایت بود)
  // در نظر گرفته نمی‌شود — وگرنه هر رشته‌ای که ۷۲ بایت اولش درست باشد پذیرفته می‌شد.
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
    await dummyPasswordCheck();
    return { valid: false, needsRehash: false };
  }
  const valid = await bcrypt.compare(password, storedHash);
  return { valid, needsRehash: valid };
}

// هش ثابت برای یکسان‌سازی زمان پاسخ وقتی حسابی وجود ندارد (FIA_UAU_EXT.2.7). از همان ابتدای
// بارگذاری ساخته می‌شود تا اولین درخواستِ شناسه‌ی ناموجود هزینه‌ی ساخت آن را نپردازد.
const dummyHash: Promise<string> = bcrypt.hash(
  prehash('arkan-dummy-password-for-timing'),
  BCRYPT_COST,
);
export async function dummyPasswordCheck(): Promise<void> {
  await bcrypt.compare(prehash('x'), await dummyHash);
}
