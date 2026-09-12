// api/src/invoice/invoice.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceAdminController } from './invoice-admin.controller';
import { InvoicePublicController } from './invoice-public.controller';

@Module({
  imports: [PrismaModule, SystemConfigModule],
  controllers: [
    InvoiceController,
    InvoiceAdminController,
    InvoicePublicController,
  ],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
