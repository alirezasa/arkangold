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
      secretOrKey: configService.get<string>('JWT_ADMIN_SECRET'),
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
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('حساب ادمین غیرفعال است');
    }

    return {
      adminUserId: admin.id,
      username: admin.username,
      sessionId: payload.sessionId,
      roleKey: admin.role.key,
      permissions: admin.role.permissions.map((rp) => rp.permission.key),
    };
  }
}
