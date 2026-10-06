// api/src/common/resilience/circuit-breaker.ts
//
// FPT_FLS_EXT.1.2 — سازوکار قطع‌کننده (Circuit Breaker) برای فراخوانی سرویس‌های خارجی
// (درگاه پرداخت، استعلام‌های فینوتک و ...). پس از چند شکست پیاپی، مدار «باز» می‌شود و تا پایان
// زمان استراحت هیچ درخواستی به سرویس معیوب ارسال نمی‌شود (پاسخ فوری و امن به‌جای انتظار و
// تلاش‌های مکرر)؛ سپس یک درخواست آزمایشی (half-open) اجازه می‌یابد و در صورت موفقیت مدار بسته
// می‌شود. خطا هرگز به موفقیت تبدیل نمی‌شود (fail-closed) و جزئیات فنی به کاربر نمی‌رسد.
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { isAxiosError } from 'axios';

export interface CircuitBreakerOptions {
  /** تعداد شکست پیاپی برای باز شدن مدار */
  failureThreshold?: number;
  /** مدت باز ماندن مدار پیش از درخواست آزمایشی (میلی‌ثانیه) */
  cooldownMs?: number;
}

/** خطای شبکه، timeout یا ۵xx نشانه‌ی خرابی سرویس بیرونی است؛ ۴xx (خطای درخواست) نیست */
export function isUpstreamFailure(err: unknown): boolean {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    return status === undefined || status >= 500 || status === 429;
  }
  return true;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends ServiceUnavailableException {
  constructor(readonly service: string) {
    super({
      message:
        'این سرویس موقتاً در دسترس نیست؛ لطفاً چند دقیقه‌ی دیگر دوباره تلاش کنید',
      code: 'SERVICE_TEMPORARILY_UNAVAILABLE',
    });
  }
}

export class CircuitBreaker {
  private static readonly registry = new Map<string, CircuitBreaker>();
  private readonly logger: Logger;
  private failures = 0;
  private openedAt: number | null = null;
  private probing = false;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  private constructor(
    readonly name: string,
    opts: CircuitBreakerOptions = {},
  ) {
    this.logger = new Logger(`CircuitBreaker:${name}`);
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  /** یک مدار مشترک برای هر سرویس (در سطح فرآیند) */
  static for(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = CircuitBreaker.registry.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, opts);
      CircuitBreaker.registry.set(name, breaker);
    }
    return breaker;
  }

  /** وضعیت همه‌ی مدارها (برای پنل امنیت) */
  static snapshot() {
    return Array.from(CircuitBreaker.registry.values()).map((b) => ({
      name: b.name,
      state: b.state,
      failures: b.failures,
      openedAt: b.openedAt ? new Date(b.openedAt).toISOString() : null,
    }));
  }

  get state(): CircuitState {
    if (this.openedAt === null) return 'CLOSED';
    return Date.now() - this.openedAt >= this.cooldownMs ? 'HALF_OPEN' : 'OPEN';
  }

  /**
   * اجرای فراخوانی از پشت مدار. isFailure مشخص می‌کند کدام خطا نشانه‌ی خرابی سرویس است
   * (پیش‌فرض: همه‌ی خطاها؛ خطاهای منطقی سمت کاربر را می‌توان مستثنا کرد).
   */
  async execute<T>(
    fn: () => Promise<T>,
    isFailure: (err: unknown) => boolean = () => true,
  ): Promise<T> {
    const state = this.state;
    if (state === 'OPEN' || (state === 'HALF_OPEN' && this.probing)) {
      throw new CircuitOpenError(this.name);
    }
    const probe = state === 'HALF_OPEN';
    if (probe) this.probing = true;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      if (isFailure(err)) this.onFailure(probe);
      throw err;
    } finally {
      if (probe) this.probing = false;
    }
  }

  private onSuccess() {
    if (this.openedAt !== null)
      this.logger.log('مدار بسته شد؛ سرویس دوباره در دسترس است');
    this.failures = 0;
    this.openedAt = null;
  }

  private onFailure(probe: boolean) {
    this.failures += 1;
    if (probe || this.failures >= this.failureThreshold) {
      if (this.openedAt === null || probe) {
        this.logger.warn(
          `مدار باز شد پس از ${this.failures} شکست؛ تا ${Math.round(this.cooldownMs / 1000)} ثانیه درخواستی ارسال نمی‌شود`,
        );
      }
      this.openedAt = Date.now();
    }
  }

  /** فقط برای تست */
  static resetAll() {
    CircuitBreaker.registry.clear();
  }
}
