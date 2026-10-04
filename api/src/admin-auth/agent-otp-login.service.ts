// api/src/admin-auth/agent-otp-login.service.ts
//
// ورود نمایندگان فروش به panel.arkan.gold با کد یکبارمصرف پیامکی.
// فقط «ورود» است، نه ثبت‌نام: کد تنها برای شماره‌ای ارسال می‌شود که مدیر سیستم
// روی یک حساب ورود نماینده‌ی فعال ثبت کرده باشد. پاسخ درخواست کد برای شماره‌ی
// ثبت‌نشده و ثبت‌شده یکسان است تا شماره‌ی نمایندگان قابل شناسایی نباشد.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { maskPhone } from '../common/audit/mask.util';
import { isOtpDebugLogEnabled } from '../common/logging/otp-debug';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { AdminAuthService } from './admin-auth.service';
import { ADMIN_ROLES_INCLUDE } from './admin-roles.util';

const AUDIT_SOURCE = 'AgentOtpLoginService';

export const AGENT_OTP_TTL_SECONDS = 180;
export const AGENT_OTP_RESEND_GAP_SECONDS = 60;
const AGENT_OTP_MAX_ATTEMPTS = 5;
/** سقف ارسال کد برای هر شماره در یک ساعت */
const AGENT_OTP_MAX_SENDS_PER_HOUR = 5;

const GENERIC_SENT_MESSAGE =
  'اگر این شماره برای حساب نمایندگی ثبت شده باشد، کد ورود به آن پیامک می‌شود';
const INVALID_CODE_MESSAGE = 'کد ورود نادرست یا منقضی شده است';

const keys = (phone: string) => ({
  code: `agent-otp:code:${phone}`,
  attempts: `agent-otp:attempts:${phone}`,
  gap: `agent-otp:gap:${phone}`,
  hourly: `agent-otp:hourly:${phone}`,
});

interface StoredCode {
  accountId: string;
  hash: string;
}

