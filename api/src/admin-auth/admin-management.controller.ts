// api/src/admin-auth/admin-management.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { AdminManagementService } from './admin-management.service';
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
}

class ResetPasswordDto {
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
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

  @AuditLog('admin.create')
  @UseInterceptors(AuditLogInterceptor)
  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateAdminDto) {
    return this.service.create(req.user.adminUserId, dto);
  }

  @AuditLog('admin.update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id')
  update(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.service.update(req.user.adminUserId, id, dto);
  }

  @AuditLog('admin.reset_password')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/reset-password')
  resetPassword(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetPassword(
      req.user.adminUserId,
      id,
      dto.newPassword,
    );
  }
}
