import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShopOrdersService } from './shop-orders.service';
import { ShopOrderFulfillmentService } from './shop-order-fulfillment.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { CancelShopOrderDto, GetShopOrdersQueryDto } from '@arkan-gold/shared';

interface AdminRequest {
  user: AdminAuthenticatedUser;
}

class AdminShopOrdersQueryDto extends GetShopOrdersQueryDto {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

class ShipOrderDto {
  @IsUUID() shippingMethodId!: string;
  @IsOptional() @IsString() @MaxLength(60) trackingCode?: string;
  @IsOptional() @IsString() estimatedDelivery?: string;
  @IsOptional() @IsString() @MaxLength(80) courierName?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[0-9۰-۹+\s-]{10,16}$/)
  courierPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class DeliverOrderDto {
  @IsOptional() @IsString() @MaxLength(10) deliveryCode?: string;
  @IsOptional() @IsString() @MaxLength(80) receivedByName?: string;
}

class DeliverOverrideDto {
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(80) receivedByName?: string;
}

class ResendCodeDto {
  @IsOptional() @IsBoolean() regenerate?: boolean;
}

class AdminNoteDto {
  @IsString() @MaxLength(1000) note!: string;
}

class ShippingMethodDto {
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional()
  @IsIn(['POST', 'COURIER', 'EXPRESS', 'PICKUP'])
  type?: 'POST' | 'COURIER' | 'EXPRESS' | 'PICKUP';
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() @MaxLength(300) trackingUrlTemplate?: string | null;
  @IsOptional() @IsBoolean() requiresTrackingCode?: boolean;
  @IsOptional() @IsBoolean() requiresDeliveryCode?: boolean;
  @IsOptional() @IsBoolean() courierLinkEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) estimatedDays?:
    number | null;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/shop-orders')
export class ShopOrdersAdminController {
  constructor(
    private readonly service: ShopOrdersService,
    private readonly fulfillment: ShopOrderFulfillmentService,
  ) {}

  @RequirePermission('shop.view')
  @Get()
  list(@Query() query: AdminShopOrdersQueryDto) {
    return this.service.adminList(query);
  }

  // ── مراجع ارسال (قبل از :id تا با مسیر جزئیات اشتباه گرفته نشود) ──
  @RequirePermission('shop.view')
  @Get('shipping-methods')
  listMethods(@Query('active') active?: string) {
    return this.fulfillment.listMethods(active === 'true');
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_method.create')
  @Post('shipping-methods')
  createMethod(@Body() dto: ShippingMethodDto) {
    return this.fulfillment.createMethod(dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shipping_method.update')
  @Patch('shipping-methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: ShippingMethodDto) {
    return this.fulfillment.updateMethod(id, dto);
  }

  @RequirePermission('shop.view')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.adminGetOne(id);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.note')
  @Patch(':id/note')
  note(@Param('id') id: string, @Body() dto: AdminNoteDto) {
    return this.service.updateAdminNote(id, dto.note);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.process')
  @Post(':id/process')
  process(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.service.process(id, req.user.adminUserId);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.ship')
  @Post(':id/ship')
  ship(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.fulfillment.ship(id, dto, req.user.adminUserId);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.deliver')
  @Post(':id/deliver')
  deliver(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: DeliverOrderDto,
  ) {
    return this.fulfillment.deliverWithCode(
      id,
      dto.deliveryCode,
      req.user.adminUserId,
      dto.receivedByName,
    );
  }

  @RequirePermission('shop.delivery.override')
  @AuditLog('shop_orders.deliver_override')
  @Post(':id/deliver-override')
  deliverOverride(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: DeliverOverrideDto,
  ) {
    return this.fulfillment.deliverOverride(
      id,
      dto.reason,
      req.user.adminUserId,
      dto.receivedByName,
    );
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.resend_delivery_code')
  @Post(':id/delivery-code/resend')
  resendCode(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ResendCodeDto,
  ) {
    return this.fulfillment.resendDeliveryCode(
      id,
      req.user.adminUserId,
      dto.regenerate ?? false,
    );
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.cancel')
  @Post(':id/cancel')
  cancel(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: CancelShopOrderDto,
  ) {
    return this.service.adminCancel(id, dto, req.user.adminUserId);
  }
}
