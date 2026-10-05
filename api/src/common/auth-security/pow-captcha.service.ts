// api/src/common/auth-security/pow-captcha.service.ts
//
// «بررسی امنیتی» بدون سرویس خارجی (FIA_UAU_EXT.2.1 بند ۳): چالش اثبات کار (Proof-of-Work)
// به سبک ALTCHA. سرور یک عدد تصادفی محرمانه انتخاب و SHA-256(salt + عدد) را همراه با امضای
// HMAC می‌فرستد؛ مرورگر باید با جست‌وجو عدد را پیدا کند (حدود یک ثانیه برای کاربر عادی، ولی
// هزینه‌ی سنگین برای ارسال انبوه خودکار). چالش ۵ دقیقه اعتبار دارد و فقط یک‌بار پذیرفته می‌شود.
// reCAPTCHA و hCaptcha در ایران در دسترس نیستند؛ این روش به هیچ سرویس بیرونی وابسته نیست.
import { HttpException, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';

const CHALLENGE_TTL_SECONDS = 300;
/** بازه‌ی جست‌وجو؛ میانگین ۴۰ هزار محاسبه‌ی SHA-256 در مرورگر */
export const POW_MAX_NUMBER = 80_000;

export interface PowChallenge {
  algorithm: 'SHA-256';
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
}

interface PowSolution {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}

export class CaptchaRequiredException extends HttpException {
  constructor(invalid = false) {
    super(
      {
        statusCode: 428,
        code: 'CAPTCHA_REQUIRED',
        message: invalid
          ? 'بررسی امنیتی نامعتبر یا منقضی شده است؛ دوباره تلاش کنید'
          : 'برای ادامه، بررسی امنیتی لازم است',
      },
      428,
    );
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class PowCaptchaService {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  private key(): Buffer {
    const base =
      process.env.JWT_TEMP_SECRET ||
      process.env.JWT_ADMIN_SECRET ||
      'arkan-pow-captcha';
    return createHmac('sha256', base).update('pow-captcha-v1').digest();
  }

  private sign(challenge: string) {
    return createHmac('sha256', this.key()).update(challenge).digest('hex');
  }

  issue(): PowChallenge {
    const expires = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
    const salt = `${randomBytes(12).toString('hex')}?expires=${expires}`;
    const secretNumber = randomInt(0, POW_MAX_NUMBER + 1);
    const challenge = sha256(salt + secretNumber);
    return {
      algorithm: 'SHA-256',
      challenge,
      salt,
      maxnumber: POW_MAX_NUMBER,
      signature: this.sign(challenge),
    };
  }

  /** راه‌حل (base64 از JSON) را بررسی و مصرف می‌کند */
  async verify(payload: string | undefined | null): Promise<boolean> {
    if (!payload || payload.length > 2000) return false;
    let sol: PowSolution;
    try {
      sol = JSON.parse(
        Buffer.from(payload, 'base64').toString('utf8'),
      ) as PowSolution;
    } catch {
      return false;
    }
    if (
      sol?.algorithm !== 'SHA-256' ||
      typeof sol.challenge !== 'string' ||
      typeof sol.salt !== 'string' ||
      typeof sol.signature !== 'string' ||
      !Number.isInteger(sol.number)
    ) {
      return false;
    }
    const expected = Buffer.from(this.sign(sol.challenge), 'hex');
    const given = Buffer.from(sol.signature, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return false;
    }
    const expires = Number(/[?&]expires=(\d+)/.exec(sol.salt)?.[1] ?? 0);
    if (!expires || expires < Date.now() / 1000) return false;
    if (sha256(sol.salt + sol.number) !== sol.challenge) return false;
    // یک‌بار مصرف
    const fresh = await this.redis.set(
      `pow:used:${sol.challenge}`,
      '1',
      'EX',
      CHALLENGE_TTL_SECONDS + 60,
      'NX',
    );
    return fresh === 'OK';
  }

  /** اگر لازم است و راه‌حل معتبر ارسال نشده، 428 با کد CAPTCHA_REQUIRED */
  async enforce(required: boolean, payload?: string | null) {
    if (!required) return;
    if (!payload) throw new CaptchaRequiredException();
    if (!(await this.verify(payload))) throw new CaptchaRequiredException(true);
  }
}
