// api/src/common/auth-security/otp-send-limiter.service.ts
//
// FIA_AUX_EXT.1.2: محدودیت ارسال کد پیامکی برای هر شماره (مستقل از IP):
// حداقل ۶۰ ثانیه فاصله بین دو ارسال و حداکثر ۵ ارسال در ساعت برای هر شماره و هر هدف.
// همراه با سقف ۵ تلاش برای هر کد، حدس کد ۶ رقمی عملاً ناممکن است (حداکثر ۲۵ حدس در ساعت
// از ۱٬۰۰۰٬۰۰۰ حالت). پاسخ برای شماره‌های ثبت‌شده و ثبت‌نشده یکسان است (FIA_UAU_EXT.2.7).
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export const OTP_RESEND_GAP_SECONDS = 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;

@Injectable()
export class OtpSendLimiterService {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  /** در صورت مجاز بودن، سهمیه را مصرف می‌کند؛ وگرنه 429 */
  async consume(phone: string, purpose: string) {
    const gapKey = `otp-send:gap:${purpose}:${phone}`;
    const hourKey = `otp-send:hour:${purpose}:${phone}`;
    const gapTtl = await this.redis.ttl(gapKey);
    if (gapTtl > 0) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'OTP_RESEND_TOO_SOON',
          message: `برای دریافت کد جدید ${gapTtl.toLocaleString('fa-IR')} ثانیه دیگر صبر کنید`,
          retryAfter: gapTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sends = await this.redis.incr(hourKey);
    if (sends === 1) await this.redis.expire(hourKey, 3600);
    if (sends > OTP_MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'OTP_HOURLY_LIMIT',
          message:
            'تعداد درخواست کد برای این شماره بیش از حد مجاز است؛ ساعتی دیگر تلاش کنید',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.redis.setex(gapKey, OTP_RESEND_GAP_SECONDS, '1');
  }

  /** ارسال ناموفق نباید مانع تلاش دوباره شود */
  async release(phone: string, purpose: string) {
    await this.redis.del(`otp-send:gap:${purpose}:${phone}`);
    await this.redis.decr(`otp-send:hour:${purpose}:${phone}`);
  }
}
