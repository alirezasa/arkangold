import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderCredentialService } from '../credentials/provider-credential.service';
import { FinotechTokenService } from '../providers/finotech/finotech-token.service';

interface ProviderServiceUpdateInput {
  isActive?: boolean;
  priority?: number;
  isFallback?: boolean;
  configuration?: Record<string, unknown>;
}

@Injectable()
export class IntegrationsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: ProviderCredentialService,
    private readonly finotechToken: FinotechTokenService,
  ) {}

  async listServices() {
    return this.prisma.integrationService.findMany({
      include: {
        providers: {
          include: { provider: true },
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async listProviders() {
    return this.prisma.integrationProvider.findMany({ orderBy: { code: 'asc' } });
  }

  async updateService(code: string, isActive: boolean) {
    const service = await this.prisma.integrationService.findUnique({ where: { code } });
    if (!service) throw new NotFoundException('سرویس یافت نشد');
    return this.prisma.integrationService.update({ where: { code }, data: { isActive } });
  }

  async updateProvider(code: string, isActive: boolean) {
    const provider = await this.prisma.integrationProvider.findUnique({ where: { code } });
    if (!provider) throw new NotFoundException('Provider یافت نشد');
    return this.prisma.integrationProvider.update({ where: { code }, data: { isActive } });
  }

  async updateProviderService(providerCode: string, serviceCode: string, data: ProviderServiceUpdateInput) {
    const [provider, service] = await Promise.all([
      this.prisma.integrationProvider.findUnique({ where: { code: providerCode } }),
      this.prisma.integrationService.findUnique({ where: { code: serviceCode } }),
    ]);
    if (!provider) throw new NotFoundException('Provider یافت نشد');
    if (!service) throw new NotFoundException('سرویس یافت نشد');

    return this.prisma.integrationProviderService.upsert({
      where: { providerId_serviceId: { providerId: provider.id, serviceId: service.id } },
      create: {
        providerId: provider.id,
        serviceId: service.id,
        isActive: data.isActive ?? true,
        priority: data.priority ?? 1,
        isFallback: data.isFallback ?? false,
        configuration: data.configuration,
      },
      update: {
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.isFallback !== undefined ? { isFallback: data.isFallback } : {}),
        ...(data.configuration !== undefined ? { configuration: data.configuration } : {}),
      },
    });
  }

  async listCredentials(providerCode: string) {
    return this.credentials.listMasked(providerCode);
  }

  async setCredential(providerCode: string, key: string, value: string) {
    await this.credentials.setCredential(providerCode, key, value);
    return { message: 'Credential ذخیره شد' };
  }

  async listLogs(params: {
    providerCode?: string;
    serviceCode?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 30), 100);

    const [provider, service] = await Promise.all([
      params.providerCode
        ? this.prisma.integrationProvider.findUnique({ where: { code: params.providerCode } })
        : null,
      params.serviceCode
        ? this.prisma.integrationService.findUnique({ where: { code: params.serviceCode } })
        : null,
    ]);

    const where = {
      ...(provider ? { providerId: provider.id } : {}),
      ...(service ? { serviceId: service.id } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.integrationLog.findMany({
        where,
        include: { provider: true, service: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.integrationLog.count({ where }),
    ]);

    return { data: items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  /**
   * Health Check فینوتک: فقط یک توکن جدید می‌گیرد (بدون اجرای هیچ عملیات حساس کسب‌وکاری)
   * تا اعتبار Credentialها و دسترسی شبکه تست شود — دقیقاً طبق اصل:
   * «Health Check نباید باعث اجرای عملیات واقعی و حساس کسب‌وکاری شود».
   */
  async testFinotechConnection() {
    try {
      await this.finotechToken.invalidateCache();
      await this.finotechToken.getAccessToken();
      return { success: true, message: 'اتصال به فینوتک و دریافت توکن موفق بود' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }
}
