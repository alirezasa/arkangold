// api/src/admin-auth/admin-auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // ۱۵ دقیقه

interface LoginDto {
  username: string;
  password: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
      include: { role: true },
    });

    // پیام یکسان برای عدم افشای وجود/عدم وجود نام کاربری
    const invalidCredsMsg = 'نام کاربری یا رمز عبور نادرست است';

    if (!admin) {
      throw new UnauthorizedException(invalidCredsMsg);
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (admin.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `حساب شما به دلیل تلاش‌های ناموفق مکرر موقتاً قفل شده است. ${minutesLeft} دقیقه دیگر تلاش کنید`,
      );
    }

    if (!admin.isActive) {
      throw new ForbiddenException('حساب ادمین غیرفعال است');
    }

    const validPassword = await bcrypt.compare(
      dto.password,
      admin.passwordHash,
    );
    if (!validPassword) {
      await this.handleFailedLogin(admin.id, admin.failedLoginCount);
      throw new UnauthorizedException(invalidCredsMsg);
    }

    // ── ورود موفق: ریست شمارنده تلاش ناموفق ──
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    // TODO(2FA): وقتی totpEnabled فعال شد، اینجا باید به‌جای صدور مستقیم session
    // یک tempToken کوتاه‌مدت صادر شود و کاربر به verify-2fa هدایت شود.
    // فعلاً چون admin.totpEnabled همیشه false است، مستقیم session کامل صادر می‌شود.

    const tokens = await this.createSession(admin.id, ip, userAgent);

    this.logger.log(`[AdminAuth] ورود موفق: ${admin.username} از IP ${ip}`);

    return {
      ...tokens,
      admin: {
        id: admin.id,
        username: admin.username,
        fullName: admin.fullName,
        role: { key: admin.role.key, name: admin.role.name },
      },
    };
  }

  private async handleFailedLogin(adminId: string, currentCount: number) {
    const newCount = currentCount + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: {
        failedLoginCount: newCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MS)
          : undefined,
      },
    });

    if (shouldLock) {
      this.logger.warn(
        `[AdminAuth] حساب ${adminId} به دلیل تلاش‌های ناموفق مکرر قفل شد`,
      );
    }
  }

  async refreshToken(refreshToken: string) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.adminSession.findFirst({
      where: { refreshTokenHash: hash, expiresAt: { gt: new Date() } },
      include: { adminUser: true },
    });
    if (!session)
      throw new UnauthorizedException('رفرش توکن نامعتبر یا منقضی شده است');
    if (!session.adminUser.isActive)
      throw new ForbiddenException('حساب ادمین غیرفعال است');

    await this.prisma.adminSession.delete({ where: { id: session.id } });
    return this.createSession(
      session.adminUserId,
      session.ip ?? undefined,
      session.userAgent ?? undefined,
    );
  }

  async logout(sessionId: string) {
    await this.prisma.adminSession
      .delete({ where: { id: sessionId } })
      .catch(() => {});
    return { message: 'با موفقیت خارج شدید' };
  }

  async logoutAll(adminUserId: string) {
    await this.prisma.adminSession.deleteMany({ where: { adminUserId } });
    return { message: 'از تمام دستگاه‌ها خارج شدید' };
  }

  async getMe(adminUserId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!admin) throw new NotFoundException('ادمین یافت نشد');

    return {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      totpEnabled: admin.totpEnabled,
      lastLoginAt: admin.lastLoginAt,
      role: { key: admin.role.key, name: admin.role.name },
      permissions: admin.role.permissions.map((rp) => rp.permission.key),
    };
  }

  private async createSession(
    adminUserId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const sessionId = uuidv4();

    const accessToken = this.jwtService.sign(
      { sub: adminUserId, sessionId },
      {
        secret: this.configService.get<string>('JWT_ADMIN_SECRET'),
        expiresIn: 1800, // ۳۰ دقیقه - کوتاه‌تر از کاربر عادی چون دسترسی حساس‌تری دارد
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: adminUserId, sessionId },
      {
        secret: this.configService.get<string>('JWT_ADMIN_REFRESH_SECRET'),
        expiresIn: 24 * 60 * 60, // ۱ روز - کوتاه‌تر از کاربر عادی
      },
    );

    const refreshHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.adminSession.create({
      data: {
        id: sessionId,
        adminUserId,
        ip,
        userAgent,
        refreshTokenHash: refreshHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn: 1800 };
  }
}
