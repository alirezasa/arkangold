// api/src/common/auth-security/login-throttle.service.ts
//
// FIA_UAU_EXT.2.1 — دفاع در برابر حدس رمز و سوءاستفاده از اعتبارنامه‌های افشاشده:
//  ۱) محدودسازی نرخ: شمارش تلاش ناموفق برای هر شناسه (شماره/نام کاربری) و هر IP در Redis
//     (مشترک بین همه‌ی نمونه‌های API).
//  ۲) تأخیر فزاینده به‌جای قفل طولانی: پس از ۵ تلاش ناموفق، تلاش بعدی ۱ ثانیه، سپس ۲، ۴، ۸ …
//     تا سقف ۱۵ دقیقه صبر لازم دارد؛ کاربر قانونی برای مدت طولانی قفل نمی‌شود.
//  ۳) تشخیص خودکار: پس از ۳ تلاش ناموفق برای یک شناسه، ۱۰ تلاش ناموفق از یک IP یا User-Agent
//     ابزارهای خودکار، حل «بررسی امنیتی» (Proof-of-Work) الزامی می‌شود؛ پس از ۵۰ تلاش ناموفق
//     از یک IP در ۱۵ دقیقه، آن IP به مدت ۱۵ دقیقه مسدود می‌شود.
//
// FIA_UAU_EXT.2.7: شمارنده‌ها برای شناسه‌های موجود و ناموجود دقیقاً یکسان رفتار می‌کنند،
// پس پاسخ «صبر کنید» وجود حساب را افشا نمی‌کند.
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { BlockList, isIP } from 'net';

export type LoginScope = 'user' | 'admin' | 'agent' | 'mfa';

export const FREE_FAILED_ATTEMPTS = 5;
export const MAX_DELAY_SECONDS = 15 * 60;
const FAIL_WINDOW_SECONDS = 6 * 60 * 60;
const CAPTCHA_AFTER_IDENTIFIER_FAILURES = 3;
const CAPTCHA_AFTER_IP_FAILURES = 10;
const IP_FAIL_WINDOW_SECONDS = 15 * 60;
const IP_BLOCK_THRESHOLD = 50;
const IP_BLOCK_SECONDS = 15 * 60;

const BOT_UA =
  /(curl|wget|python|httpie|libwww|okhttp|go-http|java\/|node-fetch|undici|postman|insomnia|scrapy|phantomjs|headless|bot\b|spider|crawler)/i;

// IPهای داخلی (loopback/شبکه‌ی خصوصی) معمولاً خود سرور BFF هستند، نه کاربر؛ اگر BFF هویت کاربر را
// با INTERNAL_PROXY_SECRET نفرستد، شمارش/مسدودسازی بر اساس IP همه‌ی کاربران را با هم مسدود می‌کرد.
// برای این IPها فقط محدودیت مبتنی بر شناسه (شماره/نام کاربری) اعمال می‌شود.
const INTERNAL = new BlockList();
for (const [net, bits] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
] as const) {
  INTERNAL.addSubnet(net, bits, 'ipv4');
}
INTERNAL.addAddress('::1', 'ipv6');
INTERNAL.addSubnet('fc00::', 7, 'ipv6');
INTERNAL.addSubnet('fe80::', 10, 'ipv6');

function attributableIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const v = ip.replace(/^::ffff:/, '');
  const family = isIP(v);
  if (!family) return undefined;
  return INTERNAL.check(v, family === 6 ? 'ipv6' : 'ipv4') ? undefined : v;
}

export function isAutomationUserAgent(ua?: string | null): boolean {
  return !ua || ua.trim().length < 10 || BOT_UA.test(ua);
}

export interface FailureResult {
  failures: number;
  /** تأخیر اعمال‌شده برای تلاش بعدی (ثانیه)؛ صفر یعنی هنوز در سهمیه‌ی آزاد است */
  delaySeconds: number;
  /** همین تلاش، حساب را وارد دوره‌ی تأخیر کرد (برای ثبت رویداد و هشدار) */
  justThrottled: boolean;
}

@Injectable()
export class LoginThrottleService {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  private id(scope: LoginScope, identifier: string) {
    const h = createHash('sha256')
      .update(identifier.trim().toLowerCase())
      .digest('hex')
      .slice(0, 32);
    return `${scope}:${h}`;
  }

