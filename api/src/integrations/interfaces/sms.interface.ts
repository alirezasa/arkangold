/**
 * Contract مشترک ارسال پیامک — هر سامانه (قاصدک، sms.ir، Mock) این Interface را پیاده می‌کند.
 * Business Logic هرگز مستقیماً Adapter را نمی‌شناسد؛ فقط SmsService / SmsTemplateService.
 */

/** ارسال با قالب تأییدشده‌ی سامانه (Verify در sms.ir، OTP در قاصدک) */
export interface SmsPatternInput {
  /** sms.ir: شناسه‌ی عددی قالب (templateId) */
  smsirTemplateId?: string | null;
  /** قاصدک: نام قالب (templateName) */
  ghasedakTemplateName?: string | null;
  /** پارامترهای قالب — نام پارامتر باید با تعریف قالب در پنل سامانه یکی باشد */
  params: { name: string; value: string }[];
}

export interface SendSmsInput {
  /** شماره‌ی موبایل به قالب 09xxxxxxxxx */
  phone: string;
  /** متن کامل پیامک (در حالت PATTERN هم برای لاگ و Mock استفاده می‌شود) */
  text: string;
  /** اگر مقدار داشته باشد، به‌جای ارسال متن آزاد از قالب سامانه استفاده می‌شود */
  pattern?: SmsPatternInput | null;
  /** شناسه‌ی سمت ما برای پیگیری در سامانه (اختیاری) */
  clientReferenceId?: string;
}

export interface SendSmsResult {
  sent: boolean;
  providerRequestId?: string;
  /** هزینه‌ی اعلام‌شده توسط سامانه */
  cost?: number;
  /** محیط غیرعملیاتی: فراخوانی واقعی انجام نشد */
  dryRun?: boolean;
}

export interface SmsAccountInfo {
  /** اعتبار باقی‌مانده (واحد سامانه: ریال در قاصدک، تعداد پیامک در sms.ir) */
  credit: number | null;
  creditUnit: string;
  lines?: string[];
  expireDate?: string | null;
  plan?: string | null;
}

export interface SmsProvider {
  readonly providerCode: string;
  send(input: SendSmsInput): Promise<SendSmsResult>;
  /** وضعیت حساب (اعتبار، خطوط) — فقط فراخوانی خواندنی، بدون ارسال پیامک */
  getAccountInfo?(): Promise<SmsAccountInfo>;
}
