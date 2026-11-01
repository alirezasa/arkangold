// api/src/common/auth-security/login-history.service.ts
//
// FTA_TAH_EXT.1.1 — نمایش آخرین تلاش موفق برای ایجاد نشست (پیش از نشست فعلی): تاریخ و زمان، دستگاه
// و IP پوشانده، به‌همراه تعداد تلاش‌های ناموفق پس از آن — تا صاحب حساب ورود ناشناخته را تشخیص دهد.
// منبع: رویدادهای ورود موفق در گزارش ممیزی (زنجیره‌ی هش‌شده و غیرقابل تغییر).
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { describeDevice, maskIp } from './login-alert.service';

// ثبت‌نام هم نشست می‌سازد و نخستین ورود موفق حساب است
const USER_SUCCESS = ['auth.login', 'auth.login_mfa', 'auth.register'];
const USER_FAILURE = [
  'auth.login',
  'auth.login_mfa',
  'auth.login_first_factor',
];
const ADMIN_SUCCESS = [
  'admin_auth.login',
  'admin_auth.login_otp',
  'admin_auth.login_mfa',
];
const ADMIN_FAILURE = [
  'admin_auth.login',
  'admin_auth.login_otp',
  'admin_auth.login_mfa',
  'admin_auth.login_first_factor',
];

export interface LoginHistory {
  currentLoginAt: Date | null;
  previous: { at: Date; ip: string; device: string } | null;
  failedAttemptsSince: number;
}

@Injectable()
export class LoginHistoryService {
  constructor(private prisma: PrismaService) {}

  async forUser(userId: string, sessionId: string): Promise<LoginHistory> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const cutoff = new Date(
      (session?.createdAt ?? new Date()).getTime() - 5_000,
    );
    const prev = await this.prisma.auditLog.findFirst({
      where: {
        userId,
        action: { in: USER_SUCCESS },
        success: true,
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, ip: true, userAgent: true },
    });
    const failed = await this.prisma.auditLog.count({
      where: {
        userId,
        action: { in: USER_FAILURE },
        success: false,
        createdAt: { gt: prev?.createdAt ?? new Date(0), lt: cutoff },
      },
    });
    return {
      currentLoginAt: session?.createdAt ?? null,
      previous: prev
        ? {
            at: prev.createdAt,
            ip: maskIp(prev.ip),
            device: describeDevice(prev.userAgent),
          }
        : null,
      failedAttemptsSince: failed,
    };
  }

  async forAdmin(
    adminUserId: string,
    sessionId: string,
  ): Promise<LoginHistory> {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const cutoff = new Date(
      (session?.createdAt ?? new Date()).getTime() - 5_000,
    );
    const prev = await this.prisma.adminAuditLog.findFirst({
      where: {
        adminUserId,
        action: { in: ADMIN_SUCCESS },
        success: true,
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, ip: true, userAgent: true },
    });
    const failed = await this.prisma.adminAuditLog.count({
      where: {
        adminUserId,
        action: { in: ADMIN_FAILURE },
        success: false,
        createdAt: { gt: prev?.createdAt ?? new Date(0), lt: cutoff },
      },
    });
    return {
      currentLoginAt: session?.createdAt ?? null,
      previous: prev
        ? {
            at: prev.createdAt,
            ip: maskIp(prev.ip),
            device: describeDevice(prev.userAgent),
          }
        : null,
      failedAttemptsSince: failed,
    };
  }
}
