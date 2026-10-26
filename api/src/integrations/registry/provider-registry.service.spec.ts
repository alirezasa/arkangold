import { ProviderRegistryService } from './provider-registry.service';
import { ConfigurationError } from '../errors/integration-error';
import type { PrismaService } from '../../prisma/prisma.service';

const link = (code: string, priority: number) => ({
  providerId: `${code}-id`,
  isFallback: false,
  priority,
  configuration: null,
  provider: { code },
});

function registryWith(links: ReturnType<typeof link>[]) {
  const prisma = {
    integrationService: {
      findUnique: () => Promise.resolve({ id: 's1', isActive: true }),
    },
    integrationProviderService: { findMany: () => Promise.resolve(links) },
  } as unknown as PrismaService;
  return new ProviderRegistryService(prisma);
}

describe('ProviderRegistryService — Mock providers in production', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('skips MOCK in production and keeps the real provider', async () => {
    process.env.NODE_ENV = 'production';
    const providers = await registryWith([
      link('MOCK', 1),
      link('FINOTECH', 2),
    ]).resolveActiveProviders('IDENTITY_VERIFICATION');
    expect(providers.map((p) => p.providerCode)).toEqual(['FINOTECH']);
  });

  it('refuses to run when only MOCK is active in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      registryWith([link('MOCK', 1)]).resolveActiveProviders(
        'CARD_NATIONAL_ID_MATCH',
      ),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('keeps MOCK outside production or with the explicit override', async () => {
    process.env.NODE_ENV = 'development';
    let providers = await registryWith([
      link('MOCK', 1),
    ]).resolveActiveProviders('SMS');
    expect(providers.map((p) => p.providerCode)).toEqual(['MOCK']);

    process.env.NODE_ENV = 'production';
    process.env.ALLOW_TEST_INTEGRATIONS_IN_PRODUCTION = 'true';
    providers = await registryWith([link('MOCK', 1)]).resolveActiveProviders(
      'SMS',
    );
    expect(providers.map((p) => p.providerCode)).toEqual(['MOCK']);
  });
});
