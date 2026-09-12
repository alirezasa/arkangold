// api/src/invoice/invoice-admin.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { InvoiceService } from './invoice.service';

class CancelInvoiceDto {
  @IsString()
  @MinLength(10, { message: 'دلیل ابطال باید حداقل ۱۰ کاراکتر باشد' })
  reason!: string;
}

@ApiTags('Admin/Invoices')
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/invoices')
export class InvoiceAdminController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get(':id')
  @RequirePermission('invoice.view')
  @ApiOperation({ summary: 'مشاهده سند توسط ادمین' })
  getOne(@Param('id') id: string) {
    return this.invoiceService.getDocument(id, null, true);
  }

  @Post(':id/cancel')
  @RequirePermission('invoice.manage')
  @AuditLog('invoice.cancel')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'ابطال سند' })
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.invoiceService.cancel(id, dto.reason);
  }
}
