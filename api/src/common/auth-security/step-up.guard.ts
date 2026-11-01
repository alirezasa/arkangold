// api/src/common/auth-security/step-up.guard.ts
// FTA_TSE_EXT.4.2 — دکوریتور و گاردهای تأیید ثانویه برای endpointهای حساس.
// ترتیب: پس از گارد احراز هویت (JwtAuthGuard / AdminJwtAuthGuard) در سطح متد استفاده شود.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  STEP_UP_CODE_HEADER,
  STEP_UP_PURPOSES,
  STEP_UP_TOKEN_HEADER,
  StepUpPurpose,
  StepUpService,
} from './step-up.service';
import { AuditService } from '../audit/audit.service';

const STEP_UP_KEY = 'stepUpPurpose';
const ADMIN_STEP_UP_KEY = 'adminStepUpAction';

interface UserReq extends Request {
  user?: { userId: string; sessionId: string };
}
interface AdminReq extends Request {
  user?: { adminUserId: string; sessionId: string };
}

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private stepUp: StepUpService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const purpose = this.reflector.get<StepUpPurpose>(
      STEP_UP_KEY,
      ctx.getHandler(),
    );
    if (!purpose) return true;
    const req = ctx.switchToHttp().getRequest<UserReq>();
    const token = req.header(STEP_UP_TOKEN_HEADER) ?? undefined;
    if (
      req.user &&
      (await this.stepUp.consume(
        req.user.userId,
        req.user.sessionId,
        purpose,
        token,
      ))
    ) {
      return true;
    }
    throw new ForbiddenException({
      message: token
        ? `تأیید ثانویه نامعتبر یا منقضی است؛ برای «${STEP_UP_PURPOSES[purpose]}» دوباره تأیید کنید`
        : `برای «${STEP_UP_PURPOSES[purpose]}» تأیید ثانویه لازم است`,
      code: token ? 'STEP_UP_INVALID' : 'STEP_UP_REQUIRED',
      purpose,
    });
  }
}

@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private stepUp: StepUpService,
    private audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<string>(
      ADMIN_STEP_UP_KEY,
      ctx.getHandler(),
    );
    if (!action) return true;
    const req = ctx.switchToHttp().getRequest<AdminReq>();
    const code = req.header(STEP_UP_CODE_HEADER) ?? undefined;
    if (
      req.user &&
      !(await this.stepUp.adminMfaEnabled(req.user.adminUserId))
    ) {
      throw new ForbiddenException({
        message: `برای «${action}» ابتدا ورود دومرحله‌ای (برنامه‌ی احراز هویت) را از پروفایل فعال کنید`,
        code: 'STEP_UP_MFA_NOT_ENABLED',
        action,
      });
    }
    if (
      req.user &&
      (await this.stepUp.verifyAdminCode(req.user.adminUserId, code))
    ) {
      return true;
    }
    if (code) {
      await this.audit.logAdmin({
        adminUserId: req.user?.adminUserId ?? null,
        action: 'admin_auth.step_up',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        source: AdminStepUpGuard.name,
        success: false,
        newValue: { action },
      });
    }
    throw new ForbiddenException({
      message: code
        ? 'کد برنامه‌ی احراز هویت نادرست یا تکراری است'
        : `برای «${action}» کد برنامه‌ی احراز هویت لازم است`,
      code: code ? 'STEP_UP_INVALID' : 'STEP_UP_REQUIRED',
      action,
    });
  }
}

/** endpoint کاربر: توکن تأیید ثانویه‌ی همین عملیات لازم است */
export const RequireStepUp = (purpose: StepUpPurpose) =>
  applyDecorators(SetMetadata(STEP_UP_KEY, purpose), UseGuards(StepUpGuard));

/** endpoint پنل: کد برنامه‌ی احراز هویت در همین درخواست لازم است */
export const RequireAdminStepUp = (action: string) =>
  applyDecorators(
    SetMetadata(ADMIN_STEP_UP_KEY, action),
    UseGuards(AdminStepUpGuard),
  );
