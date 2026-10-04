import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import {
  AuthenticationError,
  ConnectionError,
  IntegrationError,
  ProviderError,
  RateLimitError,
  TimeoutIntegrationError,
  ValidationError,
} from '../../errors/integration-error';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * درخواست HTTP به سامانه‌ی پیامک و نگاشت خطاهای شبکه/HTTP به دسته‌های IntegrationError
 * (تا ProviderResolverService بتواند روی خطای فنی سراغ سامانه‌ی پشتیبان برود).
 * پاسخ‌های 2xx و همچنین 4xxهایی که بدنه‌ی JSON دارند به فراخواننده برمی‌گردند تا
 * پیام تجاری سامانه (مثلاً «اعتبار کافی نیست») دقیق نمایش داده شود.
 */
export async function smsHttpRequest<T>(
  providerLabel: string,
  config: AxiosRequestConfig,
  extractMessage: (body: unknown) => string | undefined,
): Promise<{ httpStatus: number; body: T }> {
  try {
    const res = await axios.request<T>({
      timeout: DEFAULT_TIMEOUT_MS,
      validateStatus: () => true,
      ...config,
    });
    const status = res.status;
    const message = extractMessage(res.data);
    if (status === 401 || status === 403) {
      throw new AuthenticationError(
        `${providerLabel}: کلید وب‌سرویس نامعتبر یا غیرفعال است${message ? ` (${message})` : ''}`,
        String(status),
      );
    }
    if (status === 429) {
      throw new RateLimitError(
        `${providerLabel}: تعداد درخواست بیش از حد مجاز است`,
        String(status),
      );
    }
    if (status >= 500) {
      throw new ProviderError(
        `${providerLabel}: خطای سرور سامانه (HTTP ${status})${message ? ` — ${message}` : ''}`,
        String(status),
      );
    }
    if (
      status >= 400 &&
      (res.data === undefined || res.data === null || res.data === '')
    ) {
      throw new ValidationError(
        `${providerLabel}: درخواست نامعتبر (HTTP ${status})`,
        String(status),
      );
    }
    return { httpStatus: status, body: res.data };
  } catch (err) {
    if (err instanceof IntegrationError) throw err;
    const ax = err as AxiosError;
    if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') {
      throw new TimeoutIntegrationError(
        `${providerLabel}: پاسخ سامانه در زمان مقرر دریافت نشد`,
      );
    }
    throw new ConnectionError(
      `${providerLabel}: ارتباط با سامانه برقرار نشد (${ax.code ?? ax.message})`,
    );
  }
}
