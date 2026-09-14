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
} from '@nestjs/common';
import {
  CreateTicketCategoryDto,
  UpdateTicketCategoryDto,
} from '@arkan-gold/shared';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { TicketsAdminService } from './tickets-admin.service';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('tickets.manage_categories')
@Controller('admin/ticket-categories')
export class TicketCategoriesAdminController {
  constructor(private readonly adminService: TicketsAdminService) {}

  @Get()
  list() {
    return this.adminService.listCategories();
  }

  @Post()
  create(@Body() dto: CreateTicketCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }
}
