// api/src/common/auth-security/login-challenge.service.ts
//
// وضعیت ورود چندمرحله‌ای (رمز ← تغییر رمز موقت ← راه‌اندازی/بررسی عامل دوم) در Redis.
// پس از تأیید عامل اول فقط یک «توکن مرحله» تصادفی ۲۵۶ بیتی به کلاینت داده می‌شود؛ نشست واقعی
// تنها وقتی صادر می‌شود که همه‌ی مراحل کامل شده باشد (FIA_UAU_EXT.2.3). هر مرحله حداکثر ۵ تلاش
// و ۱۰ دقیقه مهلت دارد و توکن به همان IP/مرورگر محدود نیست ولی در Redis فقط هش آن نگهداری می‌شود.
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomBytes } from 'crypto';

export type ChallengeStage =
  'SMS_OTP' | 'TOTP' | 'CHANGE_PASSWORD' | 'MFA_SETUP' | 'MFA_VERIFY';

export interface LoginChallenge {
  kind: 'user' | 'admin';
  accountId: string;
  stage: ChallengeStage;
  /** روش ورود اولیه برای ثبت در گزارش (رمز یا کد پیامکی نماینده) */
  via: 'password' | 'agent_otp';
  /** ورود یا بازنشانی رمز (بازنشانی هم باید عامل دوم فعال را بگذراند — FIA_UID_EXT.1.3) */
  purpose?: 'login' | 'reset';
  /** شناسه‌ی ورود (شماره/نام کاربری) برای پاک کردن شمارنده‌ی تلاش‌ها پس از موفقیت */
  identifier?: string;
  attempts: number;
  createdAt: number;
}

const TTL_SECONDS = 600;
export const MAX_CHALLENGE_ATTEMPTS = 5;
const EXPIRED_MESSAGE =
  'مهلت این مرحله‌ی ورود به پایان رسیده است؛ دوباره وارد شوید';

const keyOf = (token: string) =>
  `login-ch:${createHash('sha256').update(token).digest('hex')}`;

@Injectable()
export class LoginChallengeService {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  async create(
    data: Omit<LoginChallenge, 'attempts' | 'createdAt'>,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const value: LoginChallenge = {
      ...data,
      attempts: 0,
      createdAt: Date.now(),
    };
    await this.redis.setex(keyOf(token), TTL_SECONDS, JSON.stringify(value));
    return token;
  }

  async get(
    token: string | undefined,
    kind: LoginChallenge['kind'],
    stages: ChallengeStage[],
  ): Promise<LoginChallenge> {
    if (!token || token.length > 100)
      throw new UnauthorizedException(EXPIRED_MESSAGE);
    const raw = await this.redis.get(keyOf(token));
    if (!raw) throw new UnauthorizedException(EXPIRED_MESSAGE);
    const ch = JSON.parse(raw) as LoginChallenge;
    if (ch.kind !== kind || !stages.includes(ch.stage)) {
      throw new UnauthorizedException(EXPIRED_MESSAGE);
    }
    return ch;
  }

  /** مرحله‌ی بعد؛ شمارنده‌ی تلاش صفر می‌شود و مهلت تمدید */
  async advance(token: string, ch: LoginChallenge, stage: ChallengeStage) {
    const next: LoginChallenge = { ...ch, stage, attempts: 0 };
    await this.redis.setex(keyOf(token), TTL_SECONDS, JSON.stringify(next));
    return next;
  }

  /** ثبت تلاش ناموفق؛ پس از ۵ تلاش توکن باطل می‌شود. تعداد تلاش باقی‌مانده برگردانده می‌شود */
  async fail(token: string, ch: LoginChallenge): Promise<number> {
    const attempts = ch.attempts + 1;
    if (attempts >= MAX_CHALLENGE_ATTEMPTS) {
      await this.redis.del(keyOf(token));
      return 0;
    }
    const ttl = await this.redis.ttl(keyOf(token));
    await this.redis.setex(
      keyOf(token),
      Math.max(ttl, 1),
      JSON.stringify({ ...ch, attempts }),
    );
    return MAX_CHALLENGE_ATTEMPTS - attempts;
  }

  /** پایان موفق؛ توکن فقط یک‌بار قابل استفاده است */
  async consume(token: string): Promise<boolean> {
    return (await this.redis.del(keyOf(token))) === 1;
  }
}
