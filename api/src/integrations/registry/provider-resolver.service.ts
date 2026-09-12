import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProviderRegistryService } from './provider-registry.service';
import { IntegrationLogService } from '../logging/integration-log.service';
import { IntegrationError, UnknownIntegrationError } from '../errors/integration-error';

export interface ResolvedExecution<TResult> {
  result: TResult;
  providerCode: string;
  requestId: string;
}

@Injectable()
export class ProviderResolverService {
  private readonly logger = new Logger(ProviderResolverService.name);

  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly integrationLog: IntegrationLogService,
  ) {}

  /**
   * یک سرویس Contract داخلی (مثل IdentityVerificationService) این متد را صدا می‌زند.
   *
   * - providerMap: نگاشت providerCode → نمونه Adapter که خودِ سرویس Contract می‌سازد.
   * - execute: تابعی که با Adapter انتخاب‌شده عملیات واقعی را اجرا می‌کند.
   *
   * ترتیب اجرا: Providerهایی که در دیتابیس برای این Service فعال هستند به ترتیب Priority
   * امتحان می‌شوند. فقط روی خطاهای «قابل Retry» (فنی/اتصال/Timeout/RateLimit/خطای سرور Provider)
   * سراغ Provider بعدی (Fallback) می‌رویم؛ خطاهای Validation/Business/Authentication بلافاصله
   * throw می‌شوند چون تکرارشان روی Provider دیگر معمولاً بی‌فایده یا حتی گمراه‌کننده است.
   */
  async resolveAndExecute<TProvider, TResult>(
    serviceCode: string,
    providerMap: Map<string, TProvider>,
    execute: (provider: TProvider, providerCode: string) => Promise<TResult>,
    requestId: string = randomUUID(),
  ): Promise<ResolvedExecution<TResult>> {
    const candidates = await this.registry.resolveActiveProviders(serviceCode);

    let lastError: unknown = null;

    for (const candidate of candidates) {
      const provider = providerMap.get(candidate.providerCode);
      if (!provider) {
        this.logger.warn(
          `Provider «${candidate.providerCode}» برای سرویس «${serviceCode}» در دیتابیس فعال است ولی Adapter آن رجیستر نشده — رد شد.`,
        );
        continue;
      }

      const startedAt = Date.now();
      try {
        const result = await execute(provider, candidate.providerCode);
        await this.integrationLog.logSuccess({
          requestId,
          serviceCode,
          providerCode: candidate.providerCode,
          durationMs: Date.now() - startedAt,
        });
        return { result, providerCode: candidate.providerCode, requestId };
      } catch (err) {
        lastError = err;
        const isRetryable = err instanceof IntegrationError ? err.retryable : false;
        const errorCode = err instanceof IntegrationError ? err.category : 'UNKNOWN_ERROR';

        await this.integrationLog.logFailure({
          requestId,
          serviceCode,
          providerCode: candidate.providerCode,
          durationMs: Date.now() - startedAt,
          errorCode,
        });

        this.logger.error(
          `خطا در Provider «${candidate.providerCode}» برای سرویس «${serviceCode}»: ${(err as Error).message}`,
        );

        if (!isRetryable) {
          throw err;
        }
        // خطای فنی بود → امتحان Provider بعدی در صورت وجود (حلقه ادامه پیدا می‌کند)
      }
    }

    throw lastError ?? new UnknownIntegrationError(`هیچ Provider فعالی برای سرویس ${serviceCode} در دسترس نبود`);
  }
}
