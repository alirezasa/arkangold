// api/src/partners/partner-api.controller.ts
//
// API عمومی شرکای فروش (اسنپ‌پی، دیجی‌پی، اپ‌های همکار) — نسخه ۱
//   GET  /partner-api/v1/price                       قیمت لحظه‌ای فروش طلای آب‌شده به مشتریان شریک
//   POST /partner-api/v1/orders                      ثبت سفارش/قرارداد (idempotent با externalRef)
//   GET  /partner-api/v1/orders/:externalRef         وضعیت سفارش
//   POST /partner-api/v1/orders/:externalRef/confirm تأیید سفارش پس از تضمین پرداخت توسط شریک
//   POST /partner-api/v1/orders/:externalRef/cancel  لغو (در انتظار) یا استرداد (تأییدشده)
//   GET  /partner-api/v1/statement                   صورتحساب شریک نزد آرکان گلد
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartnerApiGuard, PartnerRequest } from './partner-api.guard';
import { PartnerOrdersService } from './partner-orders.service';
import { PartnersService } from './partners.service';
import {
  ApiCancelDto,
  ApiCreateOrderDto,
  StatementQueryDto,
} from './partners.dto';

@ApiTags('Partner API v1')
@ApiHeader({ name: 'x-api-key', required: true })
@UseGuards(PartnerApiGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('partner-api/v1')
export class PartnerApiController {
  constructor(
    private readonly orders: PartnerOrdersService,
    private readonly partners: PartnersService,
  ) {}

  @Get('price')
  @ApiOperation({ summary: 'قیمت هر گرم طلای ۱۸ عیار برای مشتریان شریک' })
  async price(@Req() req: PartnerRequest) {
    const q = await this.orders.meltedQuote();
    return {
      unit: 'GRAM_750',
      pricePerGramRial: q.pricePerGramRial.toString(),
      feePercent: q.feePercent.toString(),
      taxPercent: q.taxPercent.toString(),
      partnerCommissionPercent: req.partner.commissionPercent.toString(),
      quotedAt: new Date().toISOString(),
    };
  }

  @Post('orders')
  @ApiOperation({ summary: 'ثبت سفارش خرید طلای آب‌شده برای مشتری شریک' })
  async create(@Req() req: PartnerRequest, @Body() dto: ApiCreateOrderDto) {
    const res = await this.orders.create({
      partnerId: req.partner.id,
      externalRef: dto.externalRef,
      customerPhone: dto.customerPhone,
      customerNationalCode: dto.customerNationalCode,
      productKind: 'MELTED_GOLD',
      amountGrams: dto.amountGrams,
      amountRial: dto.amountRial,
      downPaymentRial: dto.downPaymentRial,
      installmentCount: dto.installmentCount,
      installmentPlan: dto.installmentPlan,
      createdVia: 'API',
    });
    return {
      alreadyExists: res.alreadyExists,
      order: this.publicView(res.order),
    };
  }

  @Get('orders/:externalRef')
  async get(@Req() req: PartnerRequest, @Param('externalRef') ref: string) {
    const o = await this.orders.findByExternalRef(req.partner.id, ref);
    return this.publicView(this.orders.dto(o, req.partner));
  }

  @Post('orders/:externalRef/confirm')
  @HttpCode(200)
  async confirm(@Req() req: PartnerRequest, @Param('externalRef') ref: string) {
    const o = await this.orders.findByExternalRef(req.partner.id, ref);
    const res = await this.orders.confirm(o.id, null);
    return {
      alreadyProcessed: res.alreadyProcessed,
      order: this.publicView(res.order),
    };
  }

  @Post('orders/:externalRef/cancel')
  @HttpCode(200)
  async cancel(
    @Req() req: PartnerRequest,
    @Param('externalRef') ref: string,
    @Body() dto: ApiCancelDto,
  ) {
    const o = await this.orders.findByExternalRef(req.partner.id, ref);
    const reason = dto.reason?.trim() || 'درخواست شریک';
    return o.status === 'PENDING'
      ? this.orders.cancel(o.id, reason, null)
      : this.orders.refund(o.id, `${reason} (اعلام شریک)`, null);
  }

  @Get('statement')
  statement(@Req() req: PartnerRequest, @Query() query: StatementQueryDto) {
    return this.partners.statement(req.partner.id, query);
  }

  /** فیلدهای مجاز برای شریک — بدون شناسه‌های داخلی حسابداری */
  private publicView(o: ReturnType<PartnerOrdersService['dto']>) {
    return {
      orderNumber: o.orderNumber,
      externalRef: o.externalRef,
      status: o.status,
      productKind: o.productKind,
      amountGrams: o.amountGrams,
      pricePerGramRial: o.pricePerGramRial,
      goldValueRial: o.goldValueRial,
      feeRial: o.feeRial,
      taxRial: o.taxRial,
      totalRial: o.totalRial,
      commissionRial: o.commissionRial,
      netPayableToArkanRial: o.netReceivableRial,
      dueDate: o.dueDate,
      confirmedAt: o.confirmedAt,
      settledAt: o.settledAt,
      createdAt: o.createdAt,
    };
  }
}
