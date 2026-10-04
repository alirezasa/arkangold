// api/src/wallet/wallet-admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';

import { Request } from 'express';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PAYOUT_METHODS, WalletAdminService } from './wallet-admin.service';
import { WithdrawalStatus } from '../generated/prisma/client';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';

class RejectWithdrawalDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

class ApproveWithdrawalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class PayWithdrawalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  bankReference!: string;

  @IsOptional()
  @IsString()
  @Matches(/^1010\d*$/, { message: 'حساب مبدأ باید زیرمجموعه‌ی 1010 باشد' })
  sourceAccountCode?: string;

  @IsOptional()
  @IsIn([...PAYOUT_METHODS])
  payoutMethod?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class PayBatchDto extends PayWithdrawalDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids!: string[];

  /** شماره پیگیری جداگانه‌ی هر درخواست (در صورت نبود، شماره پیگیری مشترک دسته) */
  @IsOptional()
  @IsObject()
  perItemReferences?: Record<string, string>;
}

class AdjustWalletDto {
  @IsOptional()
  amountRial?: number;

  @IsOptional()
  amountGrams?: number;

  @IsString()
  description!: string;
}

class ListWithdrawalsQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

const STATUSES: WithdrawalStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PROCESSED',
  'CANCELLED',
  'RETURNED',
];

function parseWithdrawalStatus(status?: string): WithdrawalStatus | undefined {
  if (!status) return undefined;
  if ((STATUSES as string[]).includes(status))
    return status as WithdrawalStatus;
  throw new BadRequestException('وضعیت درخواست برداشت نامعتبر است');
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/withdrawals')
export class WalletAdminController {
  constructor(private readonly walletAdminService: WalletAdminService) {}

  @RequirePermission('withdrawal.view')
  @Get()
  list(@Query() query: ListWithdrawalsQueryDto) {
    return this.walletAdminService.list({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: parseWithdrawalStatus(query.status),
      q: query.q,
      from: query.from,
      to: query.to,
      batchId: query.batchId,
    });
  }

  @RequirePermission('withdrawal.view')
  @Get('report')
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.walletAdminService.report(from, to);
  }

  @RequirePermission('withdrawal.view')
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.walletAdminService.getOne(id);
  }

  @RequirePermission('withdrawal.approve')
  @AuditLog('withdrawal.approve')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/approve')
  approve(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveWithdrawalDto,
  ) {
    return this.walletAdminService.approve(req.user.adminUserId, id, dto.note);
  }

  @RequirePermission('withdrawal.pay')
  @AuditLog('withdrawal.pay')
  @UseInterceptors(AuditLogInterceptor)
  @Post('pay-batch')
  payBatch(@Req() req: AdminRequest, @Body() dto: PayBatchDto) {
    return this.walletAdminService.payBatch(req.user.adminUserId, dto.ids, dto);
  }

  @RequirePermission('withdrawal.pay')
  @AuditLog('withdrawal.pay')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/pay')
  pay(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayWithdrawalDto,
  ) {
    return this.walletAdminService.pay(req.user.adminUserId, id, dto);
  }

  @RequirePermission('withdrawal.approve')
  @AuditLog('withdrawal.reject')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/reject')
  reject(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.walletAdminService.reject(req.user.adminUserId, id, dto.reason);
  }

  @RequirePermission('withdrawal.pay')
  @AuditLog('withdrawal.returned')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/returned')
  returned(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.walletAdminService.markReturned(
      req.user.adminUserId,
      id,
      dto.reason,
    );
  }
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/wallets')
export class WalletAdjustmentController {
  constructor(private readonly walletAdminService: WalletAdminService) {}

  @RequirePermission('wallet.adjust')
  @AuditLog('wallet.adjust')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/adjust')
  adjust(
    @Req() req: AdminRequest,
    @Param('id') userId: string,
    @Body() dto: AdjustWalletDto,
  ) {
    return this.walletAdminService.adjustBalance(
      req.user.adminUserId,
      userId,
      dto.amountRial ? Number(dto.amountRial) : 0,
      dto.amountGrams ? Number(dto.amountGrams) : 0,
      dto.description,
    );
  }
}
