// api/src/zarpayesh/zarpayesh-client.spec.ts
//
// کلاینت سامانه ناظر در برابر سرور شبیه‌سازی‌شده: ورود و نگهداری توکن، پوشش پاسخ، رمز شدن
// cid/موبایل، نگاشت کدهای خطای مستند، ورود مجدد پس از 401، حفظ دقت long و لاگ پاک‌سازی‌شده.
import type Redis from 'ioredis';
import type { CredentialEncryptionService } from '../integrations/credentials/credential-encryption.service';
import type { ZarPayeshConfigService } from './zarpayesh-config.service';
import type {
  ZarPayeshApiLogService,
  ZarPayeshLogEntry,
} from './zarpayesh-api-log.service';
import { sanitizeForLog } from './zarpayesh-api-log.service';
import {
  extractErrorCode,
  parseJsonPreservingLongs,
  ZarPayeshClientService,
} from './zarpayesh-client.service';
import { ZarPayeshError } from './zarpayesh-errors';
import { zarPayeshDecrypt } from './zarpayesh-crypto';
import {
  FAKE_AES_KEY,
  FakeZarPayeshServer,
} from './fake-zarpayesh-server.helper-spec';

const NATIONAL_CODE = '0012345679';
const ctx = { trigger: 'ADMIN' as const, adminId: 'a1' };

function setup(server: FakeZarPayeshServer, password = 'secret') {
  const store = new Map<string, string>();
  const redis = {
    get: (k: string) => Promise.resolve(store.get(k) ?? null),
    setex: (k: string, _t: number, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    },
    del: (k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    },
  } as unknown as Redis;
  const encryption = {
    encrypt: (v: string) => Promise.resolve(`enc:${v}`),
    decrypt: (v: string) => Promise.resolve(v.slice(4)),
  } as unknown as CredentialEncryptionService;
  const config = {
    getConfig: () =>
      Promise.resolve({ baseUrl: server.baseUrl, timeoutMs: 3000 }),
    getCredentials: () =>
      Promise.resolve({ account: 'platform', password, aesKey: FAKE_AES_KEY }),
  } as unknown as ZarPayeshConfigService;
  const logs: ZarPayeshLogEntry[] = [];
  const apiLog = {
    write: (e: ZarPayeshLogEntry) => {
      logs.push(e);
      return Promise.resolve();
    },
  } as unknown as ZarPayeshApiLogService;
  const client = new ZarPayeshClientService(config, apiLog, encryption, redis);
  return { client, logs, store };
}

