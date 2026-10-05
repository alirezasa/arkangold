import { Module } from '@nestjs/common';
import { BankAccountController } from './bank-account.controller';
import { BankAccountAdminController } from './bank-account-admin.controller';
import { BankAccountService } from './bank-account.service';
import { BankInquiryService } from './bank-inquiry.service';
import { BankAccountInquiryService } from './bank-account-inquiry.service';
import { KycInquiryModule } from '../integrations/services/kyc-inquiry.module';

@Module({
  imports: [KycInquiryModule],
  controllers: [BankAccountController, BankAccountAdminController],
  providers: [
    BankAccountService,
    BankInquiryService,
    BankAccountInquiryService,
  ],
  exports: [BankAccountService, BankInquiryService],
})
export class BankModule {}
