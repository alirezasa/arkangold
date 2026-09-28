import * as express from 'express';
import * as request from 'supertest';
import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  PROXY_SECRET_HEADER,
  clientIpMiddleware,
  parseProxyRanges,
  resolveTrustProxy,
} from './client-ip';

const SECRET = 'x'.repeat(48);

type Echo = { ip: string; ua?: string; leaked: string[] };
const body = (res: request.Response) => res.body as Echo;

function buildApp(
  secret: string | undefined = SECRET,
  cdnRanges: string | undefined = undefined,
) {
  const app = express();
  app.set('trust proxy', resolveTrustProxy(undefined, cdnRanges));
  app.use(clientIpMiddleware(secret));
  app.get('/', (req, res) => {
    res.json({
      ip: req.ip,
      ua: req.headers['user-agent'],
      leaked: [CLIENT_IP_HEADER, CLIENT_UA_HEADER, PROXY_SECRET_HEADER].filter(
        (h) => h in req.headers,
      ),
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

  it('accepts the BFF-forwarded IP and user agent only with the shared secret', async () => {
    const res = await request(buildApp())
      .get('/')
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, '203.0.113.7')
      .set(CLIENT_UA_HEADER, 'Mozilla/5.0 test');
    expect(body(res)).toEqual({
      ip: '203.0.113.7',
      ua: 'Mozilla/5.0 test',
      leaked: [],
    });
  });

  it('rejects forwarded identity with a wrong secret and strips the headers', async () => {
    const res = await request(buildApp())
      .get('/')
      .set('User-Agent', 'curl/8')
      .set(PROXY_SECRET_HEADER, 'y'.repeat(48))
      .set(CLIENT_IP_HEADER, '203.0.113.7');
    expect(body(res).ip).not.toBe('203.0.113.7');
    expect(body(res).ua).toBe('curl/8');
    expect(body(res).leaked).toEqual([]);
  });

  it('never trusts forwarded identity when no secret is configured', async () => {
    const res = await request(buildApp(undefined))
      .get('/')
      .set(PROXY_SECRET_HEADER, '')
      .set(CLIENT_IP_HEADER, '203.0.113.7');
    expect(body(res).ip).not.toBe('203.0.113.7');
  });

  it('ignores a forwarded value that is not an IP address', async () => {
    const res = await request(buildApp())
      .get('/')
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, 'not-an-ip');
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
