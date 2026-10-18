import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SessionContextService } from '../../common/auth-security/session-context.service';
import type { SystemConfigService } from '../../system-config/system-config.service';

process.env.JWT_ADMIN_SECRET ??= 'unit-secret-unit-secret-unit-secret';

/** قفل نشست ادمین پس از عدم فعالیت (session.admin.timeout_minutes = ۶۰) */
describe('AdminJwtStrategy — قفل عدم فعالیت', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const build = (lastActivityAt: Date) => {
    const prisma = {
      adminSession: {
        findUnique: () =>
          Promise.resolve({
            id: 's1',
            expiresAt: new Date(Date.now() + 86_400_000),
            lastActivityAt,
            ip: null,
            userAgent: null,
          }),
        delete: () => Promise.resolve(),
      },
      adminUser: {
        findUnique: () =>
          Promise.resolve({
            id: 'a1',
            username: 'admin',
            isActive: true,
            agentId: null,
            roles: [],
          }),
      },
    } as unknown as PrismaService;
    const sessionContext = {
      evaluate: () => Promise.resolve({ action: 'allow' }),
      assertAdminAccessAllowed: () => Promise.resolve(),
    } as unknown as SessionContextService;
    const systemConfig = {
      getSessionPolicy: () =>
        Promise.resolve({ accessTtlSeconds: 3600, refreshTtlSeconds: 86_400 }),
    } as unknown as SystemConfigService;
    return new AdminJwtStrategy(
      new ConfigService(),
      prisma,
      sessionContext,
      systemConfig,
    );
  };
  const req = (path: string) => ({ path, headers: {} }) as unknown as Request;
  const payload = { sub: 'a1', username: 'admin', sessionId: 's1' };

  it('فعالیت کمتر از ۶۰ دقیقه پیش → درخواست پذیرفته می‌شود', async () => {
    const user = await build(minutesAgo(59)).validate(
      req('/admin/users'),
      payload,
    );
    expect(user.adminUserId).toBe('a1');
  });

  it('بیش از ۶۰ دقیقه بدون فعالیت → SESSION_LOCKED', async () => {
    await expect(
      build(minutesAgo(61)).validate(req('/admin/users'), payload),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_LOCKED' }),
    });
    await expect(
      build(minutesAgo(61)).validate(req('/admin-auth/session/ping'), payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('بازگشایی و خروج در حالت قفل هم پذیرفته می‌شوند', async () => {
    const s = build(minutesAgo(120));
    await expect(
      s.validate(req('/admin-auth/session/unlock'), payload),
    ).resolves.toMatchObject({ adminUserId: 'a1' });
    await expect(
      s.validate(req('/admin-auth/logout'), payload),
    ).resolves.toMatchObject({ adminUserId: 'a1' });
  });
});
