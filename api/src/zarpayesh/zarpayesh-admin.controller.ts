// api/src/zarpayesh/zarpayesh-admin.controller.ts
//
// پنل مدیریت سامانه ناظر بر خرید و فروش بر خط طلا و نقره (زر پایش)
//   zarpayesh.view    مشاهده‌ی وضعیت، معاملات، ارسال‌ها، لاگ‌ها و استعلام‌های فقط‌خواندنی
//   zarpayesh.manage  تنظیمات، آزمون اتصال، روشن/خاموش، ثبت کاربر و عملیات معاملات/ارسال‌ها
//   integrations.credentials.manage  ثبت نام کاربری، رمز عبور و کلید AES
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { ZarPayeshAdminService, serialize } from './zarpayesh-admin.service';
import { ZarPayeshTradeService } from './zarpayesh-trade.service';
import { ZarPayeshDeliveryService } from './zarpayesh-delivery.service';
import { ZarPayeshError } from './zarpayesh-errors';
import {
  ApproveTradeDto,
  CreateDeliveryDto,
  CryptoTestDto,
  EditPlatformUserDto,
  ListQueryDto,
  ReviewTradeDto,
  SetDeliveryStatusDto,
  SetZarPayeshCredentialDto,
  TestReserveDto,
  ToggleZarPayeshDto,
  UpdateZarPayeshSettingsDto,
} from './zarpayesh.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

