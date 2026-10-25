// api/src/agent/agent-trading-admin.controller.ts
//
// پنل مدیریت — خرید و فروش قطعی نمایندگان: فهرست قیمت نمایندگی، سفارش‌های خرید (تأیید،
// تخصیص شمش، صورتحساب، حواله، تحویل، لغو)، واریز/برداشت و حساب‌های بانکی، کیف پول و
// فروش شمش نماینده به شرکت. مسیرهای ثابت زیر trading/ هستند تا با :id نماینده تداخل نکنند.
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
import { InvoiceService } from '../invoice/invoice.service';
import { AgentWalletService } from './agent-wallet.service';
import { AgentFundsService } from './agent-funds.service';
import { AgentPurchaseService } from './agent-purchase.service';
import { AgentBuybackService } from './agent-buyback.service';
import {
  AgentPriceItemDto,
  ApprovePurchaseOrderDto,
  CreateAgentBankAccountDto,
  InvoiceListQueryDto,
  MarkDeliveredDto,
  PayAgentWithdrawalDto,
  PayBuybackDto,
  ReasonDto,
  ReceiveBuybackDto,
  ReviewBankAccountDto,
  SettleDebtFromWalletDto,
  TradingListQueryDto,
  UpdateAgentPriceItemDto,
  WalletAdjustmentDto,
  WalletTxQueryDto,
} from './agent-trading.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Sales Agents Trading')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/agents')
export class AgentTradingAdminController {
  constructor(
    private readonly wallet: AgentWalletService,
    private readonly funds: AgentFundsService,
    private readonly purchases: AgentPurchaseService,
    private readonly buybacks: AgentBuybackService,
    private readonly invoices: InvoiceService,
  ) {}

  // ── داشبورد ──
  @RequirePermission('agent.view')
  @Get('trading/overview')
  @ApiOperation({
    summary:
      'کارتابل خرید و فروش نمایندگان: در انتظار تأیید، واریز، برداشت، حساب بانکی',
  })
  async overview() {
    const empty = { page: 1, limit: 1 } as TradingListQueryDto;
    const [
      paid,
      review,
      deposits,
      withdrawals,
      approvedW,
      accounts,
      buybacks,
      wallets,
    ] = await Promise.all([
      this.purchases.listOrders(null, { ...empty, status: 'PAID' }),
      this.purchases.listOrders(null, { ...empty, status: 'PAYMENT_REVIEW' }),
      this.funds.listDeposits(null, { ...empty, status: 'PENDING_REVIEW' }),
      this.funds.listWithdrawals(null, { ...empty, status: 'PENDING' }),
      this.funds.listWithdrawals(null, { ...empty, status: 'APPROVED' }),
      this.funds.pendingBankAccounts({ ...empty, status: 'PENDING' }),
      this.buybacks.list(null, { ...empty, status: 'PENDING_DELIVERY' }),
      this.wallet.totals(),
    ]);
    return {
      ordersAwaitingApproval: paid.total,
      ordersAwaitingPaymentReview: review.total,
      depositsAwaitingReview: deposits.total,
      withdrawalsPending: withdrawals.total,
      withdrawalsAwaitingPayout: approvedW.total,
      bankAccountsPending: accounts.total,
      buybacksAwaitingDelivery: buybacks.total,
      agentWallets: wallets,
    };
  }

  // ── فهرست قیمت نمایندگی ──
  @RequirePermission('agent.view')
  @Get('trading/price-items')
  priceItems() {
    return this.purchases.adminPriceItems();
  }

  @RequirePermission('agent.order.manage')
  @AuditLog('agent.price_item.create')
  @Post('trading/price-items')
  createPriceItem(@Body() dto: AgentPriceItemDto) {
    return this.purchases.createPriceItem(dto);
  }

