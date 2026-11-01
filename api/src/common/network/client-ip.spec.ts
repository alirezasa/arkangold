import * as express from 'express';
import * as request from 'supertest';
import { randomBytes } from 'crypto';
import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  PROXY_NONCE_HEADER,
  PROXY_SECRET_HEADER,
  PROXY_SIG_HEADER,
  PROXY_TS_HEADER,
  clientIpMiddleware,
  signBffRequest,
  parseProxyRanges,
  resolveTrustProxy,
} from './client-ip';

const SECRET = 'x'.repeat(48);

/** هدرهای امضاشده‌ی BFF (همان الگوریتم app/lib/client-identity.ts) */
function signed(
  ip: string,
  ua: string,
  opts: { secret?: string; ts?: number; nonce?: string } = {},
) {
  const ts = String(opts.ts ?? Date.now());
  const nonce = opts.nonce ?? randomBytes(16).toString('base64url');
  return {
    [CLIENT_IP_HEADER]: ip,
    [CLIENT_UA_HEADER]: ua,
    [PROXY_TS_HEADER]: ts,
    [PROXY_NONCE_HEADER]: nonce,
    [PROXY_SIG_HEADER]: signBffRequest(
      opts.secret ?? SECRET,
      ts,
      nonce,
      ip,
      ua,
    ),
  };
}

type Echo = { ip: string; ua?: string; leaked: string[] };
const body = (res: request.Response) => res.body as Echo;

function buildApp(
  secret: string | undefined = SECRET,
  cdnRanges: string | undefined = undefined,
) {
  const app = express();
  app.set('trust proxy', resolveTrustProxy(undefined, cdnRanges));
  const seen = new Set<string>();
  app.use(
    clientIpMiddleware(secret, (nonce) => {
      if (seen.has(nonce)) return Promise.resolve(false);
      seen.add(nonce);
      return Promise.resolve(true);
    }),
  );
  app.get('/', (req, res) => {
    res.json({
      ip: req.ip,
      ua: req.headers['user-agent'],
      leaked: [
        CLIENT_IP_HEADER,
        CLIENT_UA_HEADER,
        PROXY_SECRET_HEADER,
        PROXY_SIG_HEADER,
        PROXY_NONCE_HEADER,
        PROXY_TS_HEADER,
      ].filter((h) => h in req.headers),
    });
  });
  return app;
}

describe('client IP resolution', () => {
  it('ignores a client-spoofed leftmost X-Forwarded-For entry', async () => {
    // supertest از loopback وصل می‌شود، پس خودش نقش پراکسی داخلی مورد اعتماد را دارد
    const res = await request(buildApp())
      .get('/')
      .set('X-Forwarded-For', '1.1.1.1, 8.8.8.8');
    expect(body(res).ip).toBe('8.8.8.8');
  });

  it('skips internal proxy hops in the chain', async () => {
    const res = await request(buildApp())
      .get('/')
      .set('X-Forwarded-For', '8.8.8.8, 10.0.0.5, 100.64.1.2');
    expect(body(res).ip).toBe('8.8.8.8');
  });

  it('accepts the BFF-forwarded IP and user agent only with a valid signature', async () => {
    const res = await request(buildApp())
      .get('/')
      .set(signed('203.0.113.7', 'Mozilla/5.0 test'));
    expect(body(res)).toEqual({
      ip: '203.0.113.7',
      ua: 'Mozilla/5.0 test',
      leaked: [],
    });
  });

  it('no longer accepts the raw shared secret in a header', async () => {
    const res = await request(buildApp())
      .get('/')
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, '203.0.113.7');
    expect(body(res).ip).not.toBe('203.0.113.7');
    expect(body(res).leaked).toEqual([]);
  });

  it('rejects a wrong key, tampered values, stale timestamps and replayed nonces', async () => {
    const app = buildApp();
    const wrongKey = await request(app)
      .get('/')
      .set(signed('203.0.113.7', 'ua', { secret: 'y'.repeat(48) }));
    expect(body(wrongKey).ip).not.toBe('203.0.113.7');

    const h = signed('203.0.113.7', 'ua');
    const tampered = await request(app)
      .get('/')
      .set({ ...h, [CLIENT_IP_HEADER]: '198.51.100.9' });
    expect(body(tampered).ip).not.toBe('198.51.100.9');

    const stale = await request(app)
      .get('/')
      .set(signed('203.0.113.7', 'ua', { ts: Date.now() - 5 * 60_000 }));
    expect(body(stale).ip).not.toBe('203.0.113.7');

    const fresh = signed('203.0.113.8', 'ua');
    const first = await request(app).get('/').set(fresh);
    expect(body(first).ip).toBe('203.0.113.8');
    const replay = await request(app).get('/').set(fresh);
    expect(body(replay).ip).not.toBe('203.0.113.8');
  });

  it('never trusts forwarded identity when no secret is configured', async () => {
    const res = await request(buildApp(undefined))
      .get('/')
      .set(signed('203.0.113.7', 'ua', { secret: '' }));
    expect(body(res).ip).not.toBe('203.0.113.7');
  });

  it('ignores a forwarded value that is not an IP address', async () => {
    const res = await request(buildApp())
      .get('/')
      .set(signed('not-an-ip', 'ua'));
    expect(body(res).ip).not.toBe('not-an-ip');
  });

  it('parses TRUST_PROXY values', () => {
    expect(resolveTrustProxy('2', '')).toBe(2);
    expect(resolveTrustProxy('true', '')).toBe(true);
    expect(resolveTrustProxy('false', '')).toBe(false);
    expect(resolveTrustProxy('loopback, 173.245.48.0/20', '')).toBe(
      'loopback, 173.245.48.0/20',
    );
  });

  it('appends CDN_PROXY_RANGES to the trusted proxy list', () => {
    expect(resolveTrustProxy(undefined, '185.143.232.0/22\n2.146.0.0/28')).toBe(
      'loopback, linklocal, uniquelocal, 100.64.0.0/10, 185.143.232.0/22, 2.146.0.0/28',
    );
    expect(resolveTrustProxy('loopback', '185.143.232.0/22')).toBe(
      'loopback, 185.143.232.0/22',
    );
  });

  it('separates invalid CDN_PROXY_RANGES entries', () => {
    expect(
      parseProxyRanges(
        '185.143.232.0/22, 2a0b:4d80::/32 bad 1.2.3.4/40 1.2.3.4',
      ),
    ).toEqual({
      valid: ['185.143.232.0/22', '2a0b:4d80::/32', '1.2.3.4'],
      invalid: ['bad', '1.2.3.4/40'],
    });
  });

  it('resolves the visitor IP behind a trusted CDN edge', async () => {
    // مسیر: کاربر ← لبه‌ی آروان (185.143.232.10) ← پراکسی داخلی پلتفرم ← برنامه
    const chain = '1.1.1.1, 8.8.8.8, 185.143.232.10';
    const withoutCdn = await request(buildApp())
      .get('/')
      .set('X-Forwarded-For', chain);
    expect(body(withoutCdn).ip).toBe('185.143.232.10');

    const withCdn = await request(buildApp(SECRET, '185.143.232.0/22'))
      .get('/')
      .set('X-Forwarded-For', chain);
    expect(body(withCdn).ip).toBe('8.8.8.8');
  });
});
