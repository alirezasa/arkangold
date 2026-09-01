import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingAdminService } from './accounting-admin.service';
import { AccountingAdminController } from './accounting-admin.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingAdminController],
  providers: [AccountingService, AccountingAdminService],
  exports: [AccountingService],
})
export class AccountingModule {}
