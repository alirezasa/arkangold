// api/src/agent/agent.module.ts
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityVerificationModule } from '../integrations/services/identity-verification.module';
import { HologramModule } from '../hologram/hologram.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { AgentAdminController } from './agent-admin.controller';
import { AgentPortalController } from './agent-portal.controller';
import { AgentService } from './agent.service';
import { AgentSaleService } from './agent-sale.service';
import { AgentAccountingService } from './agent-accounting.service';
import { AgentScopeGuard } from './agent-scope.guard';
import { AgentContractService } from './agent-contract.service';
import {
  AgentContractAdminController,
  AgentContractPortalController,
} from './agent-contract.controller';
import { AgentWalletService } from './agent-wallet.service';
import { AgentOrderPaymentService } from './agent-order-payment.service';
import { AgentFundsService } from './agent-funds.service';
import { AgentPurchaseService } from './agent-purchase.service';
import { AgentBuybackService } from './agent-buyback.service';
import { AgentTradingPortalController } from './agent-trading-portal.controller';
import { AgentTradingAdminController } from './agent-trading-admin.controller';
import { AgentPaymentCallbackController } from './agent-payment-callback.controller';

@Module({
  imports: [
    AccountingModule,
    CatalogModule, // PricingEngineService — قیمت لحظه‌ای هر گرم بر اساس عیار
    InvoiceModule,
    NotificationsModule,
    IdentityVerificationModule,
    HologramModule, // استعلام اصالت/سرقت از پرتال نماینده
    PaymentGatewayModule, // واریز درگاهی به کیف پول نماینده
  ],
  controllers: [
    AgentAdminController,
    AgentTradingAdminController,
    AgentPortalController,
    AgentTradingPortalController,
    AgentContractAdminController,
    AgentContractPortalController,
    AgentPaymentCallbackController,
  ],
  providers: [
    AgentService,
    AgentSaleService,
    AgentAccountingService,
    AgentScopeGuard,
    AgentContractService,
    AgentWalletService,
    AgentOrderPaymentService,
    AgentFundsService,
    AgentPurchaseService,
    AgentBuybackService,
  ],
})
export class AgentModule {}
