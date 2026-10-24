// api/src/zarpayesh/zarpayesh-config.service.ts
//
// تنظیمات اتصال به سامانه ناظر (ردیف ثابت zarpayesh_config) و اعتبارنامه‌های رمزشده‌ی سکو
// (نام کاربری، رمز عبور، کلید AES) که در integration_provider_credentials با Provider «ZARPAYESH»
// نگهداری می‌شوند. اعتبارنامه‌ها هرگز به‌صورت کامل از API برگردانده نمی‌شوند.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderCredentialService } from '../integrations/credentials/provider-credential.service';
import { Prisma, ZarPayeshConfig } from '../generated/prisma/client';
import {
  ZARPAYESH_CREDENTIAL_KEYS,
  ZARPAYESH_PROVIDER_CODE,
} from './zarpayesh.constants';
import { ZarPayeshError } from './zarpayesh-errors';
import { parseAesKey } from './zarpayesh-crypto';

export interface ZarPayeshCredentials {
  account: string;
  password: string;
  aesKey: string;
}

const CONFIG_ID = 'default';
const CREDENTIAL_CACHE_MS = 60_000;

@Injectable()
export class ZarPayeshConfigService implements OnModuleInit {
  private readonly logger = new Logger(ZarPayeshConfigService.name);
  private credentialCache: { value: ZarPayeshCredentials; at: number } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: ProviderCredentialService,
  ) {}

  async onModuleInit() {
    // Provider فقط ظرف اعتبارنامه‌هاست؛ isActive آن روی جریان معامله اثری ندارد
    await this.prisma.integrationProvider.upsert({
      where: { code: ZARPAYESH_PROVIDER_CODE },
      create: {
        code: ZARPAYESH_PROVIDER_CODE,
        name: 'زر پایش (سامانه ناظر طلا)',
        description:
          'سامانه ناظر بر خرید و فروش بر خط طلا و نقره — مدیریت از صفحه‌ی «سامانه ناظر (زر پایش)»',
      },
      update: {},
    });
    await this.getConfig();
  }

  async getConfig(): Promise<ZarPayeshConfig> {
    return this.prisma.zarPayeshConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID },
      update: {},
    });
  }

  async updateConfig(
    data: Prisma.ZarPayeshConfigUpdateInput,
  ): Promise<ZarPayeshConfig> {
    await this.getConfig();
    return this.prisma.zarPayeshConfig.update({
      where: { id: CONFIG_ID },
      data,
    });
  }

  /** فقط وقتی true است که کلید اصلی روشن باشد — جریان معامله فقط به همین نگاه می‌کند */
  async isTradeReportingEnabled(): Promise<boolean> {
    const cfg = await this.prisma.zarPayeshConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { enabled: true },
    });
    return cfg?.enabled ?? false;
  }

  async getCredentials(): Promise<ZarPayeshCredentials> {
    if (
      this.credentialCache &&
      Date.now() - this.credentialCache.at < CREDENTIAL_CACHE_MS
    ) {
      return this.credentialCache.value;
    }
    let raw: Record<string, string>;
    try {
      raw = await this.credentials.getCredentials(ZARPAYESH_PROVIDER_CODE, [
        ZARPAYESH_CREDENTIAL_KEYS.ACCOUNT,
        ZARPAYESH_CREDENTIAL_KEYS.PASSWORD,
        ZARPAYESH_CREDENTIAL_KEYS.AES_KEY,
      ]);
    } catch (err) {
      throw new ZarPayeshError(
        `اعتبارنامه‌ی سامانه ناظر کامل نیست: ${(err as Error).message}`,
        'CONFIGURATION',
      );
    }
    const value: ZarPayeshCredentials = {
      account: raw[ZARPAYESH_CREDENTIAL_KEYS.ACCOUNT],
      password: raw[ZARPAYESH_CREDENTIAL_KEYS.PASSWORD],
      aesKey: raw[ZARPAYESH_CREDENTIAL_KEYS.AES_KEY],
    };
    this.credentialCache = { value, at: Date.now() };
    return value;
  }

  async listCredentials() {
    const rows = await this.credentials.listMasked(ZARPAYESH_PROVIDER_CODE);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.values(ZARPAYESH_CREDENTIAL_KEYS).map((key) => {
      const r = byKey.get(key);
      return {
        key,
        isSet: !!r,
        // رمز عبور و کلید AES حتی پوشانده هم نمایش داده نمی‌شوند
        maskedValue:
          r && key === ZARPAYESH_CREDENTIAL_KEYS.ACCOUNT
            ? r.maskedValue
            : r
              ? '••••••••'
              : null,
        updatedAt: r?.updatedAt ?? null,
        rotationDue: r?.rotationDue ?? false,
      };
    });
  }

  async setCredential(key: string, value: string) {
    const allowed = Object.values(ZARPAYESH_CREDENTIAL_KEYS) as string[];
    if (!allowed.includes(key)) {
      throw new ZarPayeshError(
        `کلید اعتبارنامه‌ی ${key} مجاز نیست`,
        'VALIDATION',
      );
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new ZarPayeshError('مقدار اعتبارنامه خالی است', 'VALIDATION');
    }
    if (key === ZARPAYESH_CREDENTIAL_KEYS.AES_KEY) {
      try {
        parseAesKey(trimmed);
      } catch {
        throw new ZarPayeshError(
          'کلید AES باید دقیقاً ۳۲ کاراکتر Hex (۱۶ بایت — AES-128) باشد',
          'VALIDATION',
        );
      }
    }
    await this.credentials.setCredential(ZARPAYESH_PROVIDER_CODE, key, trimmed);
    this.credentialCache = null;
    // تغییر اعتبارنامه یعنی آزمون اتصال قبلی دیگر معتبر نیست
    await this.updateConfig({ connectionVerifiedAt: null });
    this.logger.log(`[ZarPayesh] اعتبارنامه‌ی ${key} به‌روزرسانی شد`);
  }

  invalidateCredentialCache() {
    this.credentialCache = null;
  }
}