  /** پیش از بررسی رمز: اگر شناسه یا IP در دوره‌ی تأخیر/مسدودی است، 429 */
  async assertAllowed(scope: LoginScope, identifier: string, rawIp?: string) {
    const ip = attributableIp(rawIp);
    if (ip) {
      const ipTtl = await this.redis.ttl(`lt:ipblock:${ip}`);
      if (ipTtl > 0) {
        throw new HttpException(
          {
            statusCode: 429,
            code: 'IP_TEMPORARILY_BLOCKED',
            message: `به دلیل تلاش‌های ناموفق مکرر، ورود از این نشانی موقتاً محدود شده است. ${Math.ceil(ipTtl / 60).toLocaleString('fa-IR')} دقیقه دیگر تلاش کنید`,
            retryAfter: ipTtl,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const ttl = await this.redis.ttl(`lt:block:${this.id(scope, identifier)}`);
    if (ttl > 0) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'LOGIN_THROTTLED',
          message: `به دلیل تلاش‌های ناموفق مکرر، ${ttl.toLocaleString('fa-IR')} ثانیه دیگر دوباره تلاش کنید`,
          retryAfter: ttl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(
    scope: LoginScope,
    identifier: string,
    rawIp?: string,
  ): Promise<FailureResult> {
    const ip = attributableIp(rawIp);
    const key = this.id(scope, identifier);
    const failures = await this.redis.incr(`lt:fail:${key}`);
    await this.redis.expire(`lt:fail:${key}`, FAIL_WINDOW_SECONDS);
    let delaySeconds = 0;
    if (failures >= FREE_FAILED_ATTEMPTS) {
      delaySeconds = Math.min(
        2 ** (failures - FREE_FAILED_ATTEMPTS),
        MAX_DELAY_SECONDS,
      );
      await this.redis.setex(`lt:block:${key}`, delaySeconds, '1');
    }
    if (ip) {
      const ipFailures = await this.redis.incr(`lt:ipfail:${ip}`);
      if (ipFailures === 1) {
        await this.redis.expire(`lt:ipfail:${ip}`, IP_FAIL_WINDOW_SECONDS);
      }
      if (ipFailures >= IP_BLOCK_THRESHOLD) {
        await this.redis.setex(`lt:ipblock:${ip}`, IP_BLOCK_SECONDS, '1');
      }
    }
    return {
      failures,
      delaySeconds,
      justThrottled: failures === FREE_FAILED_ATTEMPTS,
    };
  }

  async recordSuccess(scope: LoginScope, identifier: string) {
    const key = this.id(scope, identifier);
    await this.redis.del(`lt:fail:${key}`, `lt:block:${key}`);
  }

  /** رفع قفل توسط مدیر (پنل مدیریت ادمین‌ها) */
  clear(scope: LoginScope, identifier: string) {
    return this.recordSuccess(scope, identifier);
  }

  async failures(scope: LoginScope, identifier: string): Promise<number> {
    return Number(
      (await this.redis.get(`lt:fail:${this.id(scope, identifier)}`)) ?? 0,
    );
  }

  /** آیا این درخواست باید «بررسی امنیتی» (Proof-of-Work) را حل کند؟ */
  async captchaRequired(
    scope: LoginScope,
    identifier: string,
    rawIp?: string,
    userAgent?: string,
  ): Promise<boolean> {
    const ip = attributableIp(rawIp);
    if (isAutomationUserAgent(userAgent)) return true;
    if (
      (await this.failures(scope, identifier)) >=
      CAPTCHA_AFTER_IDENTIFIER_FAILURES
    ) {
      return true;
    }
    if (ip) {
      const ipFailures = Number((await this.redis.get(`lt:ipfail:${ip}`)) ?? 0);
      if (ipFailures >= CAPTCHA_AFTER_IP_FAILURES) return true;
    }
    return false;
  }

  /** آمار برای پنل امنیت */
  async stats() {
    const count = async (pattern: string) => {
      let cursor = '0';
      let n = 0;
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          500,
        );
        cursor = next;
        n += keys.length;
      } while (cursor !== '0');
      return n;
    };
    return {
      throttledIdentifiers: await count('lt:block:*'),
      blockedIps: await count('lt:ipblock:*'),
    };
  }
}
