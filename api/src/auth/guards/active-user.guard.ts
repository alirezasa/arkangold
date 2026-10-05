import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_MOBILE_MISMATCH_KEY } from '../decorators/allow-mobile-mismatch.decorator';

/** کد خطای قابل تشخیص در اپ برای هدایت کاربر به صفحه‌ی تأیید شماره موبایل */
export const MOBILE_MISMATCH_ERROR_CODE = 'MOBILE_NOT_OWNED';

interface RequestUser {
  userId: string;
  phone: string;
  sessionId: string;
  status?: string;
  type?: string;
  mobileVerificationStatus?: string;
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

    // شماره موبایل طبق شاهکار به نام کاربر نیست → تا ثبت شماره‌ی به نام خودش، دسترسی بسته است
    if (user.mobileVerificationStatus === 'MISMATCH') {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_MOBILE_MISMATCH_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: MOBILE_MISMATCH_ERROR_CODE,
          message:
            'شماره موبایل شما طبق سامانه شاهکار به نام کد ملی‌تان ثبت نشده است. برای استفاده از خدمات، ابتدا شماره موبایلی که به نام خودتان است را در بخش «تأیید شماره موبایل» ثبت کنید',
        });
      }
    }

    return true;
  }
}
