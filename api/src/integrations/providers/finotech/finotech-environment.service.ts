import { Injectable } from '@nestjs/common';
import { SystemConfigService } from '../../../system-config/system-config.service';
import { FINOTECH_CONFIG } from './finotech-config';

/**
 * تعیین می‌کند فراخوانی‌های فینوتک به Sandbox بروند یا Production — بر اساس کلید
 * SystemConfig «identity.finotech.sandbox» (از پنل ادمین قابل تغییر، بدون Deploy مجدد).
 * هم FinotechTokenService و هم FinotechHttpClient از همین سرویس استفاده می‌کنند تا
 * هرگز بین این دو حالت ناهماهنگ نشوند.
 */
@Injectable()
export class FinotechEnvironmentService {
  constructor(private readonly systemConfig: SystemConfigService) {}

  async isSandbox(): Promise<boolean> {
    return this.systemConfig.getBoolean(
      FINOTECH_CONFIG.SANDBOX_SYSTEM_CONFIG_KEY,
      true,
    );
  }

  async getBaseUrl(): Promise<string> {
    const sandbox = await this.isSandbox();
    return sandbox
      ? FINOTECH_CONFIG.SANDBOX_BASE_URL
      : FINOTECH_CONFIG.PRODUCTION_BASE_URL;
  }

  /**
   * توکن Sandbox و Production جدا Cache می‌شوند تا با تغییر این تنظیم از پنل ادمین،
   * توکن قدیمیِ محیط قبلی به اشتباه برای محیط جدید استفاده نشود.
   */
  async getTokenCacheKey(): Promise<string> {
    const sandbox = await this.isSandbox();
    return `${FINOTECH_CONFIG.TOKEN_CACHE_KEY}:${sandbox ? 'sandbox' : 'production'}`;
  }
}
