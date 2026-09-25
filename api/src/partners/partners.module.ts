import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { PartnersService } from './partners.service';
import { PartnerOrdersService } from './partner-orders.service';
import { PartnersAdminController } from './partners-admin.controller';
import { PartnerApiController } from './partner-api.controller';
import { PartnerApiGuard } from './partner-api.guard';

@Module({
  imports: [
    AccountingModule,
    CatalogModule, // PricingEngineService — قیمت هر گرم شمش بر اساس عیار
    InvoiceModule,
  ],
  controllers: [PartnersAdminController, PartnerApiController],
  providers: [PartnersService, PartnerOrdersService, PartnerApiGuard],
  exports: [PartnerOrdersService],
})
export class PartnersModule {}
