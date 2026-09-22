import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import axios, { isAxiosError } from 'axios';
import { ProviderCredentialService } from '../../credentials/provider-credential.service';
import { FinotechEnvironmentService } from './finotech-environment.service';
import {
  FINOTECH_CONFIG,
  FINOTECH_CREDENTIAL_KEYS,
  FINOTECH_PROVIDER_CODE,
} from './finotech-config';
import {
  AuthenticationError,
  ConnectionError,
  ProviderError,
  TimeoutIntegrationError,
} from '../../errors/integration-error';

interface FinotechTokenResponse {
  result?: {
    value?: string;
    scopes?: string[];
    expires_in?: number;
  };
  // برخی پاسخ‌های فینوتک ساختار flat دارند؛ هر دو حالت پشتیبانی می‌شود
  value?: string;
  expires_in?: number;
}

/**
 * مدیریت Token فینوتک با رویکرد Client Credential (بدون رضایت کاربر بیرونی):
 * - دریافت توکن با Basic Auth از Base64(client_id:client_secret)
 * - Cache در Redis تا زمان انقضا (با Safety Margin)
 * - قفل in-memory برای جلوگیری از چند درخواست همزمان تکراری برای گرفتن توکن جدید
 *
 * طبق قانون معماری: Business Service هرگز مسئول گرفتن/Refresh کردن این توکن نیست؛
 * همه‌چیز داخل همین Adapter می‌ماند.
 */
@Injectable()
export class FinotechTokenService {
  private readonly logger = new Logger(FinotechTokenService.name);
  private pendingRequest: Promise<string> | null = null;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly credentials: ProviderCredentialService,
    private readonly environment: FinotechEnvironmentService,
  ) {}

  async getAccessToken(): Promise<string> {
    const cacheKey = await this.environment.getTokenCacheKey();
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    if (this.pendingRequest !== null) return this.pendingRequest;

    this.pendingRequest = this.requestNewToken(cacheKey).finally(() => {
      this.pendingRequest = null;
    });

    return this.pendingRequest;
  }

  /** برای Health Check از پنل ادمین: توکن Cache شده (هر دو محیط) را باطل می‌کند تا دوباره از فینوتک گرفته شود */
  async invalidateCache(): Promise<void> {
    await Promise.all([
      this.redis.del(`${FINOTECH_CONFIG.TOKEN_CACHE_KEY}:sandbox`),
      this.redis.del(`${FINOTECH_CONFIG.TOKEN_CACHE_KEY}:production`),
    ]);
  }

  private async requestNewToken(cacheKey: string): Promise<string> {
    const { CLIENT_ID, CLIENT_SECRET, NID } =
      await this.credentials.getCredentials(FINOTECH_PROVIDER_CODE, [
        FINOTECH_CREDENTIAL_KEYS.CLIENT_ID,
        FINOTECH_CREDENTIAL_KEYS.CLIENT_SECRET,
        FINOTECH_CREDENTIAL_KEYS.NID,
      ]);

    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      'base64',
    );

    try {
      const baseUrl = await this.environment.getBaseUrl();
      const response = await axios.post<FinotechTokenResponse>(
        `${baseUrl}${FINOTECH_CONFIG.TOKEN_PATH}`,
        {
          grant_type: FINOTECH_CONFIG.GRANT_TYPE,
          nid: NID,
          scopes: FINOTECH_CONFIG.SCOPE,
        },
        {
          timeout: 10_000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );

      const token = response.data.result?.value ?? response.data.value;
      const expiresIn =
        response.data.result?.expires_in ?? response.data.expires_in;

      if (!token) {
        throw new ProviderError('پاسخ توکن فینوتک فاقد فیلد value بود');
      }

      const ttl = Math.max(
        30,
        (expiresIn ?? 3600) -
          FINOTECH_CONFIG.TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
      );
      await this.redis.setex(cacheKey, ttl, token);

      return token;
    } catch (err) {
      if (err instanceof ProviderError) throw err;

      if (isAxiosError(err)) {
        if (err.code === 'ECONNABORTED') {
          throw new TimeoutIntegrationError('دریافت توکن فینوتک Timeout شد');
        }
        if (!err.response) {
          throw new ConnectionError('اتصال به سرویس Token فینوتک برقرار نشد');
        }
        if (err.response.status === 401 || err.response.status === 400) {
          throw new AuthenticationError(
            `دریافت توکن فینوتک ناموفق بود (HTTP ${err.response.status}) — Client ID/Secret را در پنل ادمین بررسی کن`,
            String(err.response.status),
          );
        }
        throw new ProviderError(
          `خطای فینوتک در دریافت توکن (HTTP ${err.response.status})`,
          String(err.response.status),
        );
      }
      throw err;
    }
  }
}
