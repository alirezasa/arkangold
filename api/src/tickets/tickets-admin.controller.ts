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
import { TicketsAdminService } from './tickets-admin.service';

interface AdminAuthenticatedRequest extends Request {
  admin: { adminId: string; permissions: string[] };
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/tickets')
export class TicketsAdminController {
  constructor(private readonly adminService: TicketsAdminService) {}

  /** فقط ادمین‌هایی که tickets.view_all دارند همه تیکت‌ها را می‌بینند، بقیه فقط تیکت‌های خودشان */
  private actorOf(req: AdminAuthenticatedRequest) {
    return {
      adminId: req.admin.adminId,
      canViewAll: req.admin.permissions.includes('tickets.view_all'),
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
  @Post(':id/assign')
  assign(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.adminService.assign(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.update')
  @Post(':id/status')
  changeStatus(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangeTicketStatusDto,
  ) {
    return this.adminService.changeStatus(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.update')
  @Patch(':id/priority')
  changePriority(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangeTicketPriorityDto,
  ) {
    return this.adminService.changePriority(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.update')
  @Post(':id/messages')
  addMessage(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    return this.adminService.addMessage(this.actorOf(req), id, dto);
  }

  @RequirePermission('tickets.close')
  @Post(':id/close')
  close(@Req() req: AdminAuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.changeStatus(this.actorOf(req), id, {
      status: TicketStatus.CLOSED,
    });
  }

  @RequirePermission('tickets.reopen')
  @Post(':id/reopen')
  reopen(@Req() req: AdminAuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.changeStatus(this.actorOf(req), id, {
      status: TicketStatus.REOPENED,
    });
  }
}