async function asHttp<T>(fn: () => Promise<T>): Promise<unknown> {
  try {
    return serialize(await fn());
  } catch (err) {
    if (err instanceof ZarPayeshError)
      throw new BadRequestException(err.message);
    throw err;
  }
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/zarpayesh')
export class ZarPayeshAdminController {
  constructor(
    private readonly admin: ZarPayeshAdminService,
    private readonly trades: ZarPayeshTradeService,
    private readonly deliveries: ZarPayeshDeliveryService,
  ) {}

  // ── وضعیت و تنظیمات ──
  @RequirePermission('zarpayesh.view')
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.settings.update')
  @Patch('settings')
  updateSettings(
    @Req() req: AdminRequest,
    @Body() dto: UpdateZarPayeshSettingsDto,
  ) {
    return this.admin.updateSettings(req.user.adminUserId, dto);
  }

  @RequirePermission('integrations.credentials.manage')
  @AuditLog('zarpayesh.credential.set')
  @Post('credentials')
  setCredential(@Body() dto: SetZarPayeshCredentialDto) {
    return this.admin.setCredential(dto.key, dto.value);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.test_connection')
  @Post('test-connection')
  testConnection(@Req() req: AdminRequest) {
    return this.admin.testConnection(req.user.adminUserId);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.toggle')
  @Post('toggle')
  toggle(@Req() req: AdminRequest, @Body() dto: ToggleZarPayeshDto) {
    return this.admin.toggle(req.user.adminUserId, dto.enabled);
  }

  // ── نشست (Account Methods) ──
  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.session.login')
  @Post('session/login')
  login(@Req() req: AdminRequest) {
    return this.admin.sessionAction(req.user.adminUserId, 'login');
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.session.refresh')
  @Post('session/refresh')
  refresh(@Req() req: AdminRequest) {
    return this.admin.sessionAction(req.user.adminUserId, 'refresh');
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.session.logout')
  @Post('session/logout')
  logout(@Req() req: AdminRequest) {
    return this.admin.sessionAction(req.user.adminUserId, 'logout');
  }

  // ── رمزنگاری کد ملی/موبایل ──
  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.crypto.encrypt_test')
  @Post('crypto/encrypt')
  encrypt(@Body() dto: CryptoTestDto) {
    return this.admin.cryptoEncrypt(dto.value);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.crypto.decrypt_test')
  @Post('crypto/decrypt')
  decrypt(@Body() dto: CryptoTestDto) {
    return this.admin.cryptoDecrypt(dto.value);
  }

  // ── استعلام‌های زنده (Typelist، Vaultlist، PayTypelist، states، cities، TxnFollowup، GetUserBalance) ──
  @RequirePermission('zarpayesh.view')
  @Get('lookup/:kind')
  lookup(
    @Req() req: AdminRequest,
    @Param('kind') kind: string,
    @Query('fkstate') fkstate?: string,
  ) {
    return this.admin.lookup(
      req.user.adminUserId,
      kind,
      fkstate ? Number(fkstate) : undefined,
    );
  }

  @RequirePermission('zarpayesh.view')
  @Get('followup/:srcTrackingNumber')
  followup(@Req() req: AdminRequest, @Param('srcTrackingNumber') src: string) {
    return this.admin.txnFollowup(req.user.adminUserId, src);
  }

  @RequirePermission('zarpayesh.view')
  @AuditLog('zarpayesh.user.balance')
  @Get('users/:userId/balance')
  balance(
    @Req() req: AdminRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.admin.userBalance(req.user.adminUserId, userId);
  }

  // ── کاربران سکو (AddPlatformUsers / EditPlatformUsers) ──
  @RequirePermission('zarpayesh.view')
  @Get('users')
  users(@Query() q: ListQueryDto) {
    return this.admin.listUsers(q);
  }

  @RequirePermission('zarpayesh.view')
  @Get('users/:userId/preview')
  previewUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.admin.previewUser(userId);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.user.register')
  @Post('users/:userId/register')
  registerUser(
    @Req() req: AdminRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.admin.registerUser(req.user.adminUserId, userId);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.user.edit')
  @Post('users/:userId/edit')
  editUser(
    @Req() req: AdminRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: EditPlatformUserDto,
  ) {
    return this.admin.editUser(req.user.adminUserId, userId, dto.fkCity);
  }

  // ── معاملات (Reserve / Approve / Cancel / TxnFollowup) ──
  @RequirePermission('zarpayesh.view')
  @Get('trades')
  listTrades(@Query() q: ListQueryDto) {
    return this.admin.listTrades(q);
  }

  @RequirePermission('zarpayesh.view')
  @Get('trades/:id')
  getTrade(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getTrade(id);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.trade.test_reserve')
  @Post('trades/test-reserve')
  testReserve(@Req() req: AdminRequest, @Body() dto: TestReserveDto) {
    return asHttp(() => this.trades.testReserve(req.user.adminUserId, dto));
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.trade.followup')
  @Post('trades/:id/followup')
  followupTrade(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return asHttp(() => this.trades.manualFollowup(id, req.user.adminUserId));
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.trade.approve')
  @Post('trades/:id/approve')
  approveTrade(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveTradeDto,
  ) {
    return asHttp(() =>
      this.trades.manualApprove(id, req.user.adminUserId, dto.rrn),
    );
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.trade.cancel')
  @Post('trades/:id/cancel')
  cancelTrade(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return asHttp(() => this.trades.manualCancel(id, req.user.adminUserId));
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.trade.review')
  @Post('trades/:id/review')
  reviewTrade(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewTradeDto,
  ) {
    return this.trades.markReviewed(id, req.user.adminUserId, dto.note);
  }

  // ── ارسال دارایی (MakeDeliveries / SetDeliveries / GetDeliveries / MakeDeliverFollowup) ──
  @RequirePermission('zarpayesh.view')
  @Get('deliveries')
  listDeliveries(@Query() q: ListQueryDto) {
    return this.admin.listDeliveries(q);
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.delivery.create')
  @Post('deliveries')
  createDelivery(@Req() req: AdminRequest, @Body() dto: CreateDeliveryDto) {
    return asHttp(() => this.deliveries.create(req.user.adminUserId, dto));
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.delivery.set_status')
  @Post('deliveries/:id/status')
  setDeliveryStatus(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDeliveryStatusDto,
  ) {
    return asHttp(() =>
      this.deliveries.setStatus(
        req.user.adminUserId,
        id,
        dto.status,
        dto.approveCode,
      ),
    );
  }

  @RequirePermission('zarpayesh.manage')
  @AuditLog('zarpayesh.delivery.refresh')
  @Post('deliveries/:id/refresh')
  refreshDelivery(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return asHttp(() => this.deliveries.refresh(req.user.adminUserId, id));
  }

  // ── لاگ فراخوانی‌ها ──
  @RequirePermission('zarpayesh.view')
  @Get('logs')
  logs(@Query() q: ListQueryDto) {
    return this.admin.listLogs(q);
  }
}
