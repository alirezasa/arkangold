import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../../system-config/system-config.service';
import { SessionContextService } from '../../common/auth-security/session-context.service';
import { JwtPayload } from '@arkan-gold/shared';
import {
  JWT_ALGORITHM,
  jwtVerificationSecret,
  jwtClaimOptions,
} from '../../common/secrets/jwt-keyring';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private sessionContext: SessionContextService,
    private systemConfig: SystemConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true,
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      // FTA_TSE_EXT.6.2 — فقط توکنی که برای همین API صادر شده (iss/aud) پذیرفته می‌شود
      ...jwtClaimOptions('JWT_ACCESS_SECRET'),
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

    // FTA_TSE_EXT.2.1 — انقضا پس از عدم فعالیت: نشست بدون درخواست بیش از session.user.timeout_minutes
    // باطل می‌شود (ورود مجدد لازم است)؛ در غیر این صورت زمان آخرین فعالیت به‌روز می‌شود
    const { accessTtlSeconds: idleSeconds } =
      await this.systemConfig.getSessionPolicy('user');
    const idleMs = Date.now() - session.lastActivityAt.getTime();
    if (idleMs > idleSeconds * 1000) {
      await this.prisma.userSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      throw new UnauthorizedException({
        message: 'نشست به‌دلیل عدم فعالیت منقضی شد؛ دوباره وارد شوید',
        code: 'SESSION_IDLE_TIMEOUT',
      });
    }
    if (idleMs > 30_000) {
      await this.prisma.userSession
        .updateMany({
          where: { id: session.id },
          data: { lastActivityAt: new Date() },
        })
        .catch(() => undefined);
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
