// api/src/users/users-admin-list.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { UsersAdminService } from './users-admin.service';
import { UsersService } from './users.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { MobileVerificationService } from '../kyc/mobile-verification.service';

class ListUsersQueryDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
}

class SetUserStatusDto {
  @IsIn(['ACTIVE', 'BANNED', 'INACTIVE'])
  status!: 'ACTIVE' | 'BANNED' | 'INACTIVE';
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/users')
export class UsersAdminListController {
  constructor(
    private readonly service: UsersAdminService,
    private readonly usersService: UsersService,
    private readonly mobileVerification: MobileVerificationService,
  ) {}

  @RequirePermission('users.view')
  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.service.list({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
      status: query.status,
      type: query.type,
    });
  }

  @RequirePermission('users.view')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  // استعلام مجدد اطلاعات هویتی کاربر از ثبت احوال (هزینه‌ی وب‌سرویس دارد → دسترسی جدا)
  @RequirePermission('users.identity.reinquire')
  @AuditLog('user.identity_reinquire')
  @UseInterceptors(AuditLogInterceptor)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':id/identity/reinquire')
  reinquireIdentity(@Param('id') id: string) {
    return this.usersService.reinquireIdentityByAdmin(id);
  }

  // استعلام مجدد شاهکار (تطبیق شماره موبایل کاربر با کد ملی) — هزینه‌ی وب‌سرویس دارد
  @RequirePermission('users.identity.reinquire')
  @AuditLog('user.mobile_reinquire')
  @UseInterceptors(AuditLogInterceptor)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':id/mobile-verification/reinquire')
  reinquireMobile(@Param('id') id: string) {
    return this.mobileVerification.reinquireByAdmin(id);
  }

  // تأیید دستی مالکیت شماره (مثلاً پس از بررسی مدارک) — کاربر از حالت مسدود خارج می‌شود
  @RequirePermission('users.mobile.approve')
  @AuditLog('user.mobile_manual_approve')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/mobile-verification/approve')
  approveMobile(@Param('id') id: string) {
    return this.mobileVerification.approveByAdmin(id);
  }

  @RequirePermission('users.view')
  @AuditLog('user.set_status')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/status')
  setStatus(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.service.setStatus(id, dto.status);
  }
}
