// api/src/agent/agent-admin.controller.ts
//
// پنل مدیریت — نمایندگان فروش: تعریف، حساب‌های ورود، تحویل/عودت شمش، فروش‌ها،
// تسویه، اصلاحیه، صورتحساب، اسناد حسابداری و گزارش عملکرد.
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
import { AgentService } from './agent.service';
import { AgentSaleService } from './agent-sale.service';
import {
  AllocateStockDto,
  ChangeAgentStatusDto,
  CreateAdjustmentDto,
  CreateAgentAccountDto,
  CreateAgentDto,
  CreateSettlementDto,
  InventoryQueryDto,
  ListAgentsQueryDto,
  ListSalesQueryDto,
  ListSettlementsQueryDto,
  MovementsQueryDto,
  PageQueryDto,
  RejectSettlementDto,
  ReportQueryDto,
  ReturnStockDto,
  StatementQueryDto,
  UpdateAgentAccountDto,
  UpdateAgentDto,
  VoidSaleDto,
} from './agent.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Sales Agents')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/agents')
export class AgentAdminController {
  constructor(
    private readonly agents: AgentService,
    private readonly sales: AgentSaleService,
  ) {}

  // ── آمار و گزارش (مسیرهای ثابت پیش از :id) ──
  @RequirePermission('agent.view')
  @Get('overview')
  @ApiOperation({
    summary: 'آمار کلی نمایندگان: موجودی امانی، مطالبات، تسویه‌های در انتظار',
  })
  overview() {
    return this.agents.overview();
  }

  @RequirePermission('agent.view')
  @Get('reports/performance')
  @ApiOperation({ summary: 'گزارش عملکرد نمایندگان در بازه زمانی' })
  performance(@Query() query: ReportQueryDto) {
    return this.agents.performanceReport(query);
  }

  // ── فروش‌ها (همه نمایندگان) ──
  @RequirePermission('agent.view')
  @Get('sales')
  listSales(@Query() query: ListSalesQueryDto) {
    return this.sales.listSales(null, query);
  }

  @RequirePermission('agent.view')
  @Get('sales/:saleId')
  getSale(@Param('saleId', ParseUUIDPipe) saleId: string) {
    return this.sales.getSale(saleId);
  }

  @RequirePermission('agent.sale.void')
  @AuditLog('agent.sale.void')
  @Post('sales/:saleId/void')
  voidSale(
    @Req() req: AdminRequest,
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() dto: VoidSaleDto,
  ) {
    return this.sales.voidSale(req.user.adminUserId, saleId, dto.reason);
  }

  @RequirePermission('agent.view')
  @AuditLog('agent.sale.issue_invoice')
  @Post('sales/:saleId/invoice')
  issueInvoice(@Param('saleId', ParseUUIDPipe) saleId: string) {
    return this.sales.retryInvoice(saleId);
  }

  // ── تسویه‌ها (همه نمایندگان) ──
  @RequirePermission('agent.view')
  @Get('settlements')
  listSettlements(@Query() query: ListSettlementsQueryDto) {
    return this.agents.listSettlements(null, query);
  }

  @RequirePermission('agent.settlement.manage')
  @AuditLog('agent.settlement.approve')
  @Post('settlements/:settlementId/approve')
  approveSettlement(
    @Req() req: AdminRequest,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
  ) {
    return this.agents.approveSettlement(req.user.adminUserId, settlementId);
  }

  @RequirePermission('agent.settlement.manage')
  @AuditLog('agent.settlement.reject')
  @Post('settlements/:settlementId/reject')
  rejectSettlement(
    @Req() req: AdminRequest,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: RejectSettlementDto,
  ) {
    return this.agents.rejectSettlement(
      req.user.adminUserId,
      settlementId,
      dto.reason,
    );
  }

  // ── حرکات موجودی (همه نمایندگان) و حواله ──
  @RequirePermission('agent.view')
  @Get('movements')
  allMovements(@Query() query: MovementsQueryDto) {
    return this.agents.movements(null, query);
  }

  @RequirePermission('agent.view')
  @Get('vouchers/:voucherNumber')
  voucher(@Param('voucherNumber') voucherNumber: string) {
    return this.agents.voucher(voucherNumber);
  }

  // ── نماینده ──
  @RequirePermission('agent.view')
  @Get()
  list(@Query() query: ListAgentsQueryDto) {
    return this.agents.list(query);
  }

  @RequirePermission('agent.manage')
  @AuditLog('agent.create')
  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateAgentDto) {
    return this.agents.create(req.user.adminUserId, dto);
  }

  @RequirePermission('agent.view')
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.agents.detail(id);
  }

  @RequirePermission('agent.manage')
  @AuditLog('agent.update')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }

  @RequirePermission('agent.manage')
  @AuditLog('agent.change_status')
  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAgentStatusDto,
  ) {
    return this.agents.changeStatus(id, dto);
  }

  // ── حساب‌های ورود نماینده ──
  @RequirePermission('agent.manage')
  @AuditLog('agent.account.create')
  @Post(':id/accounts')
  createAccount(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAgentAccountDto,
  ) {
    return this.agents.createAccount(req.user.adminUserId, id, dto);
  }

  @RequirePermission('agent.manage')
  @AuditLog('agent.account.update')
  @Patch(':id/accounts/:accountId')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateAgentAccountDto,
  ) {
    return this.agents.updateAccount(id, accountId, dto);
  }

  // ── موجودی امانی ──
  @RequirePermission('agent.view')
  @Get(':id/inventory')
  inventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: InventoryQueryDto,
  ) {
    return this.agents.inventory(id, query);
  }

  @RequirePermission('agent.stock.manage')
  @AuditLog('agent.stock.allocate')
  @Post(':id/allocate')
  allocate(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllocateStockDto,
  ) {
    return this.agents.allocate(req.user.adminUserId, id, dto);
  }

  @RequirePermission('agent.stock.manage')
  @AuditLog('agent.stock.return')
  @Post(':id/return')
  returnStock(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnStockDto,
  ) {
    return this.agents.returnStock(req.user.adminUserId, id, dto);
  }

  @RequirePermission('agent.view')
  @Get(':id/movements')
  movements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MovementsQueryDto,
  ) {
    return this.agents.movements(id, query);
  }

  // ── تسویه و اصلاحیه ──
  @RequirePermission('agent.settlement.manage')
  @AuditLog('agent.settlement.record')
  @Post(':id/settlements')
  recordSettlement(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.agents.recordSettlement(req.user.adminUserId, id, dto);
  }

  @RequirePermission('agent.settlement.manage')
  @AuditLog('agent.adjustment.create')
  @Post(':id/adjustments')
  adjust(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.agents.adjust(req.user.adminUserId, id, dto);
  }

  // ── صورتحساب و اسناد ──
  @RequirePermission('agent.view')
  @Get(':id/statement')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ) {
    return this.agents.statement(id, query);
  }

  @RequirePermission('agent.view')
  @Get(':id/journals')
  journals(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQueryDto,
  ) {
    return this.agents.journals(id, query);
  }
}
