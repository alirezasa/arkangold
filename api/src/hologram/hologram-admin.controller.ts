// api/src/hologram/hologram-admin.controller.ts
//
// پنل ادمین — مدیریت کامل کدهای هولوگرام، تخصیص‌ها، انتقال‌ها، تنظیمات امنیتی
// و لاگ‌ها (بند ۴.۴ / ۶.۵).
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { HologramService } from './hologram.service';
import { HologramTransferService } from './hologram-transfer.service';
import { HologramSecurityService } from './hologram-security.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import {
  AssignHologramCodeDto,
  CreateHologramBatchDto,
  GetHologramBatchesQueryDto,
  GetHologramCodesQueryDto,
  GetHologramInquiryLogsQueryDto,
  GetHologramRateLimitBlocksQueryDto,
  GetHologramTransferRequestsQueryDto,
  RevokeHologramCodeDto,
  UpdateHologramSecuritySettingsDto,
} from '@arkan-gold/shared';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Hologram - Admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/hologram')
export class HologramAdminController {
  constructor(
    private readonly hologramService: HologramService,
    private readonly transferService: HologramTransferService,
    private readonly security: HologramSecurityService,
  ) {}

  // ── دسته‌های هولوگرام ──
  @RequirePermission('hologram.batch.manage')
  @AuditLog('hologram.batch.create')
  @UseInterceptors(AuditLogInterceptor)
  @Post('batches')
  createBatch(@Req() req: AdminRequest, @Body() dto: CreateHologramBatchDto) {
    return this.hologramService.createBatch(req.user.adminUserId, dto);
  }

  @RequirePermission('hologram.batch.manage')
  @Get('batches')
  listBatches(@Query() query: GetHologramBatchesQueryDto) {
    return this.hologramService.listBatches(query);
  }

  @RequirePermission('hologram.batch.manage')
  @Get('batches/:id/print')
  getBatchPrintExport(@Param('id') id: string) {
    return this.hologramService.getBatchPrintExport(id);
  }

  // ── کدهای هولوگرام ──
  @RequirePermission('hologram.code.view')
  @Get('codes')
  listCodes(@Query() query: GetHologramCodesQueryDto) {
    return this.hologramService.listCodes(query);
  }

  @RequirePermission('hologram.code.view')
  @Get('codes/:code')
  getCodeDetail(@Param('code') code: string) {
    return this.hologramService.getCodeDetail(code);
  }

  @RequirePermission('hologram.code.assign')
  @AuditLog('hologram.code.assign')
  @UseInterceptors(AuditLogInterceptor)
  @Post('codes/:code/assign')
  assign(
    @Req() req: AdminRequest,
    @Param('code') code: string,
    @Body() dto: AssignHologramCodeDto,
  ) {
    return this.hologramService.assignCode(req.user.adminUserId, code, dto);
  }

  @RequirePermission('hologram.code.revoke')
  @AuditLog('hologram.code.revoke')
  @UseInterceptors(AuditLogInterceptor)
  @Post('codes/:code/revoke')
  revoke(
    @Req() req: AdminRequest,
    @Param('code') code: string,
    @Body() dto: RevokeHologramCodeDto,
  ) {
    return this.hologramService.revokeCode(
      req.user.adminUserId,
      code,
      dto.reason,
    );
  }

  // ── لاگ استعلام‌ها ──
  @RequirePermission('hologram.logs.view')
  @Get('inquiry-logs')
  getInquiryLogs(@Query() query: GetHologramInquiryLogsQueryDto) {
    return this.hologramService.getInquiryLogs(query);
  }

  // ── درخواست‌های انتقال مالکیت ──
  @RequirePermission('hologram.transfer.view')
  @Get('transfer-requests')
  getTransferRequests(@Query() query: GetHologramTransferRequestsQueryDto) {
    return this.transferService.listForAdmin(query);
  }

  // ── امنیت: IPهای مسدود ──
  @RequirePermission('hologram.security.manage')
  @Get('rate-limit-blocks')
  getRateLimitBlocks(@Query() query: GetHologramRateLimitBlocksQueryDto) {
    return this.security.listBlocks(query);
  }

  @RequirePermission('hologram.security.manage')
  @AuditLog('hologram.security.unblock_ip')
  @UseInterceptors(AuditLogInterceptor)
  @Post('rate-limit-blocks/:ip/unblock')
  unblockIp(@Req() req: AdminRequest, @Param('ip') ip: string) {
    return this.security.unblock(req.user.adminUserId, ip);
  }

  // ── امنیت: تنظیمات قابل‌تغییر ──
  @RequirePermission('hologram.security.manage')
  @Get('security-settings')
  getSecuritySettings() {
    return this.security.getSettings();
  }

  @RequirePermission('hologram.security.manage')
  @AuditLog('hologram.security.update_settings')
  @UseInterceptors(AuditLogInterceptor)
  @Put('security-settings')
  updateSecuritySettings(@Body() dto: UpdateHologramSecuritySettingsDto) {
    return this.security.updateSettings(dto);
  }
}
