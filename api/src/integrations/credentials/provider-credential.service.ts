import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialEncryptionService } from './credential-encryption.service';

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

    return this.encryption.decrypt(credential.encryptedValue);
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

    const encryptedValue = this.encryption.encrypt(value);

    await this.prisma.integrationProviderCredential.upsert({
      where: { providerId_key: { providerId: provider.id, key } },
      create: { providerId: provider.id, key, encryptedValue },
      update: { encryptedValue },
    });
  }

  async listMasked(
    providerCode: string,
  ): Promise<{ key: string; maskedValue: string; updatedAt: Date }[]> {
    const provider = await this.prisma.integrationProvider.findUnique({
      where: { code: providerCode },
      include: { credentials: true },
    });
    if (!provider)
      throw new NotFoundException(`Provider با کد ${providerCode} یافت نشد`);

    return provider.credentials.map((c) => ({
      key: c.key,
      maskedValue: this.encryption.maskForDisplay(
        this.encryption.decrypt(c.encryptedValue),
      ),
      updatedAt: c.updatedAt,
    }));
  }
}
