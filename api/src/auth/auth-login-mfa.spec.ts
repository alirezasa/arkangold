// api/src/auth/auth-login-mfa.spec.ts
//
// ورود پیامکی بدون رمز: برای حساب دارای برنامه‌ی احراز هویت، کد پیامکی به‌تنهایی نشست صادر
// نمی‌کند و کد برنامه هم لازم است (FIA_UAU_EXT.2.3)؛ شمارش تلاش‌های OTP اتمی است.
import type Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { LoginChallengeService } from '../common/auth-security/login-challenge.service';
import { FakeRedis } from '../common/testing/fake-redis';
import { hashPassword } from '../common/crypto/password.util';

const PHONE = '09120000000';
const OTP = '123456';
const PASSWORD = 'Str0ng-Unit-Test-Pass';

async function setup(opts: {
  totpEnabled: boolean;
  /** security.login.user_password_sms_code_enabled (پیش‌فرض روشن) */
  passwordSmsCode?: boolean;
}) {
  process.env.JWT_ACCESS_SECRET ??= 'unit-test-access-secret-unit-test-access';
  process.env.JWT_REFRESH_SECRET ??=
    'unit-test-refresh-secret-unit-test-refresh';
  const redis = new FakeRedis();
  const challenges = new LoginChallengeService(redis as unknown as Redis);
  const user = {
    id: 'u1',
    phone: PHONE,
    status: 'ACTIVE',
    type: 'REAL',
    referralCode: 'ABC',
    totpEnabled: opts.totpEnabled,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordHash: await hashPassword(PASSWORD),
  };
  const sessions: unknown[] = [];
  const prisma = {
    user: {
      findUnique: () => Promise.resolve(user),
      update: () => Promise.resolve(user),
    },
    userOtp: {
      deleteMany: () => Promise.resolve({ count: 1 }),
      findFirst: () => Promise.resolve(null),
      create: () => Promise.resolve({}),
    },
    userSession: {
      create: (args: unknown) => {
        sessions.push(args);
        return Promise.resolve(args);
      },
    },
  };
  const noop = () => Promise.resolve();
  const mfa = {
    verify: jest.fn((_o: unknown, code: string) =>
      Promise.resolve(code === '654321' ? 'totp' : null),
    ),
  };
  const smsSend = jest.fn(() =>
    Promise.resolve({ status: 'SENT', providerCode: null, logId: null }),
  );
  const auth = new AuthService(
    prisma as never,
    { sign: () => 'jwt' } as never,
    {} as never,
    { logUser: noop } as never,
    redis as unknown as Redis,
    {
      getSessionPolicy: () =>
        Promise.resolve({ accessTtlSeconds: 900, refreshTtlSeconds: 86400 }),
      getBoolean: (key: string, fallback: boolean) =>
        Promise.resolve(
          key === 'security.login.user_password_sms_code_enabled'
            ? (opts.passwordSmsCode ?? fallback)
            : fallback,
        ),
    } as never,
    {} as never,
    { send: smsSend } as never,
    {} as never,
    {
      assertAllowed: noop,
      captchaRequired: () => Promise.resolve(false),
      recordFailure: () =>
        Promise.resolve({ failures: 1, delaySeconds: 0, justThrottled: false }),
      recordSuccess: noop,
    } as never,
    { enforce: noop } as never,
    { consume: noop } as never,
    { onSuccessfulLogin: noop, onSecurityChange: noop } as never,
    challenges,
    mfa as never,
  );
  await redis.set(`otp:${PHONE}:LOGIN`, await bcrypt.hash(OTP, 4));
  const token = await challenges.create({
    kind: 'user',
    accountId: user.id,
    stage: 'SMS_OTP',
    via: 'sms_otp',
    purpose: 'login',
    identifier: PHONE,
  });
  return { auth, token, sessions, redis, smsSend };
}

