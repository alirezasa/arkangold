import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialEncryptionService } from './credential-encryption.service';

// FCS_CKM_EXT.1.2: Credentialهای سرویس‌های ثالث (API Key، Client Secret) باید دوره‌ای تعویض شوند
const CREDENTIAL_MAX_AGE_DAYS = Number(process.env.INTEGRATION_CREDENTIAL_MAX_AGE_DAYS ?? 180);

/** زمینه‌ی AAD: متن رمز به همین Provider و همین کلید گره می‌خورد */
function credentialContext(providerId: string, key: string): string {
  return `${providerId}:${key}`;
}

@Injectable()
export class ProviderCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async getCredential(providerCode: string, key: string): Promise<string> {
    const provider = await this.prisma.integrationProvider.findUnique({
      where: { code: providerCode },
    });
    if (!provider)
      throw new NotFoundException(`Provider با کد ${providerCode} یافت نشد`);

    const credential =
      await this.prisma.integrationProviderCredential.findUnique({
        where: { providerId_key: { providerId: provider.id, key } },
      });
    if (!credential) {
      throw new NotFoundException(
        `Credential با کلید ${key} برای Provider ${providerCode} تنظیم نشده است`,
      );
    }

    return this.encryption.decrypt(
      credential.encryptedValue,
      credentialContext(provider.id, key),
    );
  }

  async getCredentials(
    providerCode: string,
    keys: string[],
  ): Promise<Record<string, string>> {
    const entries = await Promise.all(
      keys.map(
        async (k) => [k, await this.getCredential(providerCode, k)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  async setCredential(
    providerCode: string,
    key: string,
    value: string,
  ): Promise<void> {
    const provider = await this.prisma.integrationProvider.findUnique({
      where: { code: providerCode },
    });
    if (!provider)
      throw new NotFoundException(`Provider با کد ${providerCode} یافت نشد`);

    const encryptedValue = await this.encryption.encrypt(
      value,
      credentialContext(provider.id, key),
    );

    await this.prisma.integrationProviderCredential.upsert({
      where: { providerId_key: { providerId: provider.id, key } },
      create: { providerId: provider.id, key, encryptedValue },
      update: { encryptedValue },
    });
  }

  async listMasked(providerCode: string): Promise<
    {
      key: string;
      maskedValue: string;
      updatedAt: Date;
      keyVersion: string;
      needsReencryption: boolean;
      rotationDue: boolean;
    }[]
  > {
    const provider = await this.prisma.integrationProvider.findUnique({
      where: { code: providerCode },
      include: { credentials: true },
    });
    if (!provider)
      throw new NotFoundException(`Provider با کد ${providerCode} یافت نشد`);

    const maxAgeMs = CREDENTIAL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return Promise.all(
      provider.credentials.map(async (c) => ({
        key: c.key,
        maskedValue: this.encryption.maskForDisplay(
          await this.encryption.decrypt(
            c.encryptedValue,
            credentialContext(provider.id, c.key),
          ),
        ),
        updatedAt: c.updatedAt,
        keyVersion: this.encryption.keyVersionOf(c.encryptedValue),
        needsReencryption: this.encryption.needsReencryption(c.encryptedValue),
        rotationDue: Date.now() - c.updatedAt.getTime() > maxAgeMs,
      })),
    );
  }

  /**
   * FCS_CKM_EXT.1.2: پس از چرخش کلید رمزنگاری، همه‌ی Credentialهایی که با کلید/قالب قدیمی
   * رمز شده‌اند با کلید فعلی دوباره رمز می‌شوند. پس از اجرای موفق، کلید قبلی را می‌توان
   * از INTEGRATION_ENCRYPTION_KEYS_PREVIOUS حذف کرد (امحای کلید — FCS_CKM_EXT.1.3).
   * updatedAt عمداً حفظ می‌شود تا تاریخ تعویض واقعی Credential (نه کلید) از دست نرود.
   */
  async reencryptAll(): Promise<{ total: number; reencrypted: number }> {
    const credentials = await this.prisma.integrationProviderCredential.findMany();
    let reencrypted = 0;
    for (const c of credentials) {
      if (!this.encryption.needsReencryption(c.encryptedValue)) continue;
      const context = credentialContext(c.providerId, c.key);
      const plain = await this.encryption.decrypt(c.encryptedValue, context);
      const encryptedValue = await this.encryption.encrypt(plain, context);
      await this.prisma.integrationProviderCredential.update({
        where: { id: c.id },
        data: { encryptedValue, updatedAt: c.updatedAt },
      });
      reencrypted += 1;
    }
    return { total: credentials.length, reencrypted };
  }
}
