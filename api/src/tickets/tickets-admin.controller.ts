// api/src/tickets/tickets-admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AssignTicketDto,
  ChangeTicketStatusDto,
  ChangeTicketPriorityDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  TicketStatus,
} from '@arkan-gold/shared';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { TicketsAdminService } from './tickets-admin.service';

interface AdminAuthenticatedRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/tickets')
export class TicketsAdminController {
  constructor(private readonly adminService: TicketsAdminService) {}

  /** فقط ادمین‌هایی که tickets.view_all دارند همه تیکت‌ها را می‌بینند، بقیه فقط تیکت‌های خودشان */
  private actorOf(req: AdminAuthenticatedRequest) {
    return {
      adminId: req.user.adminUserId,
      canViewAll: req.user.permissions.includes('tickets.view_all'),
    };
  }

  @RequirePermission('tickets.view')
  @Get()
  list(
    @Req() req: AdminAuthenticatedRequest,
    @Query() query: ListTicketsQueryDto,
  ) {
    return this.adminService.listAll(this.actorOf(req), query);
  }

  @RequirePermission('tickets.view')
  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboardSummary();
  }

  @RequirePermission('tickets.view')
  @Get(':id')
  getOne(@Req() req: AdminAuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.getOne(this.actorOf(req), id);
  }

  @RequirePermission('tickets.view')
  @Get(':id/attachments/:attachmentId/download-url')
  getAttachmentDownloadUrl(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.adminService.getAttachmentDownloadUrl(
      this.actorOf(req),
      id,
      attachmentId,
    );
  }

  @RequirePermission('tickets.assign')
  @AuditLog('tickets.assign')
  @Post(':id/assign')
  assign(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.adminService.assign(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.update')
  @AuditLog('tickets.change_status')
  @Post(':id/status')
  changeStatus(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangeTicketStatusDto,
  ) {
    return this.adminService.changeStatus(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.update')
  @AuditLog('tickets.change_priority')
  @Patch(':id/priority')
  changePriority(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangeTicketPriorityDto,
  ) {
    return this.adminService.changePriority(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.update')
  @AuditLog('tickets.add_message')
  @Post(':id/messages')
  addMessage(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    return this.adminService.addMessage(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.close')
  @AuditLog('tickets.close')
  @Post(':id/close')
  close(@Req() req: AdminAuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.changeStatus(this.actorOf(req), id, {
      status: TicketStatus.CLOSED,
    });
  }

  @RequirePermission('tickets.reopen')
  @AuditLog('tickets.reopen')
  @Post(':id/reopen')
  reopen(@Req() req: AdminAuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.changeStatus(this.actorOf(req), id, {
      status: TicketStatus.REOPENED,
    });
  }
}
