import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ShopOrdersService } from './shop-orders.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import {
  ShipShopOrderDto,
  CancelShopOrderDto,
  GetShopOrdersQueryDto,
} from '@arkan-gold/shared';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/shop-orders')
export class ShopOrdersAdminController {
  constructor(private readonly service: ShopOrdersService) {}

  @RequirePermission('shop.view')
  @Get()
  list(@Query() query: GetShopOrdersQueryDto) {
    return this.service.adminList(query);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.process')
  @Post(':id/process')
  process(@Param('id') id: string) {
    return this.service.process(id);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.ship')
  @Post(':id/ship')
  ship(@Param('id') id: string, @Body() dto: ShipShopOrderDto) {
    return this.service.ship(id, dto);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.deliver')
  @Post(':id/deliver')
  deliver(@Param('id') id: string) {
    return this.service.deliver(id);
  }

  @RequirePermission('shop.manage')
  @AuditLog('shop_orders.cancel')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelShopOrderDto) {
    return this.service.adminCancel(id, dto);
  }
}
