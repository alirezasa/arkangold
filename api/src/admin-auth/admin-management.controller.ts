// api/src/admin-auth/admin-management.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  IsPhoneNumber,
  IsArray,
  ArrayNotEmpty,
  Matches,
} from 'class-validator';
import { AdminManagementService, AdminActor } from './admin-management.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { RequirePermission } from './decorators/require-permission.decorator';
import { AuditLog } from './decorators/audit-log.decorator';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from './interfaces/admin-jwt-payload.interface';

class CreateAdminDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  fullName!: string;

  @IsString()
  roleKey!: string;

  // مقصد پیامک اطلاع‌رسانی تیکت‌هایی که به این ادمین Assign می‌شوند
  @IsOptional()
  @IsPhoneNumber('IR')
  phone?: string;
}

class UpdateAdminDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsPhoneNumber('IR')
  phone?: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

class CreateRoleDto {
  @Matches(/^[A-Za-z][A-Za-z0-9_]{2,39}$/, {
    message:
      'کلید نقش باید با حرف انگلیسی شروع شود و فقط شامل حروف، عدد و _ باشد',
  })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'حداقل یک دسترسی برای نقش انتخاب کنید' })
  @IsString({ each: true })
  permissionKeys!: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'حداقل یک دسترسی برای نقش انتخاب کنید' })
  @IsString({ each: true })
  permissionKeys?: string[];
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

function actorOf(req: AdminRequest): AdminActor {
  return {
    adminUserId: req.user.adminUserId,
    roleKey: req.user.roleKey,
    permissions: req.user.permissions,
  };
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('admin.manage')
@Controller('admin/admins')
export class AdminManagementController {
  constructor(private readonly service: AdminManagementService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('roles')
  listRoles() {
    return this.service.listRoles();
  }

  @Get('permissions')
  listPermissions() {
    return this.service.listPermissions();
  }

  @AuditLog('admin.role_create')
  @UseInterceptors(AuditLogInterceptor)
  @Post('roles')
  createRole(@Req() req: AdminRequest, @Body() dto: CreateRoleDto) {
    return this.service.createRole(actorOf(req), dto);
  }

  @AuditLog('admin.role_update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch('roles/:roleId')
  updateRole(
    @Req() req: AdminRequest,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.service.updateRole(actorOf(req), roleId, dto);
  }

  @AuditLog('admin.role_delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete('roles/:roleId')
  deleteRole(@Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.service.deleteRole(roleId);
  }

  @AuditLog('admin.create')
  @UseInterceptors(AuditLogInterceptor)
  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateAdminDto) {
    return this.service.create(actorOf(req), dto);
  }

  @AuditLog('admin.update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id')
  update(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.service.update(actorOf(req), id, dto);
  }

  @AuditLog('admin.reset_password')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/reset-password')
  resetPassword(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetPassword(actorOf(req), id, dto.newPassword);
  }

  @AuditLog('admin.revoke_sessions')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/revoke-sessions')
  revokeSessions(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.service.revokeSessions(actorOf(req), id);
  }

  @AuditLog('admin.unlock')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/unlock')
  unlock(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.service.unlock(actorOf(req), id);
  }
}
