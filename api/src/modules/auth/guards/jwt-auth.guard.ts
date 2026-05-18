import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';
import { AuthRequest } from '../../../types/request-user'; // ← مسیر یکسان

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('توکن معتبر نیست');
    }
    const token = authHeader.replace('Bearer ', '');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(token);
    } catch {
      throw new UnauthorizedException('توکن نامعتبر است');
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.userSession.findFirst({
      where: {
        tokenHash: hash,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session) {
      throw new UnauthorizedException('نشست منقضی شده است');
    }

    request.user = { id: payload.sub };
    return true;
  }
}
