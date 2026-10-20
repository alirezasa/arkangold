import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CatalogModule } from '../catalog/catalog.module';
import { BuybackService } from './buyback.service';
import { BuybackUserController } from './buyback-user.controller';
import { BuybackAdminController } from './buyback-admin.controller';

/** بازخرید شمش: فروش شمش آرکان گلد توسط مالک به خود آرکان گلد */
@Module({
  imports: [AccountingModule, CatalogModule],
  controllers: [BuybackUserController, BuybackAdminController],
  providers: [BuybackService],
})
export class BuybackModule {}
