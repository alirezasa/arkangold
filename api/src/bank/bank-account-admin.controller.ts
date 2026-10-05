import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { BankAccountService } from './bank-account.service';

class ListBankAccountsQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
}

class ApproveBankAccountDto {
  @IsOptional() @IsString() @MaxLength(34) sheba?: string;
  @IsOptional() @IsString() @MaxLength(30) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) bankName?: string;
  @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
}

class RejectBankAccountDto {
  @IsString()
  @Length(3, 300, { message: 'دلیل رد باید بین ۳ تا ۳۰۰ کاراکتر باشد' })
  reason!: string;
}

/** صف کارت‌های بانکی کاربران: استعلام مجدد (وقتی وب‌سرویس قطع بوده)، تأیید/رد دستی */
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/bank-accounts')
export class BankAccountAdminController {
  constructor(private readonly service: BankAccountService) {}

  @RequirePermission('bank_account.view')
  @Get()
  list(@Query() query: ListBankAccountsQueryDto) {
    return this.service.adminList({
      status: query.status,
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @RequirePermission('bank_account.manage')
  @AuditLog('bank_account.inquire')
  @UseInterceptors(AuditLogInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':id/inquire')
  inquire(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminInquire(id);
  }

  @RequirePermission('bank_account.manage')
  @AuditLog('bank_account.approve')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveBankAccountDto,
  ) {
    return this.service.adminApprove(id, dto);
  }

  @RequirePermission('bank_account.manage')
  @AuditLog('bank_account.reject')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectBankAccountDto,
  ) {
    return this.service.adminReject(id, dto.reason);
  }
}
