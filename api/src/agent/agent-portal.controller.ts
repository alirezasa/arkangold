// api/src/agent/agent-portal.controller.ts
//
// پرتال نماینده (داخل همان پنل ادمین): فقط داده‌های نماینده‌ی متصل به حساب.
// شناسه‌ی نماینده هرگز از ورودی کاربر خوانده نمی‌شود — همیشه از نشست (req.user.agentId).
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AgentScopeGuard, AgentPortalRequest } from './agent-scope.guard';
import { AgentService } from './agent.service';
import { AgentSaleService } from './agent-sale.service';
import {
  BuyerLookupQueryDto,
  CreateAgentSaleDto,
  CreateSettlementDto,
  InventoryQueryDto,
  ListSalesQueryDto,
  ListSettlementsQueryDto,
  MovementsQueryDto,
  StatementQueryDto,
} from './agent.dto';

@ApiTags('Agent Portal')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard, AgentScopeGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('agent-portal')
export class AgentPortalController {
  constructor(
    private readonly agents: AgentService,
    private readonly sales: AgentSaleService,
  ) {}

  private assertActive(req: AgentPortalRequest) {
    if (req.agentStatus !== 'ACTIVE') {
      throw new ForbiddenException(
        'حساب نمایندگی شما در حال حاضر تعلیق است؛ فقط امکان مشاهده وجود دارد',
      );
    }
  }

  @RequirePermission('agent_portal.view')
  @Get('summary')
  @ApiOperation({
    summary: 'خلاصه وضعیت نماینده: موجودی امانی، بدهی، فروش و تسویه',
  })
  summary(@Req() req: AgentPortalRequest) {
    return this.agents.summary(req.user.agentId);
  }

  @RequirePermission('agent_portal.view')
  @Get('inventory')
  inventory(@Req() req: AgentPortalRequest, @Query() query: InventoryQueryDto) {
    return this.agents.inventory(req.user.agentId, query);
  }

  @RequirePermission('agent_portal.view')
  @Get('movements')
  movements(@Req() req: AgentPortalRequest, @Query() query: MovementsQueryDto) {
    return this.agents.movements(req.user.agentId, query);
  }

  @RequirePermission('agent_portal.view')
  @Get('vouchers/:voucherNumber')
  voucher(
    @Req() req: AgentPortalRequest,
    @Param('voucherNumber') voucherNumber: string,
  ) {
    return this.agents.voucher(voucherNumber, req.user.agentId);
  }

  // ── فروش ──
  @RequirePermission('agent_portal.sell')
  @Get('quote/:code')
  @ApiOperation({
    summary: 'استعلام قیمت لحظه‌ای شمش امانی (قیمت برای مدت کوتاه قفل می‌شود)',
  })
  quote(@Req() req: AgentPortalRequest, @Param('code') code: string) {
    this.assertActive(req);
    return this.sales.quote(req.user.agentId, code);
  }

  @RequirePermission('agent_portal.sell')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('buyer-lookup')
  buyerLookup(@Query() query: BuyerLookupQueryDto) {
    return this.sales.lookupBuyer(query.phone);
  }

  @RequirePermission('agent_portal.sell')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditLog('agent_portal.sale.create')
  @Post('sales')
  @ApiOperation({ summary: 'ثبت فروش شمش و ثبت مالکیت به نام خریدار نهایی' })
  createSale(@Req() req: AgentPortalRequest, @Body() dto: CreateAgentSaleDto) {
    this.assertActive(req);
    return this.sales.createSale(
      { adminUserId: req.user.adminUserId, agentId: req.user.agentId },
      dto,
    );
  }

  @RequirePermission('agent_portal.view')
  @Get('sales')
  listSales(@Req() req: AgentPortalRequest, @Query() query: ListSalesQueryDto) {
    return this.sales.listSales(req.user.agentId, query);
  }

  @RequirePermission('agent_portal.view')
  @Get('sales/:id')
  getSale(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.getSale(id, req.user.agentId);
  }

  @RequirePermission('agent_portal.sell')
  @AuditLog('agent_portal.sale.issue_invoice')
  @Post('sales/:id/invoice')
  issueInvoice(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.retryInvoice(id, req.user.agentId);
  }

  @RequirePermission('agent_portal.view')
  @Get('invoices/:id')
  invoice(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.getInvoiceForAgent(id, req.user.agentId);
  }

  // ── تسویه ──
  @RequirePermission('agent_portal.view')
  @Get('settlements')
  settlements(
    @Req() req: AgentPortalRequest,
    @Query() query: ListSettlementsQueryDto,
  ) {
    return this.agents.listSettlements(req.user.agentId, query);
  }

  @RequirePermission('agent_portal.settle')
  @AuditLog('agent_portal.settlement.submit')
  @Post('settlements')
  submitSettlement(
    @Req() req: AgentPortalRequest,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.agents.submitSettlement(
      req.user.adminUserId,
      req.user.agentId,
      dto,
    );
  }

  // ── صورتحساب ──
  @RequirePermission('agent_portal.view')
  @Get('statement')
  statement(@Req() req: AgentPortalRequest, @Query() query: StatementQueryDto) {
    return this.agents.statement(req.user.agentId, query);
  }
}
