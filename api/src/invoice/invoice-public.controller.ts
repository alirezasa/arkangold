// api/src/invoice/invoice-public.controller.ts
// استعلام اصالت سند از روی QR — بدون احراز هویت. بدون توکن QR فقط اصالت سند تأیید
// می‌شود؛ با توکن چاپ‌شده در QR متن کامل سند برگردانده می‌شود (ر.ک. verifyPublic).

import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';

@ApiTags('Invoices')
@Controller('verify')
export class InvoicePublicController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get(':invoiceNumber')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'استعلام عمومی اصالت سند' })
  verify(
    @Param('invoiceNumber') invoiceNumber: string,
    @Query('t') token?: string,
  ) {
    return this.invoiceService.verifyPublic(invoiceNumber, token);
  }
}
