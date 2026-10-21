// api/src/shipping/shipping-admin.controller.ts
// پنل: شرکت‌های حمل، مناطق ارسال، تعرفه‌ها و شبیه‌ساز هزینه‌ی ارسال
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { ShippingService } from './shipping.service';
import {
  ShippingCarrierDto,
  ShippingRateDto,
  ShippingSimulateDto,
  ShippingZoneDto,
} from './shipping.dto';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/shipping')
export class ShippingAdminController {
  constructor(private readonly service: ShippingService) {}

  @RequirePermission('shop.view')
  @Get('provinces')
  provinces() {
    return this.service.provinces();
  }

  // ── شرکت‌های حمل ──
  @RequirePermission('shop.view')
  @Get('carriers')
  listCarriers() {
    return this.service.listCarriers();
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_carrier.create')
  @Post('carriers')
  createCarrier(@Body() dto: ShippingCarrierDto) {
    return this.service.createCarrier(dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_carrier.update')
  @Patch('carriers/:id')
  updateCarrier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShippingCarrierDto,
  ) {
    return this.service.updateCarrier(id, dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_carrier.delete')
  @Delete('carriers/:id')
  deleteCarrier(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCarrier(id);
  }

  // ── مناطق ──
  @RequirePermission('shop.view')
  @Get('zones')
  listZones() {
    return this.service.listZones();
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_zone.create')
  @Post('zones')
  createZone(@Body() dto: ShippingZoneDto) {
    return this.service.createZone(dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_zone.update')
  @Patch('zones/:id')
  updateZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShippingZoneDto,
  ) {
    return this.service.updateZone(id, dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_zone.delete')
  @Delete('zones/:id')
  deleteZone(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteZone(id);
  }

  // ── تعرفه‌ها ──
  @RequirePermission('shop.view')
  @Get('rates')
  listRates() {
    return this.service.listRates();
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_rate.upsert')
  @Post('rates')
  upsertRate(@Body() dto: ShippingRateDto) {
    return this.service.upsertRate(dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_rate.update')
  @Patch('rates/:id')
  updateRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShippingRateDto,
  ) {
    return this.service.updateRate(id, dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_rate.delete')
  @Delete('rates/:id')
  deleteRate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRate(id);
  }

  // ── شبیه‌ساز ──
  @RequirePermission('shop.view')
  @Post('simulate')
  simulate(@Body() dto: ShippingSimulateDto) {
    return this.service.simulate(dto);
  }
}
