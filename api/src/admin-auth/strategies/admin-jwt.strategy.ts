// api/src/admin-auth/strategies/admin-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionContextService } from '../../common/auth-security/session-context.service';
import {
  AdminJwtPayload,
  AdminAuthenticatedUser,
} from '../interfaces/admin-jwt-payload.interface';
import {
  ADMIN_ROLES_WITH_PERMISSIONS_INCLUDE,
  mergePermissions,
  roleKeysOf,
} from '../admin-roles.util';
import {
  JWT_ALGORITHM,
  jwtVerificationSecret,
} from '../../common/secrets/jwt-keyring';

// نام استراتژی جدا از JwtStrategy کاربران - جلوگیری از تداخل passport
export const ADMIN_JWT_STRATEGY_NAME = 'admin-jwt';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(
  Strategy,
  ADMIN_JWT_STRATEGY_NAME,
) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private sessionContext: SessionContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true,
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      // کلید بر اساس kid توکن (کلید فعلی یا کلید قبلی در دوره‌ی چرخش)
      secretOrKeyProvider: (
        _req: unknown,
        rawJwt: string,
        done: (err: unknown, secret?: string) => void,
      ) => {
        const secret = jwtVerificationSecret('JWT_ADMIN_SECRET', rawJwt);
        if (secret) done(null, secret);
        else done(new UnauthorizedException('نشست ادمین نامعتبر است'));
      },
    });
  }

  async validate(
    req: Request,
    payload: AdminJwtPayload,
  ): Promise<AdminAuthenticatedUser> {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.adminSession
          .delete({ where: { id: session.id } })
          .catch(() => {});
      }
      throw new UnauthorizedException('نشست ادمین نامعتبر است');
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: ADMIN_ROLES_WITH_PERMISSIONS_INCLUDE,
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('حساب ادمین غیرفعال است');
    }

    // FDP_ACC_EXT.2.4 / FDP_ACC_EXT.3.4 — کنترل تطبیقی و چندلایه‌ی رابط مدیریتی در هر درخواست:
    // تغییر دستگاه یا شبکه در میانه‌ی نشست → خاتمه و ورود مجدد؛ IP و ساعت مجاز برای کارشناسان
    const ctx = {
      kind: 'admin' as const,
      staff: !admin.agentId,
      sessionId: session.id,
      ownerId: admin.id,
      sessionIp: session.ip,
      sessionUa: session.userAgent,
      requestIp: req.ip,
      requestUa: req.headers['user-agent'],
    };
    const decision = await this.sessionContext.evaluate(ctx);
    if (decision.action === 'terminate') {
      await this.prisma.adminSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      throw await this.sessionContext.onTerminated(ctx, decision.reason);
    }
    if (!admin.agentId) {
      await this.sessionContext.assertAdminAccessAllowed(req.ip);
    }

    return {
      adminUserId: admin.id,
      username: admin.username,
      sessionId: payload.sessionId,
      roleKeys: roleKeysOf(admin.roles),
      permissions: mergePermissions(admin.roles).map((p) => p.key),
      agentId: admin.agentId ?? null,
    };
  }
}
