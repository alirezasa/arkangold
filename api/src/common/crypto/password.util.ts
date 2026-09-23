// api/src/common/crypto/password.util.ts
// FCS_COP_EXT.3.2: ذخیره‌ی رمز عبور با تابع استخراج کلید مورد تأیید (bcrypt، هزینه‌ی ۱۲).
// bcrypt نمک ۱۲۸ بیتی را برای هر رمز با CSPRNG تولید و درون خروجی ذخیره می‌کند.
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;
/** bcrypt فقط ۷۲ بایت اول ورودی را در نظر می‌گیرد؛ بیشتر از آن بی‌صدا نادیده گرفته می‌شد */
export const BCRYPT_MAX_BYTES = 72;

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
    throw new BadRequestException(
      'رمز عبور طولانی‌تر از حد مجاز است (حداکثر ۷۲ بایت؛ حدود ۳۶ حرف فارسی یا ۷۲ حرف انگلیسی)',
    );
  }
  return bcrypt.hash(password, BCRYPT_COST);
}