describe('ZarPayeshClientService (سرور شبیه‌سازی‌شده)', () => {
  let server: FakeZarPayeshServer;
  beforeEach(async () => {
    server = new FakeZarPayeshServer();
    await server.start();
  });
  afterEach(() => server.stop());

  it('Login یک‌بار انجام و توکن برای فراخوانی‌های بعدی استفاده می‌شود', async () => {
    const { client, logs } = setup(server);
    const types = await client.typeList(ctx);
    const vaults = await client.vaultList(ctx);
    expect(types[0].title).toContain('طلا');
    expect(vaults[0].fkVault).toBe(3);
    expect(server.calls('/api/auth/session')).toHaveLength(1);
    const login = server.calls('/api/auth/session')[0];
    expect(login.method).toBe('POST');
    expect(login.body).toEqual({
      account: 'platform',
      password: 'secret',
      useOtp: false,
    });
    expect(server.calls('/api/aure/Aurelink/Typelist')[0].auth).toBe(
      'Bearer tok-1',
    );
    // رمز عبور و توکن در لاگ ذخیره نمی‌شوند
    const loginLog = logs.find((l) => l.method === 'Login');
    expect(JSON.stringify(sanitizeForLog(loginLog.requestBody))).not.toContain(
      'secret',
    );
    expect(JSON.stringify(sanitizeForLog(loginLog.responseBody))).not.toContain(
      'tok-1',
    );
    expect(logs.every((l) => l.success)).toBe(true);
  });

  it('اطلاعات ورود اشتباه → خطای ۱۰۳۲ (AUTHENTICATION)', async () => {
    const { client } = setup(server, 'wrong');
    await expect(client.typeList(ctx)).rejects.toMatchObject({
      code: 1032,
      kind: 'AUTHENTICATION',
    });
  });

  it('AddPlatformUsers: cid و موبایل رمز می‌شوند؛ لاگ فقط مقدار پوشانده دارد؛ ۱۰۱۶ برای تکراری', async () => {
    const { client, logs } = setup(server);
    const req = {
      fullname: 'آزمون کاربر',
      mobile: '+989121234567',
      nationalCode: NATIONAL_CODE,
      birthdate: '1990-01-01T00:00:00.000Z',
      address: '',
      postCode: '',
      fkCity: 0,
    };
    await client.addPlatformUsers(req, ctx);
    const sent = server.calls('/api/aure/Aurelink/AddPlatformUsers')[0].body;
    expect(zarPayeshDecrypt(String(sent.cid), FAKE_AES_KEY)).toBe(
      NATIONAL_CODE,
    );
    expect(zarPayeshDecrypt(String(sent.mobile), FAKE_AES_KEY)).toBe(
      '09121234567',
    );
    const log = logs.find((l) => l.method === 'AddPlatformUsers');
    expect(JSON.stringify(log.requestBody)).not.toContain(NATIONAL_CODE);
    expect(JSON.stringify(log.requestBody)).toContain('001****679');

    await expect(client.addPlatformUsers(req, ctx)).rejects.toMatchObject({
      code: 1016,
    });
  });

  it('Reserve → TxnFollowup → Approve با حفظ دقت reserveCode (long)', async () => {
    const { client } = setup(server);
    server.users.add(NATIONAL_CODE);
    const r = await client.reserve(
      {
        srcTrackingNumber: 1000000001n,
        typeId: 1,
        amount: 1500,
        unitPrice: 100_000_000,
        totalPrice: 150_000_000,
        vaultId: 3,
        nationalCode: NATIONAL_CODE,
        orderType: 1,
      },
      ctx,
    );
    expect(r.reserveCode).toBe('9100000000000000001');
    const f1 = await client.txnFollowup(1000000001n, ctx);
    expect(f1.status).toBe(1);
    expect(
      server
        .calls('/api/aure/Aurelink/TxnFollowup')[0]
        .query.get('srcTrackingNumber'),
    ).toBe('1000000001');

    const a = await client.approve(
      {
        reserveCode: r.reserveCode,
        orderType: 1,
        amount: 1500,
        payType: 11,
        rrn: 'order-1',
      },
      ctx,
    );
    expect(a.status).toBe(2);
    expect(server.calls('/api/aure/Aurelink/Approve')[0].body).toEqual({
      reserveCode: '9100000000000000001',
      orderType: 1,
      amount: 1500,
      payType: 11,
      rrn: 'order-1',
    });
    await expect(
      client.cancel(
        { reserveCode: r.reserveCode, orderType: 1, amount: 1500 },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 1025 });
  });

  it('مقدار اعشاری به میلی‌گرم و کد ملی نامعتبر پیش از ارسال رد می‌شوند', async () => {
    const { client } = setup(server);
    const base = {
      srcTrackingNumber: 1,
      typeId: 1,
      unitPrice: 1,
      totalPrice: 1,
      vaultId: 3,
      orderType: 1,
    };
    await expect(
      client.reserve(
        { ...base, amount: 1.5, nationalCode: NATIONAL_CODE },
        ctx,
      ),
    ).rejects.toMatchObject({ kind: 'VALIDATION' });
    await expect(
      client.reserve({ ...base, amount: 1, nationalCode: '1111111111' }, ctx),
    ).rejects.toMatchObject({ code: 1054 });
    expect(server.calls('/api/aure/Aurelink/Reserve')).toHaveLength(0);
  });

  it('پاسخ 401 → ورود مجدد و تکرار یک‌باره‌ی درخواست', async () => {
    const { client } = setup(server);
    await client.states(ctx);
    server.validTokens.clear(); // توکن در سمت سرور باطل شد
    const states = await client.states(ctx);
    expect(states[0].title).toBe('تهران');
    expect(server.calls('/api/auth/session')).toHaveLength(2);
  });

  it('Timeout → خطای نامشخص (uncertain) برای پیگیری با Followup', async () => {
    const { client } = setup(server);
    await client.states(ctx);
    server.overrides.set('/api/aure/Aurelink/Approve', () => ({
      status: 201,
      body: {},
      delayMs: 4000,
    }));
    const err = await client
      .approve(
        { reserveCode: 1, orderType: 1, amount: 1, payType: 11, rrn: 'x' },
        { ...ctx, timeoutMs: 300 },
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZarPayeshError);
    expect((err as ZarPayeshError).uncertain).toBe(true);
  });

  it('SetDeliveries: Approve بدون کد تأیید → ۱۰۳۵؛ cities با fkstate', async () => {
    const { client } = setup(server);
    await expect(
      client.setDeliveries(
        { trackingcode: 55501, setStatusDeleveries: 1, approveCode: 0 },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 1035 });
    const ok = await client.setDeliveries(
      { trackingcode: 55501, setStatusDeleveries: 2, approveCode: 0 },
      ctx,
    );
    expect(ok.setStatusDeleveries).toBe(2);
    const cities = await client.cities(8, ctx);
    expect(cities[0].fkState).toBe(8);
  });

  it('استخراج کد خطا و JSON با long بزرگ', () => {
    expect(
      extractErrorCode({ statusCode: 400, message: 'خطای 1005 رخ داد' }),
    ).toBe(1005);
    expect(extractErrorCode({ statusCode: 1046 })).toBe(1046);
    expect(
      extractErrorCode({
        responseException: { exceptionMessage: 'code:1053' },
      }),
    ).toBe(1053);
    expect(extractErrorCode({ message: 'Invalid set status' })).toBeNull();
    expect(
      parseJsonPreservingLongs('{"a":9223372036854775807,"b":12}'),
    ).toEqual({
      a: '9223372036854775807',
      b: 12,
    });
  });
});
