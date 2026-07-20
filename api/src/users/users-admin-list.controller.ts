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
import { IsOptional, IsString, IsIn } from 'class-validator';
import { UsersAdminService } from './users-admin.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';

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
  constructor(private readonly service: UsersAdminService) {}

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
