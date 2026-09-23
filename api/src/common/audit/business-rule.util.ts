// api/src/common/audit/business-rule.util.ts
// FAU_GEN_EXT.1.7 بند ۲ (نقض منطق کسب‌وکار): یک استثنای موجود را به‌عنوان «نقض قاعده‌ی
// کسب‌وکار» برچسب می‌زند تا AllExceptionsFilter آن را به‌صورت رویداد امنیتی ثبت کند.
// کلاس استثنا، کد وضعیت HTTP و بدنه‌ی پاسخ هیچ تغییری نمی‌کنند؛ بنابراین همه‌ی
// بررسی‌های instanceof موجود در کد (مثلاً translateDbError) دست‌نخورده کار می‌کنند.
import { HttpException } from '@nestjs/common';

const BUSINESS_RULE = Symbol('businessRuleViolation');

export function businessRuleViolation<T extends HttpException>(
  exception: T,
  rule: string,
): T {
  (exception as unknown as Record<symbol, string>)[BUSINESS_RULE] = rule;
  return exception;
}

export function getBusinessRuleViolation(exception: unknown): string | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  return (exception as Record<symbol, string | undefined>)[BUSINESS_RULE];
}
