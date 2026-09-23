// api/src/common/audit/audited-throttler.guard.ts
import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { AuditService } from './audit.service';

/**
 * FAU_GEN_EXT.1.7 بند ۳: همان ThrottlerGuard سراسری، با این تفاوت که فعال شدن
 * محدودیت نرخ درخواست (پاسخ 429) به‌عنوان رویداد امنیتی با IP و مسیر ثبت می‌شود.
 * این guard پیش از احراز هویت اجرا می‌شود، پس هویت کاربر هنوز در دسترس نیست و IP
 * شناسه‌ی اصلی رویداد است.
 */
@Injectable()
export class AuditedThrottlerGuard extends ThrottlerGuard {
  // تزریق property-based تا سازنده‌ی ThrottlerGuard (با decoratorهای داخلی‌اش) دست نخورد
  @Inject(AuditService) private readonly auditService!: AuditService;

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest();
    void this.auditService.logUser({
      userId: null,
      action: 'security.rate_limit_exceeded',
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
      source: `${req.method} ${req.route?.path ?? req.url}`,
      success: false,
      newValue: {
        limit: throttlerLimitDetail.limit,
        ttlMs: throttlerLimitDetail.ttl,
        totalHits: throttlerLimitDetail.totalHits,
      },
    });
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
