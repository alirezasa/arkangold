import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ShopOrdersService } from './shop-orders.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import {
  ShipShopOrderDto,
  CancelShopOrderDto,
  GetShopOrdersQueryDto,
} from '@arkan-gold/shared';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/shop-orders')
export class ShopOrdersAdminController {
  constructor(private readonly service: ShopOrdersService) {}

  @RequirePermission('shop.view')
  @Get()
  list(@Query() query: GetShopOrdersQueryDto) {
    return this.service.adminList(query);
  }

  @RequirePermission('shop.manage')
  @Post(':id/process')
  process(@Param('id') id: string) {
    return this.service.process(id);
  }

  @RequirePermission('shop.manage')
  @Post(':id/ship')
  ship(@Param('id') id: string, @Body() dto: ShipShopOrderDto) {
    return this.service.ship(id, dto);
  }

  @RequirePermission('shop.manage')
  @Post(':id/deliver')
  deliver(@Param('id') id: string) {
    return this.service.deliver(id);
  }

  @RequirePermission('shop.manage')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelShopOrderDto) {
    return this.service.adminCancel(id, dto);
  }
}
