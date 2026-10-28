// api/src/livechat/optional-user.guard.ts
// کاربر واردشده (در صورت وجود توکن معتبر) شناسایی می‌شود؛ نبود یا نامعتبر بودن توکن مانع نیست
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalUserGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    if (!req.headers.authorization) return true;
    try {
      await super.canActivate(context);
    } catch {
      // مهمان
    }
    return true;
  }

  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user || null;
  }
}
