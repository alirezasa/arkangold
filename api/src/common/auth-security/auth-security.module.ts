// api/src/common/auth-security/auth-security.module.ts
import { Controller, Get, Global, Module } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { MfaService } from '../mfa/mfa.service';
import { LoginThrottleService } from './login-throttle.service';
import { PowCaptchaService } from './pow-captcha.service';
import { OtpSendLimiterService } from './otp-send-limiter.service';
import { LoginAlertService } from './login-alert.service';
import { LoginChallengeService } from './login-challenge.service';
import { CredentialExpiryService } from './credential-expiry.service';

/** مسیرهای عمومی مشترک ورود کاربران و پنل‌ها */
@Controller('auth-security')
export class AuthSecurityController {
  constructor(
    private captcha: PowCaptchaService,
    private policy: PasswordPolicyService,
  ) {}

  /** چالش «بررسی امنیتی» (Proof-of-Work) — مرورگر حل می‌کند و همراه درخواست ورود می‌فرستد */
  @Get('challenge')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  challenge() {
    return this.captcha.issue();
  }

  /** قواعد رمز عبور برای نمایش در فرم‌ها (بدون قاعده‌ی ترکیب کاراکتر) */
  @Get('password-policy')
  async passwordPolicy() {
    const p = await this.policy.describe();
    return {
      userMinLength: p.userMinLength,
      adminMinLength: p.adminMinLength,
      maxLength: p.maxLength,
    };
  }
}

@Global()
@Module({
  controllers: [AuthSecurityController],
  providers: [
    PasswordPolicyService,
    MfaService,
    LoginThrottleService,
    PowCaptchaService,
    OtpSendLimiterService,
    LoginAlertService,
    LoginChallengeService,
    CredentialExpiryService,
  ],
  exports: [
    PasswordPolicyService,
    MfaService,
    LoginThrottleService,
    PowCaptchaService,
    OtpSendLimiterService,
    LoginAlertService,
    LoginChallengeService,
    CredentialExpiryService,
  ],
})
export class AuthSecurityModule {}
