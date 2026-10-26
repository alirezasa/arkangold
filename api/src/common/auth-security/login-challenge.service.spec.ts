import type Redis from 'ioredis';
import {
  LoginChallengeService,
  MAX_CHALLENGE_ATTEMPTS,
} from './login-challenge.service';
import { FakeRedis } from '../testing/fake-redis';

describe('LoginChallengeService', () => {
  const base = {
    kind: 'user' as const,
    accountId: 'u1',
    stage: 'TOTP' as const,
    via: 'password' as const,
  };

  it('counts concurrent failures atomically and expires the challenge', async () => {
    const svc = new LoginChallengeService(new FakeRedis() as unknown as Redis);
    const token = await svc.create(base);
    // درخواست‌های همزمان همه پیش از ثبت شکست، همان وضعیت را خوانده‌اند
    const remaining = await Promise.all(
      Array.from({ length: MAX_CHALLENGE_ATTEMPTS }, () => svc.fail(token)),
    );
    expect([...remaining].sort()).toEqual([0, 1, 2, 3, 4]);
    await expect(svc.get(token, 'user', ['TOTP'])).rejects.toThrow();
  });

  it('rejects a challenge whose attempts are exhausted even if still stored', async () => {
    const redis = new FakeRedis();
    const svc = new LoginChallengeService(redis as unknown as Redis);
    const token = await svc.create(base);
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS - 1; i++) await svc.fail(token);
    await expect(svc.get(token, 'user', ['TOTP'])).resolves.toMatchObject({
      attempts: MAX_CHALLENGE_ATTEMPTS - 1,
    });
    // شمارنده‌ای که از سقف گذشته (مثلاً با درخواست همزمان) مرحله را باطل می‌کند
    for (const [k, v] of redis.store) {
      if (k.startsWith('login-ch-att:'))
        redis.store.set(k, String(Number(v) + 1));
    }
    await expect(svc.get(token, 'user', ['TOTP'])).rejects.toThrow();
  });

  it('is single-use and resets attempts when advancing to the next stage', async () => {
    const svc = new LoginChallengeService(new FakeRedis() as unknown as Redis);
    const token = await svc.create({ ...base, stage: 'SMS_OTP' });
    await svc.fail(token);
    const ch = await svc.get(token, 'user', ['SMS_OTP']);
    await svc.advance(token, ch, 'TOTP');
    await expect(svc.get(token, 'user', ['TOTP'])).resolves.toMatchObject({
      attempts: 0,
    });
    expect(await svc.consume(token)).toBe(true);
    expect(await svc.consume(token)).toBe(false);
  });
});
