import { Injectable } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { FinotechTokenService } from './finotech-token.service';
import { FinotechEnvironmentService } from './finotech-environment.service';
import {
  AuthenticationError,
  ConnectionError,
  ProviderError,
  RateLimitError,
  TimeoutIntegrationError,
} from '../../errors/integration-error';

interface FinotechErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * پاسخ ۴۰۰ فینوتک برای بعضی سرویس‌ها (مثل «عدم تطابق» یا «کارت نامعتبر») یک نتیجه‌ی
 * کسب‌وکاری است نه خطای فنی؛ Adapter با این گزینه بدنه‌ی خطا را مثل پاسخ عادی دریافت
 * می‌کند تا خودش تصمیم بگیرد (وگرنه ProviderError → Fallback/۵۰۳ می‌شد).
 */
export interface FinotechRequestOptions {
  scope: string;
  /** کدهای HTTP که بدنه‌شان به‌جای throw به Adapter برگردانده شود (پیش‌فرض: [400]) */
  passthroughStatuses?: number[];
}

@Injectable()
export class FinotechHttpClient {
  constructor(
    private readonly tokenService: FinotechTokenService,
    private readonly environment: FinotechEnvironmentService,
  ) {}

  async get<T>(
    path: string,
    params: Record<string, string | number>,
    options?: FinotechRequestOptions,
  ): Promise<T> {
    return this.request<T>('GET', path, params, undefined, options);
  }

  async post<T>(
    path: string,
    body: Record<string, unknown>,
    params: Record<string, string | number>,
    options: FinotechRequestOptions,
  ): Promise<T> {
    return this.request<T>('POST', path, params, body, options);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string | number>,
    body: Record<string, unknown> | undefined,
    options?: FinotechRequestOptions,
  ): Promise<T> {
    const [token, baseUrl] = await Promise.all([
      this.tokenService.getAccessToken(options?.scope),
      this.environment.getBaseUrl(),
    ]);

    try {
      const response = await axios.request<T>({
        method,
        url: `${baseUrl}${path}`,
        params,
        data: body,
        timeout: 15_000,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      return response.data;
    } catch (err) {
      const passthrough =
        options?.passthroughStatuses ?? (options ? [400] : []);
      if (
        isAxiosError(err) &&
        err.response &&
        passthrough.includes(err.response.status) &&
        err.response.data &&
        typeof err.response.data === 'object'
      ) {
        return err.response.data as T;
      }
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): Error {
    if (!isAxiosError(err)) return err as Error;

    if (err.code === 'ECONNABORTED') {
      return new TimeoutIntegrationError('درخواست به فینوتک Timeout شد');
    }
    if (!err.response) {
      return new ConnectionError('اتصال به فینوتک برقرار نشد');
    }

    const status = err.response.status;
    const body = err.response.data as FinotechErrorBody | undefined;
    const providerMessage = body?.error?.message;
    const providerCode = body?.error?.code;

    if (status === 401 || status === 403) {
      return new AuthenticationError(
        providerMessage || 'توکن فینوتک نامعتبر یا منقضی است',
        providerCode,
      );
    }
    if (status === 429) {
      return new RateLimitError(
        providerMessage || 'محدودیت نرخ درخواست فینوتک',
        providerCode,
      );
    }
    return new ProviderError(
      providerMessage || `خطای فینوتک (HTTP ${status})`,
      providerCode,
    );
  }
}
