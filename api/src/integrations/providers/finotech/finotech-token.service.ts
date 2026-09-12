import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import axios, { isAxiosError } from 'axios';
import { ProviderCredentialService } from '../../credentials/provider-credential.service';
import { FINOTECH_CONFIG, FINOTECH_CREDENTIAL_KEYS, FINOTECH_PROVIDER_CODE } from './finotech-config';
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
  ) {}

  async getAccessToken(): Promise<string> {
    const cached = await this.redis.get(FINOTECH_CONFIG.TOKEN_CACHE_KEY);
    if (cached) return cached;

    if (this.pendingRequest) return this.pendingRequest;

    this.pendingRequest = this.requestNewToken().finally(() => {
      this.pendingRequest = null;
    });

    return this.pendingRequest;
  }

  /** برای Health Check از پنل ادمین: توکن Cache شده را باطل می‌کند تا دوباره از فینوتک گرفته شود */
  async invalidateCache(): Promise<void> {
    await this.redis.del(FINOTECH_CONFIG.TOKEN_CACHE_KEY);
  }

  private async requestNewToken(): Promise<string> {
    const { CLIENT_ID, CLIENT_SECRET, NID } = await this.credentials.getCredentials(
      FINOTECH_PROVIDER_CODE,
      [FINOTECH_CREDENTIAL_KEYS.CLIENT_ID, FINOTECH_CREDENTIAL_KEYS.CLIENT_SECRET, FINOTECH_CREDENTIAL_KEYS.NID],
    );

    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    try {
      const response = await axios.post<FinotechTokenResponse>(
        `${FINOTECH_CONFIG.BASE_URL}${FINOTECH_CONFIG.TOKEN_PATH}`,
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
      const expiresIn = response.data.result?.expires_in ?? response.data.expires_in;

      if (!token) {
        throw new ProviderError('پاسخ توکن فینوتک فاقد فیلد value بود');
      }

      const ttl = Math.max(30, (expiresIn ?? 3600) - FINOTECH_CONFIG.TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS);
      await this.redis.setex(FINOTECH_CONFIG.TOKEN_CACHE_KEY, ttl, token);

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
