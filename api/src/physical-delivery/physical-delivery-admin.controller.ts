import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { PhysicalDeliveryService } from './physical-delivery.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import {
  ShipPhysicalDeliveryDto,
  PhysicalDeliveryAdminNoteDto,
  GetPhysicalDeliveriesQueryDto,
} from '@arkan-gold/shared';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/physical-deliveries')
export class PhysicalDeliveryAdminController {
  constructor(private readonly service: PhysicalDeliveryService) {}

  @RequirePermission('physical_delivery.view')
  @Get()
  list(@Query() query: GetPhysicalDeliveriesQueryDto) {
    return this.service.adminList(query);
  }

  @RequirePermission('physical_delivery.approve')
  @AuditLog('physical_delivery.approve')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/approve')
  approve(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.service.approve(req.user.adminUserId, id);
  }

  @RequirePermission('physical_delivery.approve')
  @AuditLog('physical_delivery.ship')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/ship')
  ship(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: ShipPhysicalDeliveryDto,
  ) {
    return this.service.ship(req.user.adminUserId, id, dto);
  }

  @RequirePermission('physical_delivery.approve')
  @AuditLog('physical_delivery.deliver')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/deliver')
  deliver(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.service.deliver(req.user.adminUserId, id);
  }

  @RequirePermission('physical_delivery.approve')
  @AuditLog('physical_delivery.cancel')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/cancel')
  cancel(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() dto: PhysicalDeliveryAdminNoteDto,
  ) {
    return this.service.adminCancel(req.user.adminUserId, id, dto.reason);
  }
}
