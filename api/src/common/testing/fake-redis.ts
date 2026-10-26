// api/src/common/testing/fake-redis.ts
//
// پیاده‌سازی درون‌حافظه‌ای حداقلی از دستورهای Redis که سرویس‌های احراز هویت و قیمت استفاده می‌کنند؛
// فقط برای آزمون‌های واحد (بدون مهلت انقضای واقعی).
export class FakeRedis {
  readonly store = new Map<string, string>();

  get(key: string) {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  set(key: string, value: string, ..._args: unknown[]) {
    const nx = _args.includes('NX');
    if (nx && this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
  setex(key: string, _ttl: number, value: string) {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
  del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return Promise.resolve(n);
  }
  incr(key: string) {
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }
  exists(key: string) {
    return Promise.resolve(this.store.has(key) ? 1 : 0);
  }
  expire() {
    return Promise.resolve(1);
  }
  ttl(key: string) {
    return Promise.resolve(this.store.has(key) ? 600 : -2);
  }
}
