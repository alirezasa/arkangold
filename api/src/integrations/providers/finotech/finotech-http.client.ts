import { Injectable } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { FinotechTokenService } from './finotech-token.service';
import { FINOTECH_CONFIG } from './finotech-config';
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

@Injectable()
export class FinotechHttpClient {
  constructor(private readonly tokenService: FinotechTokenService) {}

  async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const token = await this.tokenService.getAccessToken();

    try {
      const response = await axios.get<T>(
        `${FINOTECH_CONFIG.BASE_URL}${path}`,
        {
          params,
          timeout: 15_000,
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      return response.data;
    } catch (err) {
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

    if (status === 401) {
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
