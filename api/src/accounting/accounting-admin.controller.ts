import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AccountingAdminService } from './accounting-admin.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';

class ListJournalQueryDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() search?: string;
}

class LedgerQueryDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('accounting.view')
@Controller('admin/accounting')
export class AccountingAdminController {
  constructor(private readonly service: AccountingAdminService) {}

  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }

  @Get('accounts')
  listAccounts() {
    return this.service.listAccounts();
  }

  @Get('accounts/:id/ledger')
  async getLedger(@Param('id') id: string, @Query() query: LedgerQueryDto) {
    const result = await this.service.getAccountLedger(id, {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    if (!result) throw new NotFoundException('حساب یافت نشد');
    return result;
  }

  @Get('journal-entries')
  listJournalEntries(@Query() query: ListJournalQueryDto) {
    return this.service.listJournalEntries({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      from: query.from,
      to: query.to,
      search: query.search,
    });
  }

  @Get('journal-entries/:id')
  async getJournalEntry(@Param('id') id: string) {
    const result = await this.service.getJournalEntryDetail(id);
    if (!result) throw new NotFoundException('سند یافت نشد');
    return result;
  }

  @Get('trial-balance')
  getTrialBalance() {
    return this.service.getTrialBalance();
  }
}
