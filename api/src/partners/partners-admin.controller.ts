// api/src/partners/partners-admin.controller.ts
//
// پنل مدیریت — شرکای فروش: تعریف شریک و قرارداد، کلید API، سفارش‌ها (ثبت/تأیید/لغو/
// استرداد)، تسویه‌ها، صورتحساب و گزارش عملکرد/سنی مطالبات.
import {
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { PartnersService } from './partners.service';
import { PartnerOrdersService } from './partner-orders.service';
import {
  ListPartnerOrdersQueryDto,
  ListPartnersQueryDto,
  ListSettlementsQueryDto,
  PartnerDto,
  PartnerOrderDto,
  PartnerReportQueryDto,
  PartnerSettlementDto,
  ReasonDto,
  StatementQueryDto,
} from './partners.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Sales Partners')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@RequirePermission('partner.view')
@Controller('admin/partners')
export class PartnersAdminController {
  constructor(
    private readonly partners: PartnersService,
    private readonly orders: PartnerOrdersService,
  ) {}

  // ── مسیرهای ثابت پیش از :id ──
  @Get('providers')
  @ApiOperation({
    summary: 'آداپتورهای یکپارچه‌سازی سرویس‌های اقساطی و وضعیت آماده‌بودن',
  })
  providers() {
    return this.partners.providers();
  }

  @Get('report')
  report(@Query() query: PartnerReportQueryDto) {
    return this.partners.report(query);
  }

  @Get('quote')
  async quote() {
    const q = await this.orders.meltedQuote();
    return {
      marketPricePerGramRial: q.marketPricePerGramRial.toString(),
      pricePerGramRial: q.pricePerGramRial.toString(),
      feePercent: q.feePercent.toString(),
      taxPercent: q.taxPercent.toString(),
    };
  }

  // ── سفارش‌ها ──
  @Get('orders')
  listOrders(@Query() query: ListPartnerOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get('orders/:orderId')
  getOrder(@Param('orderId', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @RequirePermission('partner.order.manage')
  @AuditLog('partner.order.create')
  @Post('orders')
  createOrder(@Req() req: AdminRequest, @Body() dto: PartnerOrderDto) {
    return this.orders.createFromAdmin(req.user.adminUserId, dto);
  }

  @RequirePermission('partner.order.manage')
  @AuditLog('partner.order.confirm')
  @Post('orders/:orderId/confirm')
  confirm(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.orders.confirm(id, req.user.adminUserId);
  }

  @RequirePermission('partner.order.manage')
  @AuditLog('partner.order.cancel')
  @Post('orders/:orderId/cancel')
  cancel(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.orders.cancel(id, dto.reason, req.user.adminUserId);
  }

  @RequirePermission('partner.order.manage')
  @AuditLog('partner.order.refund')
  @Post('orders/:orderId/refund')
  refund(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.orders.refund(id, dto.reason, req.user.adminUserId);
  }

  @RequirePermission('partner.order.manage')
  @AuditLog('partner.order.invoice')
  @Post('orders/:orderId/invoice')
  invoice(@Param('orderId', ParseUUIDPipe) id: string) {
    return this.orders.retryInvoice(id);
  }

  // ── تسویه‌ها ──
  @Get('settlements')
  listSettlements(@Query() query: ListSettlementsQueryDto) {
    return this.orders.listSettlements(query);
  }

  @RequirePermission('partner.settlement.manage')
  @AuditLog('partner.settlement.create')
  @Post('settlements')
  settle(@Req() req: AdminRequest, @Body() dto: PartnerSettlementDto) {
    return this.orders.settle(req.user.adminUserId, dto);
  }

  // ── شرکا ──
  @Get()
  list(@Query() query: ListPartnersQueryDto) {
    return this.partners.list(query);
  }

  @RequirePermission('partner.manage')
  @AuditLog('partner.create')
  @Post()
  create(@Req() req: AdminRequest, @Body() dto: PartnerDto) {
    return this.partners.create(req.user.adminUserId, dto);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.detail(id);
  }

  @RequirePermission('partner.manage')
  @AuditLog('partner.update')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PartnerDto) {
    return this.partners.update(id, dto);
  }

  @Get(':id/statement')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ) {
    return this.partners.statement(id, query);
  }

  @RequirePermission('partner.manage')
  @AuditLog('partner.api_key.rotate')
  @Post(':id/api-key')
  rotateKey(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.rotateApiKey(id);
  }

  @RequirePermission('partner.manage')
  @AuditLog('partner.api_key.revoke')
  @Post(':id/api-key/revoke')
  revokeKey(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.revokeApiKey(id);
  }
}
