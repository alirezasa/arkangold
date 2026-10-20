// api/src/buyback/buyback-admin.controller.ts
//
// پنل مدیریت: رسیدگی به درخواست‌های بازخرید شمش — پذیرش و نوبت، دریافت، اصالت‌سنجی،
// اعلام قیمت، تأیید نهایی، واریز و عودت
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { BuybackService } from './buyback.service';
import {
  AcceptBuybackDto,
  InspectBuybackDto,
  ListBuybackQueryDto,
  NoteDto,
  OfferBuybackDto,
  PayBuybackDto,
  ReasonDto,
} from './buyback.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/buyback')
export class BuybackAdminController {
  constructor(private readonly buyback: BuybackService) {}

  @RequirePermission('buyback.view')
  @Get()
  list(@Query() query: ListBuybackQueryDto) {
    return this.buyback.list(query);
  }

  @RequirePermission('buyback.view')
  @Get('summary')
  summary() {
    return this.buyback.summary();
  }

  @RequirePermission('buyback.view')
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.buyback.getOne(id);
  }

  /** پیش‌نمایش قیمت نهایی با قیمت لحظه‌ای (و مقادیر دلخواه کارشناس) */
  @RequirePermission('buyback.process')
  @Post(':id/quote')
  quote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OfferBuybackDto) {
    return this.buyback.suggestOffer(id, dto);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.accept')
  @Post(':id/accept')
  accept(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptBuybackDto,
  ) {
    return this.buyback.accept(req.user.adminUserId, id, dto);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.reject')
  @Post(':id/reject')
  reject(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.buyback.reject(req.user.adminUserId, id, dto.reason);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.receive')
  @Post(':id/receive')
  receive(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
  ) {
    return this.buyback.markReceived(req.user.adminUserId, id, dto.note);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.inspect')
  @Post(':id/inspect')
  inspect(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InspectBuybackDto,
  ) {
    return this.buyback.inspect(req.user.adminUserId, id, dto);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.offer')
  @Post(':id/offer')
  offer(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfferBuybackDto,
  ) {
    return this.buyback.offer(req.user.adminUserId, id, dto);
  }

  @RequirePermission('buyback.approve')
  @AuditLog('buyback.approve')
  @Post(':id/approve')
  approve(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
  ) {
    return this.buyback.approve(req.user.adminUserId, id, dto.note);
  }

  @RequirePermission('buyback.pay')
  @AuditLog('buyback.pay')
  @Post(':id/pay')
  pay(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayBuybackDto,
  ) {
    return this.buyback.pay(req.user.adminUserId, id, dto);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.return')
  @Post(':id/return')
  requestReturn(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.buyback.requestReturn(req.user.adminUserId, id, dto.reason);
  }

  @RequirePermission('buyback.process')
  @AuditLog('buyback.returned')
  @Post(':id/returned')
  returned(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
  ) {
    return this.buyback.markReturned(req.user.adminUserId, id, dto.note);
  }
}
