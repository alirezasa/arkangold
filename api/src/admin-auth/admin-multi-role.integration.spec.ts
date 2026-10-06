// api/src/admin-auth/admin-multi-role.integration.spec.ts
//
// آزمون یکپارچه‌ی چندنقشی بودن ادمین‌ها روی PostgreSQL واقعی (پس از prisma migrate deploy):
//   ایجاد ادمین با چند نقش ← اجتماع دسترسی‌ها در JWT ← ویرایش نقش‌ها ← محدودیت‌های ارتقای سطح دسترسی
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest admin-multi-role
// بدون این متغیر آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacSyncService } from './rbac-sync.service';
import type { SmsTemplateService } from '../notifications/sms-template.service';
import type { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import type { MfaService } from '../common/mfa/mfa.service';
import { AdminManagementService, AdminActor } from './admin-management.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { ADMIN_ROLES } from './rbac.const';
import type { SessionContextService } from '../common/auth-security/session-context.service';
import type { Request } from 'express';

const url = process.env.INTEGRATION_DATABASE_URL;
const run = url ? describe : describe.skip;

const rolePermissions = (key: string): string[] => {
  const role = ADMIN_ROLES.find((r) => r.key === key);
  if (!role || role.permissions === 'ALL') return [];
  return [...role.permissions];
};

run('ادمین چندنقشی (یکپارچه با PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: AdminManagementService;
  let strategy: AdminJwtStrategy;
  const suffix = randomUUID().slice(0, 8);
  const superActor: AdminActor = {
    adminUserId: randomUUID(),
    roleKeys: ['SUPER_ADMIN'],
    permissions: [],
  };

  const permissionsOf = async (adminUserId: string) => {
    const session = await prisma.adminSession.create({
      data: {
        adminUserId,
        refreshTokenHash: 'x',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const user = await strategy.validate({ headers: {} } as Request, {
      sub: adminUserId,
      username: 'x',
      sessionId: session.id,
    });
    return user;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    await new RbacSyncService(prisma).onModuleInit();
    // رمز موقت به‌جای مدیر، با پیامک به صاحب حساب می‌رسد (FIA_UID_EXT.1.6)؛ در این آزمون فقط ثبت می‌شود
    const sms = {
      send: () => Promise.resolve({ status: 'SENT' }),
    } as unknown as SmsTemplateService;
    const throttle = {
      clear: () => Promise.resolve(),
    } as unknown as LoginThrottleService;
    const mfa = { disable: () => Promise.resolve() } as unknown as MfaService;
    service = new AdminManagementService(prisma, sms, throttle, mfa);
    process.env.JWT_ADMIN_SECRET ??= 'integration-secret-integration-secret';
    // کنترل تطبیقی نشست موضوع این آزمون نیست (آزمون جداگانه دارد)
    const sessionContext = {
      evaluate: () => Promise.resolve({ action: 'allow' }),
      assertAdminAccessAllowed: () => Promise.resolve(),
    } as unknown as SessionContextService;
    strategy = new AdminJwtStrategy(new ConfigService(), prisma, sessionContext);
    await prisma.adminUser.create({
      data: {
        id: superActor.adminUserId,
        username: `super-${suffix}`,
        passwordHash: 'x',
        fullName: 'مدیر ارشد آزمون',
        roles: { create: { role: { connect: { key: 'SUPER_ADMIN' } } } },
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('ادمین با سه نقش، اجتماع دسترسی‌ها را دارد و ویرایش نقش‌ها اعمال می‌شود', async () => {
    const created = await service.create(superActor, {
      username: `multi-${suffix}`,
      phone: '09120000000',
      fullName: 'کاربر چندنقشی',
      roleKeys: ['ACCOUNTANT', 'FINANCE_ADMIN', 'SUPPORT_ADMIN'],
    });
    expect(created.roles.map((r) => r.key)).toEqual([
      'ACCOUNTANT',
      'FINANCE_ADMIN',
      'SUPPORT_ADMIN',
    ]);

    const user = await permissionsOf(created.id);
    expect(user.roleKeys.sort()).toEqual(
      ['ACCOUNTANT', 'FINANCE_ADMIN', 'SUPPORT_ADMIN'].sort(),
    );
    const expected = new Set([
      ...rolePermissions('ACCOUNTANT'),
      ...rolePermissions('FINANCE_ADMIN'),
      ...rolePermissions('SUPPORT_ADMIN'),
    ]);
    expect(new Set(user.permissions)).toEqual(expected);
    expect(user.permissions).toContain('tickets.update'); // از پشتیبانی
    expect(user.permissions).toContain('withdrawal.pay'); // از مدیر مالی

    const updated = await service.update(superActor, created.id, {
      roleKeys: ['SUPPORT_ADMIN'],
    });
    expect(updated.roles.map((r) => r.key)).toEqual(['SUPPORT_ADMIN']);
    // تغییر نقش نشست‌ها را می‌بندد
    expect(
      await prisma.adminSession.count({ where: { adminUserId: created.id } }),
    ).toBe(0);
    const after = await permissionsOf(created.id);
    expect(after.permissions).not.toContain('withdrawal.pay');
  });

  it('ادمین غیر مدیر ارشد نمی‌تواند با ترکیب نقش‌ها دسترسی بیشتری از خودش بدهد', async () => {
    const accountant: AdminActor = {
      // سازنده باید در جدول ادمین‌ها وجود داشته باشد؛ فقط نقش‌ها/دسترسی‌ها مهم‌اند
      adminUserId: superActor.adminUserId,
      roleKeys: ['ACCOUNTANT', 'SUPPORT_MANAGER'],
      permissions: [
        ...rolePermissions('ACCOUNTANT'),
        ...rolePermissions('SUPPORT_MANAGER'),
      ],
    };
    // هر دو نقش زیرمجموعه‌ی دسترسی‌های اوست
    await expect(
      service.create(accountant, {
        username: `ok-${suffix}`,
        phone: '09120000000',
        fullName: 'مجاز',
        roleKeys: ['ACCOUNTANT', 'SUPPORT_ADMIN'],
      }),
    ).resolves.toBeDefined();
    // مدیر مالی دسترسی‌هایی دارد که او ندارد
    await expect(
      service.create(accountant, {
        username: `bad-${suffix}`,
        phone: '09120000000',
        fullName: 'غیرمجاز',
        roleKeys: ['ACCOUNTANT', 'FINANCE_ADMIN'],
      }),
    ).rejects.toThrow('امکان اعطای دسترسی‌هایی که خودتان ندارید وجود ندارد');
    await expect(
      service.create(superActor, {
        username: `agent-${suffix}`,
        phone: '09120000000',
        fullName: 'نماینده',
        roleKeys: ['ACCOUNTANT', 'AGENT'],
      }),
    ).rejects.toThrow('نماینده فروش');
  });

  it('roleKey قدیمی (تک‌نقشی) همچنان پذیرفته می‌شود', async () => {
    const created = await service.create(superActor, {
      username: `legacy-${suffix}`,
      phone: '09120000000',
      fullName: 'قدیمی',
      roleKey: 'SHOP_ADMIN',
    });
    expect(created.role?.key).toBe('SHOP_ADMIN');
    expect(created.roles).toHaveLength(1);
  });
});