describe('AuthService password login — ارسال کد پیامکی پس از رمز (تنظیم پنل)', () => {
  it('روشن (پیش‌فرض): پس از رمز کد پیامکی ارسال و مرحله‌ی دوم خواسته می‌شود', async () => {
    const { auth, sessions, smsSend } = await setup({ totpEnabled: false });
    const res = await auth.login({ phone: PHONE, password: PASSWORD });
    expect(res).toMatchObject({ mfaRequired: true, method: 'SMS' });
    expect(smsSend).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(0);
  });

  it('خاموش: کاربر با رمز درست مستقیم وارد می‌شود و پیامکی ارسال نمی‌شود', async () => {
    const { auth, sessions, smsSend } = await setup({
      totpEnabled: false,
      passwordSmsCode: false,
    });
    const res = await auth.login({ phone: PHONE, password: PASSWORD });
    expect(res).toHaveProperty('accessToken', 'jwt');
    expect(res).not.toHaveProperty('mfaRequired');
    expect(smsSend).not.toHaveBeenCalled();
    expect(sessions).toHaveLength(1);
  });

  it('خاموش: رمز نادرست همچنان رد می‌شود', async () => {
    const { auth, sessions } = await setup({
      totpEnabled: false,
      passwordSmsCode: false,
    });
    await expect(
      auth.login({ phone: PHONE, password: 'wrong-password-123' }),
    ).rejects.toThrow();
    expect(sessions).toHaveLength(0);
  });

  it('خاموش: کاربری که برنامه‌ی احراز هویت را فعال کرده همچنان کد برنامه را وارد می‌کند', async () => {
    const { auth, sessions, smsSend } = await setup({
      totpEnabled: true,
      passwordSmsCode: false,
    });
    const res = await auth.login({ phone: PHONE, password: PASSWORD });
    expect(res).toMatchObject({ mfaRequired: true, method: 'TOTP' });
    expect(smsSend).not.toHaveBeenCalled();
    expect(sessions).toHaveLength(0);
  });
});

describe('AuthService SMS login with authenticator app', () => {
  it('requires the authenticator code after the SMS code when TOTP is enabled', async () => {
    const { auth, token, sessions } = await setup({ totpEnabled: true });

    const step = await auth.verifyLoginMfa(token, OTP);
    expect(step).toEqual({
      mfaRequired: true,
      method: 'TOTP',
      challengeToken: token,
    });
    expect(sessions).toHaveLength(0);

    await expect(auth.verifyLoginMfa(token, '000000')).rejects.toThrow(
      'کد وارد شده نادرست',
    );
    expect(sessions).toHaveLength(0);

    const done = await auth.verifyLoginMfa(token, '654321');
    expect(done).toHaveProperty('accessToken', 'jwt');
    expect(sessions).toHaveLength(1);
    await expect(auth.verifyLoginMfa(token, '654321')).rejects.toThrow();
  });

  it('issues a session directly from the SMS code when TOTP is not enabled', async () => {
    const { auth, token, sessions } = await setup({ totpEnabled: false });
    await expect(auth.verifyLoginMfa(token, OTP)).resolves.toHaveProperty(
      'accessToken',
    );
    expect(sessions).toHaveLength(1);
  });

  it('caps OTP guesses even when they arrive concurrently', async () => {
    const { auth, redis } = await setup({ totpEnabled: false });
    const validate = (code: string) =>
      (
        auth as unknown as {
          validateOtp(p: string, c: string, purpose: string): Promise<void>;
        }
      ).validateOtp(PHONE, code, 'LOGIN');
    const wrong = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => validate(String(100000 + i))),
    );
    expect(wrong.every((r) => r.status === 'rejected')).toBe(true);
    // پس از اتمام سهمیه، کد درست هم دیگر پذیرفته نمی‌شود
    await expect(validate(OTP)).rejects.toThrow();
    expect(redis.store.has(`otp:${PHONE}:LOGIN`)).toBe(false);
  });
});
