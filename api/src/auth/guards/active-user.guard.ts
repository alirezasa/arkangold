import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface RequestUser {
  userId: string;
  phone: string;
  sessionId: string;
  status?: string;
  type?: string;
}

interface AuthenticatedRequest {
  user?: RequestUser;
}

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'حساب کاربری شما هنوز فعال نشده است. لطفاً ابتدا مراحل احراز هویت و تکمیل اطلاعات حقوقی را تکمیل کنید',
      );
    }

    return true;
  }
}
