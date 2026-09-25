// api/src/treasury/treasury-admin.controller.ts
//
// پنل مدیریت — خزانه: گزارش پوشش و خرید طلای آب‌شده، سفارش‌های خرید/فروش با بازار،
// تأمین‌کنندگان و پرداخت‌ها، شمارش خزانه؛ و گزارش لحظه‌ای موجودی شمش.
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
import { TreasuryService } from './treasury.service';
import { BullionInventoryService } from './bullion-inventory.service';
import {
  BullionItemsQueryDto,
  BullionQueryDto,
  CancelDto,
  CodeBarsDto,
  CoverageQueryDto,
  ListOrdersQueryDto,
  ListSuppliersQueryDto,
  PageQueryDto,
  PurchaseRequestDto,
  ReceiveOrderDto,
  SupplierDto,
  SupplierPaymentDto,
  TreasuryOrderDto,
  VaultCountDto,
} from './treasury.dto';
import { IsOptional, IsUUID } from 'class-validator';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

class PaymentsQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() supplierId?: string;
}

class StatementQueryDto extends PageQueryDto {
  @IsOptional() from?: string;
  @IsOptional() to?: string;
}

@ApiTags('Admin - Treasury')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@RequirePermission('treasury.view')
@Controller('admin/treasury')
export class TreasuryAdminController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get('coverage')
  @ApiOperation({
    summary:
      'گزارش پوشش طلای آب‌شده: بدهی کاربران، موجودی خزانه، در راه، کسری و خرید پیشنهادی',
  })
  coverage(@Query() query: CoverageQueryDto) {
    return this.treasury.coverageReport(query);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.purchase_request.create')
  @Post('coverage/purchase-request')
  purchaseRequest(@Req() req: AdminRequest, @Body() dto: PurchaseRequestDto) {
    return this.treasury.createPurchaseRequest(req.user.adminUserId, dto);
  }

  // ── تأمین‌کنندگان ──
  @Get('suppliers')
  suppliers(@Query() query: ListSuppliersQueryDto) {
    return this.treasury.listSuppliers(query);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.supplier.create')
  @Post('suppliers')
  createSupplier(@Body() dto: SupplierDto) {
    return this.treasury.createSupplier(dto);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.supplier.update')
  @Patch('suppliers/:id')
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierDto,
  ) {
    return this.treasury.updateSupplier(id, dto);
  }

  @Get('suppliers/:id/statement')
  supplierStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ) {
    return this.treasury.supplierStatement(id, query);
  }

  // ── سفارش‌های خرید/فروش ──
  @Get('orders')
  orders(@Query() query: ListOrdersQueryDto) {
    return this.treasury.listOrders(query);
  }

  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.treasury.getOrder(id);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.order.create')
  @Post('orders')
  createOrder(@Req() req: AdminRequest, @Body() dto: TreasuryOrderDto) {
    return this.treasury.createOrder(req.user.adminUserId, dto);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.order.update')
  @Patch('orders/:id')
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TreasuryOrderDto,
  ) {
    return this.treasury.updateOrder(id, dto);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.order.confirm')
  @Post('orders/:id/confirm')
  confirmOrder(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.treasury.confirmOrder(req.user.adminUserId, id);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.order.receive')
  @Post('orders/:id/receive')
  receiveOrder(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveOrderDto,
  ) {
    return this.treasury.receiveOrder(req.user.adminUserId, id, dto);
  }

  @RequirePermission('treasury.order.manage')
  @AuditLog('treasury.order.cancel')
  @Post('orders/:id/cancel')
  cancelOrder(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return this.treasury.cancelOrder(req.user.adminUserId, id, dto.reason);
  }

  // ── پرداخت‌ها ──
  @Get('payments')
  payments(@Query() query: PaymentsQueryDto) {
    return this.treasury.listPayments(query);
  }

  @RequirePermission('treasury.payment.manage')
  @AuditLog('treasury.payment.create')
  @Post('payments')
  recordPayment(@Req() req: AdminRequest, @Body() dto: SupplierPaymentDto) {
    return this.treasury.recordPayment(req.user.adminUserId, dto);
  }

  // ── شمارش خزانه ──
  @Get('vault-counts')
  vaultCounts(@Query() query: PageQueryDto) {
    return this.treasury.listVaultCounts(query);
  }

  @RequirePermission('treasury.vault_count')
  @AuditLog('treasury.vault_count.create')
  @Post('vault-counts')
  vaultCount(@Req() req: AdminRequest, @Body() dto: VaultCountDto) {
    return this.treasury.recordVaultCount(req.user.adminUserId, dto);
  }
}

@ApiTags('Admin - Bullion Inventory')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@RequirePermission('inventory.view')
@Controller('admin/inventory/bullion')
export class BullionInventoryController {
  constructor(private readonly inventory: BullionInventoryService) {}

  @Get()
  @ApiOperation({
    summary:
      'موجودی لحظه‌ای شمش: کد خام، کددار خزانه، نزد نمایندگان، فروخته‌شده، در انتظار کد، موجودی فروشگاه',
  })
  summary(@Query() query: BullionQueryDto) {
    return this.inventory.summary(query);
  }

  @Get('items')
  items(@Query() query: BullionItemsQueryDto) {
    return this.inventory.items(query);
  }

  @RequirePermission('inventory.code')
  @AuditLog('inventory.bullion.code')
  @Post('code')
  code(@Body() dto: CodeBarsDto) {
    return this.inventory.codeBars(dto);
  }
}
