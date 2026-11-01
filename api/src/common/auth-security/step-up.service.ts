// api/src/common/auth-security/step-up.service.ts
//
// FTA_TSE_EXT.4.2 — تأیید ثانویه پیش از تراکنش‌ها و عملیات بسیار حساس، حتی با نشست فعال:
//   کاربر: کد پیامکی یک‌بارمصرف (یا کد برنامه‌ی احراز هویت اگر فعال باشد) برای همان عملیات؛ پس از
//          تأیید، «توکن تأیید» یک‌بارمصرف ۵ دقیقه‌ای صادر می‌شود که فقط برای همان کاربر، همان نشست
//          و همان نوع عملیات در سرآیند X-Step-Up-Token پذیرفته و با اولین استفاده مصرف می‌شود.
//   ادمین: کد برنامه‌ی احراز هویت (TOTP، یک‌بارمصرف) در سرآیند X-Step-Up-Code برای همان درخواست.
// کد و توکن با مولد امن (CSPRNG) ساخته و فقط هش آن‌ها در Redis نگه داشته می‌شود؛ ۵ تلاش اشتباه
// چالش را باطل می‌کند.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsTemplateService } from '../../notifications/sms-template.service';
import { AuditService } from '../audit/audit.service';
import { MfaService } from '../mfa/mfa.service';
import { maskPhone } from '../audit/mask.util';

export const STEP_UP_PURPOSES = {
  withdrawal: 'ثبت درخواست برداشت',
  internal_transfer: 'انتقال موجودی به کاربر دیگر',
  bank_account_add: 'افزودن حساب بانکی',
} as const;
export type StepUpPurpose = keyof typeof STEP_UP_PURPOSES;

export const STEP_UP_TOKEN_HEADER = 'x-step-up-token';
export const STEP_UP_CODE_HEADER = 'x-step-up-code';

const CHALLENGE_TTL = 180;
const TOKEN_TTL = 300;
const MAX_ATTEMPTS = 5;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

interface Challenge {
  userId: string;
  sessionId: string;
  purpose: StepUpPurpose;
  method: 'SMS' | 'TOTP';
  codeHash?: string;
  attempts: number;
}

