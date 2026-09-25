// api/src/agent/agent.module.ts
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityVerificationModule } from '../integrations/services/identity-verification.module';
import { AgentAdminController } from './agent-admin.controller';
import { AgentPortalController } from './agent-portal.controller';
import { AgentService } from './agent.service';
import { AgentSaleService } from './agent-sale.service';
import { AgentAccountingService } from './agent-accounting.service';
import { AgentScopeGuard } from './agent-scope.guard';

@Module({
  imports: [
    AccountingModule,
    CatalogModule, // PricingEngineService — قیمت لحظه‌ای هر گرم بر اساس عیار
    InvoiceModule,
    NotificationsModule,
    IdentityVerificationModule,
  ],
  controllers: [AgentAdminController, AgentPortalController],
  providers: [
    AgentService,
    AgentSaleService,
    AgentAccountingService,
    AgentScopeGuard,
  ],
})
export class AgentModule {}
