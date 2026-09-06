// api/src/wallet/wallet-admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';

import { Request } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { WalletAdminService } from './wallet-admin.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';

class RejectWithdrawalDto {
  @IsString()
  reason!: string;
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
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}
type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';

function parseWithdrawalStatus(status?: string): WithdrawalStatus | undefined {
  if (!status) {
    return undefined;
  }

  switch (status) {
    case 'PENDING':
    case 'APPROVED':
    case 'REJECTED':
    case 'PROCESSED':
      return status;

    default:
      throw new BadRequestException('وضعیت درخواست برداشت نامعتبر است');
  }
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
    });
  }

  @RequirePermission('withdrawal.approve')
  @AuditLog('withdrawal.approve')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/approve')
  approve(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.walletAdminService.approve(req.user.adminUserId, id);
  }

  @RequirePermission('withdrawal.approve')
  @AuditLog('withdrawal.reject')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/reject')
  reject(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.walletAdminService.reject(req.user.adminUserId, id, dto.reason);
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
