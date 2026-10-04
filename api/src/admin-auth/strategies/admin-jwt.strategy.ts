// api/src/admin-auth/strategies/admin-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminJwtPayload,
  AdminAuthenticatedUser,
} from '../interfaces/admin-jwt-payload.interface';
import {
  ADMIN_ROLES_WITH_PERMISSIONS_INCLUDE,
  mergePermissions,
  roleKeysOf,
} from '../admin-roles.util';
import { JWT_ALGORITHM, jwtVerificationSecret } from '../../common/secrets/jwt-keyring';

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
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      // کلید بر اساس kid توکن (کلید فعلی یا کلید قبلی در دوره‌ی چرخش)
      secretOrKeyProvider: (_req: unknown, rawJwt: string, done: (err: unknown, secret?: string) => void) => {
        const secret = jwtVerificationSecret('JWT_ADMIN_SECRET', rawJwt);
        if (secret) done(null, secret);
        else done(new UnauthorizedException('نشست ادمین نامعتبر است'));
      },
    });
  }

  async validate(payload: AdminJwtPayload): Promise<AdminAuthenticatedUser> {
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
