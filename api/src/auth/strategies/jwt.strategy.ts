import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionContextService } from '../../common/auth-security/session-context.service';
import { JwtPayload } from '@arkan-gold/shared';
import {
  JWT_ALGORITHM,
  jwtVerificationSecret,
} from '../../common/secrets/jwt-keyring';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
        const secret = jwtVerificationSecret('JWT_ACCESS_SECRET', rawJwt);
        if (secret) done(null, secret);
        else done(new UnauthorizedException('نشست نامعتبر است'));
      },
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.userSession.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('نشست نامعتبر است');
    }

    // ⬅️ تغییر مهم: فقط کاربران BANNED/INACTIVE کامل بلاک می‌شوند.
    // کاربر PENDING_ACTIVATION (مثلاً حقوقیِ در انتظار تایید) باید بتواند
    // وارد شود و مراحل احراز هویت شخصی + تکمیل پروفایل حقوقی را طی کند.
    // محدودیت دسترسی به بخش‌های حساس با ActiveUserGuard روی همان
    // کنترلرها (کیف‌پول، معاملات، حساب بانکی) اعمال می‌شود.
    if (
      session.user.status === 'BANNED' ||
      session.user.status === 'INACTIVE'
    ) {
      throw new UnauthorizedException('حساب کاربری شما مسدود شده است');
    }

    // FDP_ACC_EXT.2.4 — کنترل تطبیقی در طول نشست (تغییر دستگاه → خاتمه‌ی نشست)
    const ctx = {
      kind: 'user' as const,
      sessionId: session.id,
      ownerId: session.userId,
      sessionIp: session.ip,
      sessionUa: session.device,
      requestIp: req.ip,
      requestUa: req.headers['user-agent'],
    };
    const decision = await this.sessionContext.evaluate(ctx);
    if (decision.action === 'terminate') {
      await this.prisma.userSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      throw await this.sessionContext.onTerminated(ctx, decision.reason);
    }
    if (decision.action === 'allow_flag')
      await this.sessionContext.onFlagged(ctx);

    return {
      userId: payload.sub,
      phone: payload.phone,
      sessionId: payload.sessionId,
      status: session.user.status,
      type: session.user.type,
      mobileVerificationStatus: session.user.mobileVerificationStatus,
    };
  }
}
