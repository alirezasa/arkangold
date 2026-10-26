import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigurationError } from '../errors/integration-error';
import {
  MOCK_PROVIDER_CODE,
  testIntegrationsBlocked,
} from '../../common/environment/test-integrations';

export interface ResolvedProviderEntry {
  providerCode: string;
  providerId: string;
  isFallback: boolean;
  priority: number;
  configuration: Record<string, unknown> | null;
}

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * لیست Providerهای فعال یک سرویس را به ترتیب Priority (کوچک‌تر = اولویت بالاتر/Primary) برمی‌گرداند.
   * اگر Service تعریف نشده یا غیرفعال باشد، یا هیچ Provider فعالی نداشته باشد، CONFIGURATION_ERROR می‌دهد
   * (دقیقاً طبق قانون: «اگر Service غیرفعال باشد نباید هیچ Provideری اجرا شود» و
   * «اگر Service فعال باشد ولی Provider فعال نداشته باشد، خطای Configuration Error»).
   */
  async resolveActiveProviders(
    serviceCode: string,
  ): Promise<ResolvedProviderEntry[]> {
    const service = await this.prisma.integrationService.findUnique({
      where: { code: serviceCode },
    });

    if (!service) {
      throw new ConfigurationError(
        `سرویس Integration با کد ${serviceCode} تعریف نشده است`,
      );
    }
    if (!service.isActive) {
      throw new ConfigurationError(`سرویس ${serviceCode} غیرفعال است`);
    }

    const links = await this.prisma.integrationProviderService.findMany({
      where: {
        serviceId: service.id,
        isActive: true,
        provider: { isActive: true },
      },
      include: { provider: true },
      orderBy: { priority: 'asc' },
    });

    if (links.length === 0) {
      throw new ConfigurationError(
        `هیچ Provider فعالی برای سرویس ${serviceCode} تنظیم نشده است`,
      );
    }

    // Mock در production هرگز اجرا نمی‌شود (هر هویت/کارتی را تأیید می‌کند)؛ حتی اگر در پنل فعال مانده باشد
    const usable = testIntegrationsBlocked()
      ? links.filter((l) => l.provider.code !== MOCK_PROVIDER_CODE)
      : links;
    if (usable.length !== links.length) {
      this.logger.error(
        `Provider آزمایشی MOCK برای سرویس ${serviceCode} فعال است ولی در production اجرا نمی‌شود — آن را از پنل غیرفعال و ارائه‌دهنده‌ی واقعی را فعال کنید`,
      );
    }
    if (usable.length === 0) {
      throw new ConfigurationError(
        `برای سرویس ${serviceCode} فقط Provider آزمایشی (MOCK) فعال است که در production مجاز نیست`,
      );
    }

    return usable.map((l) => ({
      providerCode: l.provider.code,
      providerId: l.providerId,
      isFallback: l.isFallback,
      priority: l.priority,
      configuration: (l.configuration as Record<string, unknown>) ?? null,
    }));
  }
}
