// api/src/users/users-admin-list.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CreateAddressDto, UpdateAddressDto } from '@arkan-gold/shared';
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

class CreateUserDto {
  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsIn(['REAL', 'LEGAL'])
  type!: 'REAL' | 'LEGAL';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'شناسه ملی شرکت باید ۱۱ رقم باشد' })
  companyNationalId?: string;

  /** ارسال پیامک اطلاع‌رسانی ایجاد حساب به کاربر */
  @IsBoolean()
  sendSms!: boolean;
}

class UpdateUserNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;
}

class UpdateUserLimitsDto {
  @IsOptional() @IsNumber() @Min(0) dailyBuyLimitGrams?: number;
  @IsOptional() @IsNumber() @Min(0) dailySellLimitGrams?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyWithdrawLimitRial?: number;
  @IsOptional() @IsNumber() @Min(0) dailyTransferLimitGrams?: number;
  @IsOptional() @IsNumber() @Min(0) physicalDeliveryMinGrams?: number;
  @IsOptional() @IsNumber() @Min(0) physicalDeliveryMaxGrams?: number;
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

  @RequirePermission('users.create')
  @AuditLog('user.create')
  @UseInterceptors(AuditLogInterceptor)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.createUser(dto);
  }

  @RequirePermission('users.view')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  // FDP_ACC_EXT.1.5 — نمایش کامل کد ملی/تاریخ تولد فقط با درخواست صریح کارشناس؛ ثبت در ممیزی
  @RequirePermission('users.view')
  @AuditLog('user.identity_revealed')
  @UseInterceptors(AuditLogInterceptor)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/identity/reveal')
  revealIdentity(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.revealIdentity(id);
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

  // ── نام نمایشی (فقط پیش از تأیید هویت) ──
  @RequirePermission('users.manage')
  @AuditLog('user.update_name')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id/name')
  updateName(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserNameDto,
  ) {
    return this.service.updateName(id, dto.firstName, dto.lastName);
  }

  // ── سقف‌های معاملاتی کاربر ──
  @RequirePermission('users.manage')
  @AuditLog('user.update_limits')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id/limits')
  updateLimits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserLimitsDto,
  ) {
    return this.service.updateLimits(id, dto);
  }

  // ── آدرس‌های کاربر ──
  @RequirePermission('users.view')
  @Get(':id/addresses')
  listAddresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listAddresses(id);
  }

  @RequirePermission('users.manage')
  @AuditLog('user.address_create')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/addresses')
  createAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.service.createAddress(id, dto);
  }

  @RequirePermission('users.manage')
  @AuditLog('user.address_update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id/addresses/:addressId')
  updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.service.updateAddress(id, addressId, dto);
  }

  @RequirePermission('users.manage')
  @AuditLog('user.address_default')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/addresses/:addressId/default')
  setDefaultAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.service.setDefaultAddress(id, addressId);
  }

  @RequirePermission('users.manage')
  @AuditLog('user.address_delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete(':id/addresses/:addressId')
  removeAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.service.removeAddress(id, addressId);
  }
}
