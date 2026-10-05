import {
  InvalidResponseError,
  ProviderError,
} from '../../errors/integration-error';

/** ساختار مشترک پاسخ سرویس‌های v2 فینوتک */
export interface FinotechEnvelope<TResult> {
  responseCode?: string;
  trackId?: string;
  status?: string;
  result?: TResult;
  error?: { code?: string; message?: string };
}

/**
 * پاسخ را بررسی و result را برمی‌گرداند. پاسخ دارای error یا status=FAILED به خطای
 * Provider (قابل Fallback) تبدیل می‌شود — تصمیم کسب‌وکاری (مثلاً «در انتظار بررسی ادمین»)
 * در لایه‌ی بالاتر گرفته می‌شود، نه این‌جا.
 */
export function unwrapFinotech<TResult>(
  response: FinotechEnvelope<TResult> | null | undefined,
  serviceLabel: string,
): TResult {
  if (!response || typeof response !== 'object') {
    throw new InvalidResponseError(`پاسخ نامعتبر فینوتک (${serviceLabel})`);
  }
  if (response.error || response.status === 'FAILED') {
    throw new ProviderError(
      response.error?.message ||
        `فینوتک درخواست ${serviceLabel} را ناموفق اعلام کرد`,
      response.error?.code ?? response.responseCode,
    );
  }
  if (!response.result) {
    throw new InvalidResponseError(
      `پاسخ فینوتک (${serviceLabel}) فاقد فیلد result بود`,
    );
  }
  return response.result;
}

export function trimOrUndefined(
  value: string | number | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