interface RequestCtx {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AgentOtpLoginService {
  private readonly logger = new Logger(AgentOtpLoginService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private adminAuth: AdminAuthService,
    private smsTemplates: SmsTemplateService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  async requestCode(rawPhone: string, ctx: RequestCtx = {}) {
    const phone = normalizeIranMobile(rawPhone);
    if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
    const k = keys(phone);

    // فاصله‌ی ارسال مجدد و سقف ساعتی برای همه‌ی شماره‌ها یکسان اعمال می‌شود
    const gapTtl = await this.redis.ttl(k.gap);
    if (gapTtl > 0) {
      throw new HttpException(
        `لطفاً ${gapTtl.toLocaleString('fa-IR')} ثانیه دیگر دوباره تلاش کنید`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sends = await this.redis.incr(k.hourly);
    if (sends === 1) await this.redis.expire(k.hourly, 3600);
    if (sends > AGENT_OTP_MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        'تعداد درخواست کد برای این شماره بیش از حد مجاز است؛ ساعتی دیگر تلاش کنید',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.redis.setex(k.gap, AGENT_OTP_RESEND_GAP_SECONDS, '1');

    const response = {
      message: GENERIC_SENT_MESSAGE,
      expiresIn: AGENT_OTP_TTL_SECONDS,
      resendAfter: AGENT_OTP_RESEND_GAP_SECONDS,
    };

    const accounts = await this.prisma.adminUser.findMany({
      where: {
        phone,
        agentId: { not: null },
        isActive: true,
        agent: { status: { not: 'TERMINATED' } },
      },
      select: { id: true, lockedUntil: true },
      take: 2,
    });

    const reason =
      accounts.length === 0
        ? 'not_registered'
        : accounts.length > 1
          ? 'ambiguous_phone'
          : accounts[0].lockedUntil && accounts[0].lockedUntil > new Date()
            ? 'locked'
            : null;
    if (reason) {
      await this.auditService.logAdmin({
        adminUserId: accounts.length === 1 ? accounts[0].id : null,
        actorLabel: maskPhone(phone),
        action: 'admin_auth.login_otp_request',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason },
      });
      if (reason === 'ambiguous_phone') {
        this.logger.warn(
          `[AgentOtp] شماره ${maskPhone(phone)} روی بیش از یک حساب نماینده ثبت است؛ کد ارسال نشد`,
        );
      }
      return response;
    }

    const accountId = accounts[0].id;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const stored: StoredCode = { accountId, hash: this.hash(accountId, code) };
    await this.redis.setex(
      k.code,
      AGENT_OTP_TTL_SECONDS,
      JSON.stringify(stored),
    );
    await this.redis.del(k.attempts);

    if (isOtpDebugLogEnabled()) {
      this.logger.warn(`[AgentOtp] ${phone}: ${code}`);
    }
    try {
      await this.smsTemplates.send(
        'AGENT_LOGIN_OTP',
        phone,
        { code },
        {
          throwOnFailure: true,
          referenceType: 'AGENT_LOGIN_OTP',
          referenceId: accountId,
        },
      );
    } catch (err) {
      this.logger.error(
        `ارسال کد ورود نماینده به ${maskPhone(phone)} ناموفق بود: ${(err as Error).message}`,
      );
      // کد ارسال‌نشده نباید معتبر بماند یا مانع تلاش دوباره شود
      await this.redis.del(k.code, k.gap);
      throw new ServiceUnavailableException(
        'ارسال پیامک کد ورود ناموفق بود؛ لحظاتی دیگر دوباره تلاش کنید',
      );
    }

    await this.auditService.logAdmin({
      adminUserId: accountId,
      action: 'admin_auth.login_otp_request',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return response;
  }

  async verifyCode(rawPhone: string, rawCode: string, ctx: RequestCtx = {}) {
    const phone = normalizeIranMobile(rawPhone);
    if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
    const code = (rawCode ?? '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\D/g, '');
    const k = keys(phone);

    const raw = await this.redis.get(k.code);
    if (!raw) throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    const stored = JSON.parse(raw) as StoredCode;

    const attempts = await this.redis.incr(k.attempts);
    if (attempts === 1)
      await this.redis.expire(k.attempts, AGENT_OTP_TTL_SECONDS);
    if (attempts > AGENT_OTP_MAX_ATTEMPTS) {
      await this.redis.del(k.code, k.attempts);
      await this.auditFailure(stored.accountId, ctx, 'too_many_attempts');
      throw new ForbiddenException(
        'تعداد تلاش‌های مجاز به پایان رسید؛ کد جدید دریافت کنید',
      );
    }

    const expected = Buffer.from(stored.hash, 'hex');
    const given = Buffer.from(this.hash(stored.accountId, code), 'hex');
    if (
      code.length !== 6 ||
      expected.length !== given.length ||
      !timingSafeEqual(expected, given)
    ) {
      await this.auditFailure(stored.accountId, ctx, 'invalid_code');
      const remaining = AGENT_OTP_MAX_ATTEMPTS - attempts;
      throw new UnauthorizedException(
        remaining > 0
          ? `کد ورود نادرست است (${remaining.toLocaleString('fa-IR')} تلاش باقی‌مانده)`
          : INVALID_CODE_MESSAGE,
      );
    }

    // مصرف یکباره‌ی کد — در درخواست‌های هم‌زمان فقط یکی موفق می‌شود
    const consumed = await this.redis.del(k.code);
    await this.redis.del(k.attempts);
    if (consumed !== 1) throw new UnauthorizedException(INVALID_CODE_MESSAGE);

    // وضعیت حساب در لحظه‌ی ورود دوباره بررسی می‌شود
    const account = await this.prisma.adminUser.findUnique({
      where: { id: stored.accountId },
      include: { ...ADMIN_ROLES_INCLUDE, agent: { select: { status: true } } },
    });
    if (
      !account ||
      !account.isActive ||
      !account.agentId ||
      account.phone !== phone ||
      account.agent?.status === 'TERMINATED'
    ) {
      await this.auditFailure(stored.accountId, ctx, 'account_unavailable');
      throw new ForbiddenException('حساب نمایندگی فعال نیست');
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      await this.auditFailure(stored.accountId, ctx, 'locked');
      throw new ForbiddenException(
        'حساب شما موقتاً قفل شده است؛ چند دقیقه دیگر تلاش کنید',
      );
    }

    return this.adminAuth.completeLogin(
      account,
      ctx.ip,
      ctx.userAgent,
      'admin_auth.login_otp',
    );
  }

  private auditFailure(accountId: string, ctx: RequestCtx, reason: string) {
    return this.auditService.logAdmin({
      adminUserId: accountId,
      action: 'admin_auth.login_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: false,
      newValue: { reason },
    });
  }

  /** HMAC کد با کلید سرور و شناسه‌ی حساب (کد خام ذخیره نمی‌شود) */
  private hash(accountId: string, code: string) {
    const key =
      process.env.JWT_ADMIN_SECRET ||
      process.env.INTEGRATION_ENCRYPTION_KEY ||
      'agent-login-otp';
    return createHmac('sha256', key)
      .update(`agent-login:${accountId}:${code}`)
      .digest('hex');
  }
}
