import {
  SECRET_CONFIG_MASK,
  SystemConfigController,
  isSecretConfigKey,
} from './system-config.controller';
import type { SystemConfigService } from './system-config.service';
import type { AuditService } from '../common/audit/audit.service';

function setup(stored: Record<string, string>) {
  const set = jest.fn((key: string, value: string) => {
    stored[key] = value;
    return Promise.resolve();
  });
  const logAdmin = jest.fn(() => Promise.resolve());
  const service = {
    getAll: () =>
      Promise.resolve(
        Object.entries(stored).map(([key, value]) => ({ key, value })),
      ),
    find: (key: string) => Promise.resolve(stored[key] ?? null),
    set,
    invalidateCache: () => Promise.resolve(),
  } as unknown as SystemConfigService;
  const controller = new SystemConfigController(service, {
    logAdmin,
  } as unknown as AuditService);
  const req = {
    user: { adminUserId: 'admin-1' },
    ip: '5.6.7.8',
    headers: { 'user-agent': 'jest' },
  } as never;
  return { controller, set, logAdmin, req };
}

describe('SystemConfigController', () => {
  it('detects secret keys only by their final segment', () => {
    expect(isSecretConfigKey('payment.behpardakht.password')).toBe(true);
    expect(isSecretConfigKey('sms.provider.api_key')).toBe(true);
    expect(isSecretConfigKey('security.password.user_min_length')).toBe(false);
    expect(isSecretConfigKey('security.api_key.lifetime_days')).toBe(false);
  });

  it('never returns secret values to the panel', async () => {
    const { controller } = setup({
      'payment.behpardakht.password': 's3cret',
      'fee.buy_gold': '1.0',
    });
    const all = await controller.getAll();
    expect(all).toEqual(
      expect.arrayContaining([
        { key: 'payment.behpardakht.password', value: SECRET_CONFIG_MASK },
        { key: 'fee.buy_gold', value: '1.0' },
      ]),
    );
  });

  it('ignores the mask on save and audits changes without the secret', async () => {
    const stored = { 'payment.behpardakht.password': 's3cret' };
    const { controller, set, logAdmin, req } = setup(stored);

    await controller.update(
      'payment.behpardakht.password',
      { value: SECRET_CONFIG_MASK },
      req,
    );
    expect(set).not.toHaveBeenCalled();
    expect(stored['payment.behpardakht.password']).toBe('s3cret');

    await controller.update(
      'payment.behpardakht.password',
      { value: 'n3w' },
      req,
    );
    expect(stored['payment.behpardakht.password']).toBe('n3w');
    expect(JSON.stringify(logAdmin.mock.calls)).not.toMatch(/s3cret|n3w/);
  });

  it('audits ordinary changes with old and new values', async () => {
    const { controller, logAdmin, req } = setup({
      'security.login.user_sms_otp_enabled': 'true',
    });
    await controller.update(
      'security.login.user_sms_otp_enabled',
      { value: 'false' },
      req,
    );
    expect(logAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'system_config.update',
        entityId: 'security.login.user_sms_otp_enabled',
        oldValue: { key: 'security.login.user_sms_otp_enabled', value: 'true' },
        newValue: {
          key: 'security.login.user_sms_otp_enabled',
          value: 'false',
        },
      }),
    );
  });
});