  @RequirePermission('agent.order.manage')
  @AuditLog('agent.price_item.update')
  @Patch('trading/price-items/:itemId')
  updatePriceItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateAgentPriceItemDto,
  ) {
    return this.purchases.updatePriceItem(itemId, dto);
  }

  // ── سفارش‌های خرید ──
  @RequirePermission('agent.view')
  @Get('trading/orders')
  orders(@Query() q: TradingListQueryDto) {
    return this.purchases.listOrders(null, q);
  }

  @RequirePermission('agent.view')
  @Get('trading/orders/:orderId')
  order(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.purchases.getOrder(orderId);
  }

  @RequirePermission('agent.order.manage')
  @Get('trading/orders/:orderId/candidates')
  @ApiOperation({ summary: 'شمش‌های کددار آزاد خزانه هم‌وزن با اقلام سفارش' })
  candidates(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.purchases.allocationCandidates(orderId);
  }

  @RequirePermission('agent.order.manage')
  @AuditLog('agent.order.approve')
  @Post('trading/orders/:orderId/approve')
  @ApiOperation({
    summary: 'تأیید سفارش: تخصیص شمش، صورتحساب به نام نماینده، حواله و سند',
  })
  approve(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ApprovePurchaseOrderDto,
  ) {
    return this.purchases.approve(orderId, req.user.adminUserId, dto);
  }

  @RequirePermission('agent.order.manage')
  @AuditLog('agent.order.deliver')
  @Post('trading/orders/:orderId/deliver')
  deliver(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MarkDeliveredDto,
  ) {
    return this.purchases.markDelivered(
      orderId,
      req.user.adminUserId,
      dto.note,
    );
  }

  @RequirePermission('agent.order.manage')
  @AuditLog('agent.order.confirm_receipt')
  @Post('trading/orders/:orderId/confirm-receipt')
  @ApiOperation({
    summary: 'ثبت رسید کتبی امضاشده‌ی نماینده به‌جای تأیید در پنل',
  })
  confirmReceipt(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.purchases.confirmReceipt(orderId, {
      adminUserId: req.user.adminUserId,
    });
  }

  @RequirePermission('agent.order.manage')
  @AuditLog('agent.order.cancel')
  @Post('trading/orders/:orderId/cancel')
  cancelOrder(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.purchases.adminCancel(
      orderId,
      dto.reason,
      req.user.adminUserId,
    );
  }

  // ── واریزها ──
  @RequirePermission('agent.view')
  @Get('trading/deposits')
  deposits(@Query() q: TradingListQueryDto) {
    return this.funds.listDeposits(null, q);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.deposit.approve')
  @Post('trading/deposits/:depositId/approve')
  approveDeposit(
    @Req() req: AdminRequest,
    @Param('depositId', ParseUUIDPipe) depositId: string,
  ) {
    return this.funds.approveDeposit(depositId, req.user.adminUserId);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.deposit.reject')
  @Post('trading/deposits/:depositId/reject')
  rejectDeposit(
    @Req() req: AdminRequest,
    @Param('depositId', ParseUUIDPipe) depositId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.funds.rejectDeposit(
      depositId,
      dto.reason,
      req.user.adminUserId,
    );
  }

  // ── برداشت‌ها ──
  @RequirePermission('agent.view')
  @Get('trading/withdrawals')
  withdrawals(@Query() q: TradingListQueryDto) {
    return this.funds.listWithdrawals(null, q);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.withdrawal.approve')
  @Post('trading/withdrawals/:requestId/approve')
  approveWithdrawal(
    @Req() req: AdminRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.funds.approveWithdrawal(requestId, req.user.adminUserId);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.withdrawal.reject')
  @Post('trading/withdrawals/:requestId/reject')
  rejectWithdrawal(
    @Req() req: AdminRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.funds.rejectWithdrawal(
      requestId,
      dto.reason,
      req.user.adminUserId,
    );
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.withdrawal.pay')
  @Post('trading/withdrawals/:requestId/pay')
  payWithdrawal(
    @Req() req: AdminRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: PayAgentWithdrawalDto,
  ) {
    return this.funds.payWithdrawal(
      requestId,
      dto.bankReference,
      req.user.adminUserId,
    );
  }

  // ── حساب‌های بانکی ──
  @RequirePermission('agent.view')
  @Get('trading/bank-accounts')
  bankAccountQueue(@Query() q: TradingListQueryDto) {
    return this.funds.pendingBankAccounts(q);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.bank_account.review')
  @Post('trading/bank-accounts/:accountId/review')
  reviewBankAccount(
    @Req() req: AdminRequest,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: ReviewBankAccountDto,
  ) {
    return this.funds.reviewBankAccount(
      accountId,
      dto.approve,
      dto.reason,
      req.user.adminUserId,
    );
  }

  // ── فروش شمش نماینده به شرکت ──
  @RequirePermission('agent.view')
  @Get('trading/buybacks')
  buybackList(@Query() q: TradingListQueryDto) {
    return this.buybacks.list(null, q);
  }

  @RequirePermission('agent.view')
  @Get('trading/buybacks/:orderId')
  buyback(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.buybacks.get(orderId);
  }

  @RequirePermission('agent.buyback.manage')
  @AuditLog('agent.buyback.receive')
  @Post('trading/buybacks/:orderId/receive')
  receiveBuyback(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReceiveBuybackDto,
  ) {
    return this.buybacks.receive(orderId, req.user.adminUserId, dto);
  }

  @RequirePermission('agent.buyback.manage')
  @AuditLog('agent.buyback.approve')
  @Post('trading/buybacks/:orderId/approve')
  approveBuyback(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.buybacks.approve(orderId, req.user.adminUserId);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.buyback.pay')
  @Post('trading/buybacks/:orderId/pay')
  payBuyback(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PayBuybackDto,
  ) {
    return this.buybacks.pay(orderId, req.user.adminUserId, dto.bankReference);
  }

  @RequirePermission('agent.buyback.manage')
  @AuditLog('agent.buyback.reject')
  @Post('trading/buybacks/:orderId/reject')
  rejectBuyback(
    @Req() req: AdminRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.buybacks.reject(orderId, dto.reason, req.user.adminUserId);
  }

  // ── به ازای هر نماینده ──
  @RequirePermission('agent.view')
  @Get(':id/wallet')
  async agentWallet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: WalletTxQueryDto,
  ) {
    const [summary, tx] = await Promise.all([
      this.wallet.summary(id),
      this.wallet.transactions(id, q),
    ]);
    return { summary, ...tx };
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.wallet.adjust')
  @Post(':id/wallet/adjust')
  adjustWallet(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WalletAdjustmentDto,
  ) {
    return this.funds.adjustWallet(id, dto, req.user.adminUserId);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.wallet.settle_debt')
  @Post(':id/wallet/settle-debt')
  settleDebt(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleDebtFromWalletDto,
  ) {
    return this.funds.settleDebtFromWallet(
      id,
      dto.amountRial,
      req.user.adminUserId,
    );
  }

  @RequirePermission('agent.view')
  @Get(':id/bank-accounts')
  agentBankAccounts(@Param('id', ParseUUIDPipe) id: string) {
    return this.funds.listBankAccounts(id, true);
  }

  @RequirePermission('agent.funds.manage')
  @AuditLog('agent.bank_account.create')
  @Post(':id/bank-accounts')
  addAgentBankAccount(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAgentBankAccountDto,
  ) {
    return this.funds.addBankAccount(id, dto, req.user.adminUserId);
  }

  @RequirePermission('agent.view')
  @Get(':id/company-invoices')
  agentInvoices(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: InvoiceListQueryDto,
  ) {
    return this.invoices.listForAgent(id, q);
  }
}
