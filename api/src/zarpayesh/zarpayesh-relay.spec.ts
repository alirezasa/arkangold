// api/src/zarpayesh/zarpayesh-relay.spec.ts
//
// مسیر رله‌ی MPLS: کلید و گواهی mTLS فقط برای origin رله، https اجباری، پذیرش PEM و Base64.
import {
  decodePem,
  getRelayOptions,
  resetRelayCache,
  ZARPAYESH_RELAY_HEADER,
} from './zarpayesh-relay';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const RELAY = 'https://zp-relay.arkan.gold:8443';

describe('zarpayesh-relay', () => {
  afterEach(() => resetRelayCache());

  it('بدون ZARPAYESH_RELAY_URL هیچ چیزی اضافه نمی‌شود', () => {
    expect(
      getRelayOptions('https://api.rpmms.ir', { ZARPAYESH_RELAY_SECRET: 'x' }),
    ).toEqual({ headers: {} });
  });

  it('کلید فقط به origin رله فرستاده می‌شود', () => {
    const env = { ZARPAYESH_RELAY_URL: RELAY, ZARPAYESH_RELAY_SECRET: 'k1' };
    expect(getRelayOptions(`${RELAY}/`, env).headers).toEqual({
      [ZARPAYESH_RELAY_HEADER]: 'k1',
    });
    expect(getRelayOptions('https://api.rpmms.ir', env)).toEqual({
      headers: {},
    });
    // پورت متفاوت = origin متفاوت
    expect(getRelayOptions('https://zp-relay.arkan.gold', env).headers).toEqual(
      {},
    );
  });

  it('رله‌ی http پذیرفته نمی‌شود', () => {
    expect(() =>
      getRelayOptions('http://relay', { ZARPAYESH_RELAY_URL: 'http://relay' }),
    ).toThrow(/https/);
  });

  it('گواهی بدون کلید خطای پیکربندی است', () => {
    expect(() =>
      getRelayOptions(RELAY, {
        ZARPAYESH_RELAY_URL: RELAY,
        ZARPAYESH_RELAY_CLIENT_CERT: PEM,
      }),
    ).toThrow(/CLIENT_KEY/);
  });

  it('با CA یک https.Agent ساخته و بین درخواست‌ها نگه داشته می‌شود', () => {
    const env = {
      ZARPAYESH_RELAY_URL: RELAY,
      ZARPAYESH_RELAY_CA: Buffer.from(PEM).toString('base64'),
    };
    const a = getRelayOptions(RELAY, env).httpsAgent;
    expect(a).toBeDefined();
    expect(a?.options.ca).toBe(PEM);
    expect(getRelayOptions(RELAY, env).httpsAgent).toBe(a);
  });

  it('decodePem: PEM خام، PEM با \\n متنی و Base64', () => {
    expect(decodePem(PEM)).toBe(PEM);
    expect(decodePem(PEM.replace(/\n/g, '\\n'))).toBe(PEM);
    expect(decodePem(Buffer.from(PEM).toString('base64'))).toBe(PEM);
    expect(decodePem('  ')).toBeUndefined();
    expect(() => decodePem('bm90LXBlbQ==')).toThrow(/PEM/);
  });
});
