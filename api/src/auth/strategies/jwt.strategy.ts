import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '@arkan-gold/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
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

    return {
      userId: payload.sub,
      phone: payload.phone,
      sessionId: payload.sessionId,
      status: session.user.status,
      type: session.user.type,
    };
  }
}
