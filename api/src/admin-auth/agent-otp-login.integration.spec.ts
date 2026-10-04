// api/src/admin-auth/agent-otp-login.integration.spec.ts
//
// آزمون یکپارچه‌ی ورود نمایندگان با کد یکبارمصرف روی PostgreSQL و Redis واقعی:
//   فقط شماره‌ی ثبت‌شده روی حساب نماینده کد می‌گیرد ← پاسخ یکسان برای شماره‌ی ناشناس
//   ← کد اشتباه/سقف تلاش ← مصرف یکباره‌ی کد ← تفکیک درگاه ورود (مدیریت / نمایندگان)
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... INTEGRATION_REDIS_URL=redis://... npx jest agent-otp-login
// بدون این متغیرها آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { hashPassword } from '../common/crypto/password.util';
import { RbacSyncService } from './rbac-sync.service';
import { AdminAuthService } from './admin-auth.service';
import { AgentOtpLoginService } from './agent-otp-login.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;
const run = url && redisUrl ? describe : describe.skip;

run('ورود نماینده با کد یکبارمصرف (یکپارچه با PostgreSQL و Redis)', () => {
  let prisma: PrismaService;
  let redis: Redis;
  let auth: AdminAuthService;
  let otp: AgentOtpLoginService;
  const sent: { key: string; phone: string; code: string }[] = [];
  const suffix = randomUUID().slice(0, 8);
  const phone = `0912${String(Date.now()).slice(-7)}`;
  const unknownPhone = `0935${String(Date.now()).slice(-7)}`;
  let accountId: string;

  const lastCode = () => sent[sent.length - 1].code;
  const clearRateLimit = async (p: string) =>
    redis.del(`agent-otp:gap:${p}`, `agent-otp:hourly:${p}`);

  beforeAll(async () => {
    process.env.JWT_ADMIN_SECRET ??= 'integration-admin-secret-integration';
    process.env.JWT_ADMIN_REFRESH_SECRET ??=
      'integration-admin-refresh-secret-integration';
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    redis = new Redis(redisUrl);
    await new RbacSyncService(prisma).onModuleInit();
    const config = new SystemConfigService(prisma);
    await config.onModuleInit();
    const audit = new AuditService(prisma);
    auth = new AdminAuthService(
      prisma,
      new JwtService({}),
      new ConfigService(),
      audit,
      config,
    );
    const sms = {
      send: (key: string, to: string, vars: { code: string }) => {
        sent.push({ key, phone: to, code: vars.code });
        return Promise.resolve({ sent: true });
      },
    } as unknown as SmsTemplateService;
    otp = new AgentOtpLoginService(prisma, audit, auth, sms, redis);

    const agent = await prisma.agent.create({
      data: {
        code: `AGT-IT-${suffix}`,
        name: 'نمایندگی آزمون',
        managerName: 'مدیر آزمون',
        phone,
      },
    });
    const account = await prisma.adminUser.create({
      data: {
        username: `agent-${suffix}`,
        passwordHash: await hashPassword('agent-password-1234'),
        fullName: 'نماینده آزمون',
        phone,
        agentId: agent.id,
        roles: { create: { role: { connect: { key: 'AGENT' } } } },
      },
    });
    accountId = account.id;
    await prisma.adminUser.create({
      data: {
        username: `staff-${suffix}`,
        passwordHash: await hashPassword('staff-password-1234'),
        fullName: 'کارشناس آزمون',
        roles: { create: { role: { connect: { key: 'SUPPORT_ADMIN' } } } },
      },
    });
  });

  afterAll(async () => {
    await redis?.quit();
    await prisma?.$disconnect();
  });

  it('شماره‌ی ثبت‌نشده کد نمی‌گیرد ولی پاسخ همان پاسخ شماره‌ی ثبت‌شده است', async () => {
    const unknown = await otp.requestCode(unknownPhone);
    expect(sent).toHaveLength(0);

    const known = await otp.requestCode(phone);
    expect(known).toEqual(unknown);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ key: 'AGENT_LOGIN_OTP', phone });
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it('ارسال مجدد پیش از پایان فاصله‌ی مجاز رد می‌شود', async () => {
    await expect(otp.requestCode(phone)).rejects.toThrow('ثانیه دیگر');
  });

  it('کد اشتباه رد می‌شود و کد درست یک‌بار مصرف است', async () => {
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(otp.verifyCode(phone, wrong)).rejects.toThrow(
      'کد ورود نادرست است',
    );

    // کد با ارقام فارسی هم پذیرفته می‌شود
    const persian = code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    const res = await otp.verifyCode(phone, persian);
    expect(res.accessToken).toBeTruthy();
    expect(res.admin.id).toBe(accountId);
    expect(
      await prisma.adminSession.count({ where: { adminUserId: accountId } }),
    ).toBe(1);

    await expect(otp.verifyCode(phone, code)).rejects.toThrow(
      'کد ورود نادرست یا منقضی شده است',
    );
  });

  it('پس از ۵ تلاش ناموفق کد باطل می‌شود', async () => {
    await clearRateLimit(phone);
    await otp.requestCode(phone);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(otp.verifyCode(phone, wrong)).rejects.toThrow();
    }
    await expect(otp.verifyCode(phone, code)).rejects.toThrow(
      'تعداد تلاش‌های مجاز به پایان رسید',
    );
    await expect(otp.verifyCode(phone, code)).rejects.toThrow(
      'کد ورود نادرست یا منقضی شده است',
    );
  });

  it('حساب غیرفعال کد نمی‌گیرد', async () => {
    await clearRateLimit(phone);
    await prisma.adminUser.update({
      where: { id: accountId },
      data: { isActive: false },
    });
    const before = sent.length;
    await otp.requestCode(phone);
    expect(sent).toHaveLength(before);
    await prisma.adminUser.update({
      where: { id: accountId },
      data: { isActive: true },
    });
  });

  it('درگاه ورود با نوع حساب می‌خواند', async () => {
    await expect(
      auth.login({
        username: `agent-${suffix}`,
        password: 'agent-password-1234',
        portal: 'admin',
      }),
    ).rejects.toThrow('حساب نمایندگی از نشانی');
    await expect(
      auth.login({
        username: `staff-${suffix}`,
        password: 'staff-password-1234',
        portal: 'agent',
      }),
    ).rejects.toThrow('مخصوص نمایندگان فروش');

    const agentLogin = await auth.login({
      username: `agent-${suffix}`,
      password: 'agent-password-1234',
      portal: 'agent',
    });
    expect(agentLogin.admin.id).toBe(accountId);
    const staffLogin = await auth.login({
      username: `staff-${suffix}`,
      password: 'staff-password-1234',
      portal: 'admin',
    });
    expect(staffLogin.accessToken).toBeTruthy();
  });
});