@Injectable()
export class StepUpService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsTemplateService,
    private audit: AuditService,
    private mfa: MfaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  /** شروع تأیید: کد پیامکی ارسال می‌شود (یا کاربر کد برنامه‌ی احراز هویت را وارد می‌کند) */
  async start(userId: string, sessionId: string, purpose: StepUpPurpose) {
    if (!(purpose in STEP_UP_PURPOSES)) {
      throw new BadRequestException('نوع عملیات نامعتبر است');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, totpEnabled: true },
    });
    if (!user) throw new ForbiddenException();
    // محدودیت ارسال: حداکثر یک کد در هر ۶۰ ثانیه برای هر کاربر
    const gate = await this.redis.set(
      `stepup-send:${userId}`,
      '1',
      'EX',
      60,
      'NX',
    );
    const method: Challenge['method'] = user.totpEnabled ? 'TOTP' : 'SMS';
    if (method === 'SMS' && gate !== 'OK') {
      throw new BadRequestException({
        message: 'کد تأیید به‌تازگی ارسال شده است؛ کمی صبر کنید',
        code: 'STEP_UP_RESEND_TOO_SOON',
      });
    }
    const challengeToken = randomBytes(32).toString('base64url');
    const challenge: Challenge = {
      userId,
      sessionId,
      purpose,
      method,
      attempts: 0,
    };
    if (method === 'SMS') {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      challenge.codeHash = sha256(`${challengeToken}:${code}`);
      await this.sms.sendToUser(
        'AUTH_STEP_UP_OTP',
        userId,
        { code, change: STEP_UP_PURPOSES[purpose] },
        { referenceType: 'STEP_UP' },
      );
    }
    await this.redis.set(
      `stepup-ch:${sha256(challengeToken)}`,
      JSON.stringify(challenge),
      'EX',
      CHALLENGE_TTL,
    );
    return {
      challengeToken,
      method,
      purpose,
      action: STEP_UP_PURPOSES[purpose],
      maskedPhone: method === 'SMS' ? maskPhone(user.phone) : undefined,
      expiresIn: CHALLENGE_TTL,
    };
  }

  /** بررسی کد و صدور توکن تأیید یک‌بارمصرف */
  async verify(
    userId: string,
    sessionId: string,
    challengeToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const key = `stepup-ch:${sha256(challengeToken ?? '')}`;
    const raw = await this.redis.get(key);
    const ch = raw ? (JSON.parse(raw) as Challenge) : null;
    if (!ch || ch.userId !== userId || ch.sessionId !== sessionId) {
      throw new BadRequestException({
        message: 'درخواست تأیید منقضی شده است؛ دوباره تلاش کنید',
        code: 'STEP_UP_EXPIRED',
      });
    }
    let ok = false;
    if (ch.method === 'SMS') {
      const expected = Buffer.from(ch.codeHash ?? '', 'hex');
      const actual = Buffer.from(
        sha256(`${challengeToken}:${(code ?? '').trim()}`),
        'hex',
      );
      ok =
        expected.length === actual.length && timingSafeEqual(expected, actual);
    } else {
      ok = !!(await this.mfa.verify({ kind: 'user', id: userId }, code));
    }
    if (!ok) {
      ch.attempts += 1;
      if (ch.attempts >= MAX_ATTEMPTS) await this.redis.del(key);
      else await this.redis.set(key, JSON.stringify(ch), 'KEEPTTL');
      await this.audit.logUser({
        userId,
        action: 'auth.step_up',
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        source: StepUpService.name,
        success: false,
        newValue: {
          purpose: ch.purpose,
          method: ch.method,
          attempts: ch.attempts,
        },
      });
      throw new BadRequestException({
        message:
          ch.attempts >= MAX_ATTEMPTS
            ? 'تعداد تلاش‌ها زیاد بود؛ دوباره کد بگیرید'
            : 'کد تأیید نادرست است',
        code: 'STEP_UP_INVALID',
      });
    }
    await this.redis.del(key);
    const stepUpToken = randomBytes(32).toString('base64url');
    await this.redis.set(
      `stepup-ok:${sha256(stepUpToken)}`,
      JSON.stringify({ userId, sessionId, purpose: ch.purpose }),
      'EX',
      TOKEN_TTL,
    );
    await this.audit.logUser({
      userId,
      action: 'auth.step_up',
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      source: StepUpService.name,
      success: true,
      newValue: { purpose: ch.purpose, method: ch.method },
    });
    return { stepUpToken, purpose: ch.purpose, expiresIn: TOKEN_TTL };
  }

  /** مصرف اتمی توکن تأیید برای همان کاربر، نشست و عملیات */
  async consume(
    userId: string,
    sessionId: string,
    purpose: StepUpPurpose,
    token: string | undefined,
  ): Promise<boolean> {
    if (!token || token.length > 128) return false;
    // خواندن و حذف در یک تراکنش (MULTI) تا یک توکن دو بار مصرف نشود
    const key = `stepup-ok:${sha256(token)}`;
    const res = await this.redis.multi().get(key).del(key).exec();
    const raw = res?.[0]?.[1] as string | null | undefined;
    if (!raw) return false;
    const v = JSON.parse(raw) as {
      userId: string;
      sessionId: string;
      purpose: string;
    };
    return (
      v.userId === userId && v.sessionId === sessionId && v.purpose === purpose
    );
  }

  /** ادمین: آیا برنامه‌ی احراز هویت فعال است؟ (بدون آن تأیید ثانویه ممکن نیست) */
  adminMfaEnabled(adminUserId: string) {
    return this.mfa.isEnabled({ kind: 'admin', id: adminUserId });
  }

  /** ادمین: کد برنامه‌ی احراز هویت (یک‌بارمصرف) برای همین درخواست */
  async verifyAdminCode(adminUserId: string, code: string | undefined) {
    if (!code) return false;
    return !!(await this.mfa.verify({ kind: 'admin', id: adminUserId }, code));
  }
}
