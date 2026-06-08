import { Module } from '@nestjs/common';
import { BankAccountController } from './bank-account.controller';
import { BankAccountService } from './bank-account.service';
import { BankInquiryService } from './bank-inquiry.service';

@Module({
  controllers: [BankAccountController],
  providers: [BankAccountService, BankInquiryService],
  exports: [BankAccountService, BankInquiryService],
})
export class BankModule {}
