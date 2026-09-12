// api/src/deposit/deposit-admin.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { DepositAdminService } from './deposit-admin.service';
import type { DepositStatusValue } from './deposit.state';

interface AdminRequest {
  user: { adminUserId: string; username: string };
}

class ApproveDepositDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class RejectDepositDto {
  @IsString()
  @MinLength(10, { message: 'دلیل رد باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(500)
  reason!: string;
}

class RequestNewReceiptDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  note!: string;
}

@ApiTags('Admin/Deposits')
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/deposits')
export class DepositAdminController {
  constructor(private readonly service: DepositAdminService) {}

  @Get()
  @RequirePermission('deposit.view')
  @ApiOperation({ summary: 'فهرست درخواست‌های واریز' })
  list(
    @Query('status') status?: DepositStatusValue,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      status,
      q,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('deposit.view')
  @ApiOperation({ summary: 'جزئیات درخواست واریز' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Get(':id/receipts/:receiptId/url')
  @RequirePermission('deposit.view')
  @AuditLog('deposit.receipt_view')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'لینک موقت مشاهده رسید (۱۲۰ ثانیه)' })
  receiptUrl(@Param('id') id: string, @Param('receiptId') receiptId: string) {
    return this.service.getReceiptUrl(id, receiptId);
  }

  @Post(':id/review/start')
  @RequirePermission('deposit.approve')
  @AuditLog('deposit.review_start')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'شروع بررسی' })
  startReview(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.service.startReview(req.user.adminUserId, id);
  }

  @Post(':id/approve')
  @RequirePermission('deposit.approve')
  @AuditLog('deposit.approve')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'تایید واریز و شارژ کیف پول' })
  approve(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ApproveDepositDto,
  ) {
    // ⚠ هیچ مبلغی از بدنه خوانده نمی‌شود — فقط از رکورد دیتابیس
    return this.service.approve(req.user.adminUserId, id, dto.note);
  }

  @Post(':id/reject')
  @RequirePermission('deposit.approve')
  @AuditLog('deposit.reject')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'رد درخواست واریز' })
  reject(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: RejectDepositDto,
  ) {
    return this.service.reject(req.user.adminUserId, id, dto.reason);
  }

  @Post(':id/request-new-receipt')
  @RequirePermission('deposit.approve')
  @AuditLog('deposit.request_new_receipt')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'درخواست ارسال رسید جدید از کاربر' })
  requestNewReceipt(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: RequestNewReceiptDto,
  ) {
    return this.service.requestNewReceipt(req.user.adminUserId, id, dto.note);
  }
}
