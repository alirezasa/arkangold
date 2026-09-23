// api/src/common/filters/all-exceptions.filter.ts
// فیلتر سراسری خطا — پاسخ به:
// FAU_GEN_EXT.1.7 (بخش موردتوافق: شکست اعتبارسنجی ورودی توسط ValidationPipe)
// FAU_GEN_EXT.1.8 (خطاهای پیش‌بینی‌نشده و شکست کنترل‌های امنیتی)
// رفتار پاسخ‌دهی HTTP دقیقاً همان رفتار پیش‌فرض NestJS حفظ می‌شود؛ تنها یک
// رویداد امنیتی پیش از پاسخ‌دهی ثبت می‌شود.
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { getBusinessRuleViolation } from '../audit/business-rule.util';

interface RequestActor {
  adminUserId?: string;
  userId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  constructor(private readonly auditService: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: RequestActor }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const source = `${req.method} ${req.route?.path ?? req.url}`;
    const ip = req.ip;
    const userAgent = req.headers?.['user-agent'];
    const actor = req.user;

    const businessRule = getBusinessRuleViolation(exception);

    if (businessRule) {
      // FAU_GEN_EXT.1.7 بند ۲: نقض منطق کسب‌وکار (دستکاری ترتیب مراحل یا مقادیر)
      void this.logSecurityEvent(actor, {
        action: 'security.business_rule_violation',
        source,
        ip,
        userAgent,
        newValue: {
          rule: businessRule,
          status,
          message: exception instanceof Error ? exception.message : String(exception),
        },
      });
    } else if (isHttp && status === HttpStatus.BAD_REQUEST && this.isValidationFailure(exception)) {
      // FAU_GEN_EXT.1.7: تلاش برای ارسال ورودی نامعتبر/غیرمجاز (احتمال تزریق یا دستکاری)
      void this.logSecurityEvent(actor, {
        action: 'security.validation_failed',
        source,
        ip,
        userAgent,
        newValue: { status, response: exception.getResponse() },
      });
    } else if (!isHttp || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // FAU_GEN_EXT.1.8: خطای پیش‌بینی‌نشده یا شکست یک کنترل امنیتی
      const message = exception instanceof Error ? exception.message : String(exception);
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`خطای پیش‌بینی‌نشده: ${message}`, stack);
      void this.logSecurityEvent(actor, {
        action: 'security.unexpected_error',
        source,
        ip,
        userAgent,
        newValue: { status, message },
      });
    }

    const responseBody = isHttp
      ? exception.getResponse()
      : { statusCode: status, message: 'خطای داخلی سرور رخ داده است' };

    res
      .status(status)
      .json(
        typeof responseBody === 'string'
          ? { statusCode: status, message: responseBody }
          : responseBody,
      );
  }

  private isValidationFailure(exception: HttpException): boolean {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      return Array.isArray((response as { message?: unknown }).message);
    }
    return false;
  }

  private async logSecurityEvent(
    actor: RequestActor | undefined,
    event: {
      action: string;
      source: string;
      ip?: string;
      userAgent?: string;
      newValue: unknown;
    },
  ): Promise<void> {
    if (actor?.adminUserId) {
      await this.auditService.logAdmin({
        adminUserId: actor.adminUserId,
        success: false,
        ...event,
      });
    } else {
      await this.auditService.logUser({
        userId: actor?.userId ?? null,
        success: false,
        ...event,
      });
    }
  }
}
