// api/src/accounting/accounting.module.ts

import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
