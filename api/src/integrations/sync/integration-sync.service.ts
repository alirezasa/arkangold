import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ServiceDefinition {
  code: string;
  name: string;
  description: string;
}

interface ProviderDefinition {
  code: string;
  name: string;
  description: string;
}

interface InitialLink {
  serviceCode: string;
  providerCode: string;
  priority: number;
  isActive: boolean;
  isFallback: boolean;
}

// سرویس‌های کسب‌وکاری که معماری Integration پشتیبانی می‌کند.
// اضافه کردن یک سرویس جدید فقط یعنی یک آیتم به این آرایه اضافه شود؛ کد جایی دیگر تغییر نمی‌کند.
const SERVICES: ServiceDefinition[] = [
  { code: 'IDENTITY_VERIFICATION', name: 'احراز هویت', description: 'استعلام اطلاعات هویتی از ثبت احوال' },
  { code: 'IBAN_NATIONAL_ID_MATCH', name: 'تطبیق شبا و کد ملی', description: '' },
  { code: 'CARD_NATIONAL_ID_MATCH', name: 'تطبیق کارت و کد ملی', description: '' },
  { code: 'COMPANY_INQUIRY', name: 'استعلام اطلاعات شرکت', description: '' },
  { code: 'GOLD_PRICE', name: 'قیمت لحظه‌ای طلا', description: '' },
  { code: 'SMS', name: 'ارسال پیامک', description: '' },
  { code: 'PAYMENT_GATEWAY', name: 'درگاه پرداخت', description: 'برای معماری آینده رزرو شده — فعلاً بدون Adapter' },
];

const PROVIDERS: ProviderDefinition[] = [
  { code: 'MOCK', name: 'Mock (داخلی)', description: 'پیاده‌سازی شبیه‌سازی‌شده برای dev/staging' },
  { code: 'FINOTECH', name: 'فینوتک', description: 'ارائه‌دهنده KYC/بانکی فینوتک' },
];

// فقط سرویس‌هایی که همین الان Adapter واقعی دارند این‌جا Link می‌شوند.
// بقیه سرویس‌ها (IBAN/CARD/COMPANY/GOLD_PRICE/SMS/PAYMENT_GATEWAY) عمداً بدون لینک باقی می‌مانند
// تا وقتی Adapter واقعی‌شان نوشته شود؛ صدا زدن آن‌ها فعلاً به‌درستی CONFIGURATION_ERROR می‌دهد.
const INITIAL_LINKS: InitialLink[] = [
  { serviceCode: 'IDENTITY_VERIFICATION', providerCode: 'MOCK', priority: 1, isActive: true, isFallback: false },
  { serviceCode: 'IDENTITY_VERIFICATION', providerCode: 'FINOTECH', priority: 2, isActive: false, isFallback: true },
];

@Injectable()
export class IntegrationSyncService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncServices();
    await this.syncProviders();
    await this.syncInitialLinks();
  }

  private async syncServices() {
    for (const s of SERVICES) {
      await this.prisma.integrationService.upsert({
        where: { code: s.code },
        create: { code: s.code, name: s.name, description: s.description },
        // isActive توسط ادمین از پنل تنظیم می‌شود؛ این‌جا فقط name/description آپدیت می‌شود
        update: { name: s.name, description: s.description },
      });
    }
    this.logger.log(`[Integrations] ${SERVICES.length} سرویس همگام‌سازی شد`);
  }

  private async syncProviders() {
    for (const p of PROVIDERS) {
      await this.prisma.integrationProvider.upsert({
        where: { code: p.code },
        create: { code: p.code, name: p.name, description: p.description },
        update: { name: p.name, description: p.description },
      });
    }
    this.logger.log(`[Integrations] ${PROVIDERS.length} Provider همگام‌سازی شد`);
  }

  private async syncInitialLinks() {
    for (const link of INITIAL_LINKS) {
      const [service, provider] = await Promise.all([
        this.prisma.integrationService.findUnique({ where: { code: link.serviceCode } }),
        this.prisma.integrationProvider.findUnique({ where: { code: link.providerCode } }),
      ]);
      if (!service || !provider) continue;

      // فقط اگر لینک از قبل وجود ندارد ایجاد می‌شود — priority/isActive که ادمین بعداً
      // از پنل تغییر می‌دهد، با هر Restart سرور دوباره Overwrite نمی‌شود.
      const existing = await this.prisma.integrationProviderService.findUnique({
        where: { providerId_serviceId: { providerId: provider.id, serviceId: service.id } },
      });
      if (existing) continue;

      await this.prisma.integrationProviderService.create({
        data: {
          providerId: provider.id,
          serviceId: service.id,
          priority: link.priority,
          isActive: link.isActive,
          isFallback: link.isFallback,
        },
      });
    }
    this.logger.log('[Integrations] لینک‌های اولیه Provider↔Service بررسی شد');
  }
}
