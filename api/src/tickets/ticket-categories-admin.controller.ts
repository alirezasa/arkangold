// api/src/tickets/ticket-categories-admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  CreateTicketCategoryDto,
  UpdateTicketCategoryDto,
} from '@arkan-gold/shared';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { TicketsAdminService } from './tickets-admin.service';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('tickets.manage_categories')
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/ticket-categories')
export class TicketCategoriesAdminController {
  constructor(private readonly adminService: TicketsAdminService) {}

  @Get()
  list() {
    return this.adminService.listCategories();
  }

  @AuditLog('ticket_categories.create')
  @Post()
  create(@Body() dto: CreateTicketCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @AuditLog('ticket_categories.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

  @AuditLog('ticket_categories.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }
}
