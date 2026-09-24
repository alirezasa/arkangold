// api/src/announcements/announcements-admin.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './announcements.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Notifications')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/announcements')
export class AnnouncementsAdminController {
  constructor(private readonly service: AnnouncementsService) {}

  @RequirePermission('notifications.view')
  @Get()
  @ApiOperation({ summary: 'لیست اعلان‌ها' })
  list() {
    return this.service.adminList();
  }

  @RequirePermission('notifications.manage')
  @AuditLog('announcement.create')
  @UseInterceptors(AuditLogInterceptor)
  @Post()
  @ApiOperation({ summary: 'درج اعلان جدید' })
  create(@Req() req: AdminRequest, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(req.user.adminUserId, dto);
  }

  @RequirePermission('notifications.manage')
  @AuditLog('announcement.update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش / فعال‌سازی اعلان' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(id, dto);
  }

  @RequirePermission('notifications.manage')
  @AuditLog('announcement.delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete(':id')
  @ApiOperation({ summary: 'حذف اعلان' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
