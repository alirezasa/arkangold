// api/src/invoice/invoice.controller.ts

import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { InvoiceService } from './invoice.service';
import { OwnedResource } from '../common/audit/owned-resource.decorator';

interface AuthedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست فاکتورها و پیش‌فاکتورهای کاربر' })
  list(
    @Req() req: AuthedRequest,
    @Query('kind') kind?: 'INVOICE' | 'PROFORMA',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoiceService.listForUser(req.user.userId, {
      kind,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @OwnedResource({ model: 'invoice', ownerPath: 'userId' })
  @Get(':id')
  @ApiOperation({ summary: 'داده کامل سند برای نمایش و چاپ' })
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.invoiceService.getDocument(id, req.user.userId, false);
  }
}
