// api/src/agent/agent-trading-portal.controller.ts
//
// پرتال نماینده — خرید و فروش قطعی: کیف پول ریالی، حساب‌های بانکی، واریز/برداشت، سفارش خرید
// شمش از شرکت، فروش شمش به شرکت و صورتحساب‌های صادرشده به نام نماینده.
// شناسه‌ی نماینده هرگز از ورودی خوانده نمی‌شود — همیشه از نشست (req.user.agentId).
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
import { InvoiceService } from '../invoice/invoice.service';
import { AgentScopeGuard, AgentPortalRequest } from './agent-scope.guard';
import { AgentWalletService } from './agent-wallet.service';
import { AgentFundsService } from './agent-funds.service';
import { AgentPurchaseService } from './agent-purchase.service';
import { AgentBuybackService } from './agent-buyback.service';
import {
  BuybackAgentInvoiceDto,
  BuybackQuoteDto,
  SettleDebtFromWalletDto,
  CreateAgentBankAccountDto,
  CreateAgentDepositDto,
  CreateAgentWithdrawalDto,
  CreateBuybackOrderDto,
  CreatePurchaseOrderDto,
  InvoiceListQueryDto,
  PayOrderDto,
  SubmitOrderTransferDto,
  TradingListQueryDto,
  WalletTxQueryDto,
} from './agent-trading.dto';

@ApiTags('Agent Portal - Trading')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard, AgentScopeGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('agent-portal')
export class AgentTradingPortalController {
  constructor(
    private readonly wallet: AgentWalletService,
    private readonly funds: AgentFundsService,
    private readonly purchases: AgentPurchaseService,
    private readonly buybacks: AgentBuybackService,
    private readonly invoices: InvoiceService,
  ) {}

  private assertActive(req: AgentPortalRequest) {
    if (req.agentStatus !== 'ACTIVE') {
      throw new ForbiddenException(
        'حساب نمایندگی شما در حال حاضر تعلیق است؛ فقط امکان مشاهده وجود دارد',
      );
    }
  }

  // ── کیف پول ──
  @RequirePermission('agent_portal.view')
  @Get('wallet')
  @ApiOperation({ summary: 'موجودی کیف پول ریالی نماینده (جدا از کاربران)' })
  walletSummary(@Req() req: AgentPortalRequest) {
    return this.wallet.summary(req.user.agentId);
  }

  @RequirePermission('agent_portal.view')
  @Get('wallet/transactions')
  walletTransactions(
    @Req() req: AgentPortalRequest,
    @Query() query: WalletTxQueryDto,
  ) {
    return this.wallet.transactions(req.user.agentId, query);
  }

  @RequirePermission('agent_portal.wallet')
  @AuditLog('agent_portal.wallet.settle_debt')
  @Post('wallet/settle-debt')
  @ApiOperation({ summary: 'تسویه بدهی (امانی/اعتباری) از محل کیف پول' })
  settleDebt(
    @Req() req: AgentPortalRequest,
    @Body() dto: SettleDebtFromWalletDto,
  ) {
    return this.funds.settleDebtFromWallet(
      req.user.agentId,
      dto.amountRial,
      req.user.adminUserId,
    );
  }

  // ── حساب‌های بانکی ──
  @RequirePermission('agent_portal.view')
  @Get('bank-accounts')
  bankAccounts(@Req() req: AgentPortalRequest) {
    return this.funds.listBankAccounts(req.user.agentId);
  }

  @RequirePermission('agent_portal.wallet')
  @AuditLog('agent_portal.bank_account.create')
  @Post('bank-accounts')
  addBankAccount(
    @Req() req: AgentPortalRequest,
    @Body() dto: CreateAgentBankAccountDto,
  ) {
    return this.funds.addBankAccount(
      req.user.agentId,
      dto,
      req.user.adminUserId,
    );
  }

  @RequirePermission('agent_portal.wallet')
  @AuditLog('agent_portal.bank_account.default')
  @Post('bank-accounts/:id/default')
  defaultBankAccount(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.funds.setDefaultBankAccount(req.user.agentId, id);
  }

  @RequirePermission('agent_portal.wallet')
  @AuditLog('agent_portal.bank_account.archive')
  @Post('bank-accounts/:id/archive')
  archiveBankAccount(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.funds.archiveBankAccount(req.user.agentId, id);
  }

  // ── واریز ──
  @RequirePermission('agent_portal.view')
  @Get('deposits')
  deposits(@Req() req: AgentPortalRequest, @Query() q: TradingListQueryDto) {
    return this.funds.listDeposits(req.user.agentId, q);
  }

  @RequirePermission('agent_portal.view')
  @Get('deposit-destination')
  @ApiOperation({ summary: 'حساب رسمی شرکت برای واریز بانکی و سقف درگاه' })
  async depositDestination() {
    return {
      destination: await this.funds.companyDestination(),
      gatewayMaxRial: String(await this.funds.gatewayMaxRial()),
    };
  }

  @RequirePermission('agent_portal.wallet')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditLog('agent_portal.deposit.create')
  @Post('deposits')
  createDeposit(
    @Req() req: AgentPortalRequest,
    @Body() dto: CreateAgentDepositDto,
  ) {
    return this.funds.createDeposit(
      req.user.agentId,
      req.user.adminUserId,
      dto,
    );
  }

  // ── برداشت ──
  @RequirePermission('agent_portal.view')
  @Get('withdrawals')
  withdrawals(@Req() req: AgentPortalRequest, @Query() q: TradingListQueryDto) {
    return this.funds.listWithdrawals(req.user.agentId, q);
  }

  @RequirePermission('agent_portal.wallet')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @AuditLog('agent_portal.withdrawal.create')
  @Post('withdrawals')
  createWithdrawal(
    @Req() req: AgentPortalRequest,
    @Body() dto: CreateAgentWithdrawalDto,
  ) {
    return this.funds.createWithdrawal(
      req.user.agentId,
      req.user.adminUserId,
      dto,
    );
  }

  @RequirePermission('agent_portal.wallet')
  @AuditLog('agent_portal.withdrawal.cancel')
  @Post('withdrawals/:id/cancel')
  cancelWithdrawal(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.funds.cancelWithdrawal(req.user.agentId, id);
  }

  // ── خرید شمش از شرکت ──
  @RequirePermission('agent_portal.view')
  @Get('price-list')
  @ApiOperation({
    summary: 'فهرست قیمت نمایندگی (لحظه‌ای) و سقف قیمت فروش به مصرف‌کننده',
  })
  priceList() {
    return this.purchases.priceList();
  }

  @RequirePermission('agent_portal.view')
  @Get('purchase-orders')
  purchaseOrders(
    @Req() req: AgentPortalRequest,
    @Query() q: TradingListQueryDto,
  ) {
    return this.purchases.listOrders(req.user.agentId, q);
  }

  @RequirePermission('agent_portal.view')
  @Get('purchase-orders/:id')
  purchaseOrder(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchases.getOrder(id, req.user.agentId);
  }

  @RequirePermission('agent_portal.purchase')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditLog('agent_portal.purchase.create')
  @Post('purchase-orders')
  @ApiOperation({ summary: 'ثبت سفارش خرید شمش از شرکت (قیمت قفل‌شده)' })
  createPurchaseOrder(
    @Req() req: AgentPortalRequest,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    this.assertActive(req);
    return this.purchases.createOrder(
      req.user.agentId,
      req.user.adminUserId,
      dto,
    );
  }

  @RequirePermission('agent_portal.purchase')
  @AuditLog('agent_portal.purchase.pay')
  @Post('purchase-orders/:id/pay')
  payPurchaseOrder(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOrderDto,
  ) {
    this.assertActive(req);
    return this.purchases.payOrder(
      req.user.agentId,
      req.user.adminUserId,
      id,
      dto,
    );
  }

  @RequirePermission('agent_portal.purchase')
  @AuditLog('agent_portal.purchase.submit_transfer')
  @Post('purchase-orders/:id/transfer')
  @ApiOperation({ summary: 'ثبت مشخصات واریز بانکی سفارش در مهلت قفل قیمت' })
  submitTransfer(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitOrderTransferDto,
  ) {
    return this.purchases.submitTransfer(
      req.user.agentId,
      req.user.adminUserId,
      id,
      dto,
    );
  }

  @RequirePermission('agent_portal.purchase')
  @AuditLog('agent_portal.purchase.cancel')
  @Post('purchase-orders/:id/cancel')
  cancelPurchaseOrder(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchases.cancelByAgent(req.user.agentId, id);
  }

  @RequirePermission('agent_portal.purchase')
  @AuditLog('agent_portal.purchase.confirm_receipt')
  @Post('purchase-orders/:id/confirm-receipt')
  @ApiOperation({
    summary: 'تأیید دریافت شمش‌ها (تعداد، وزن، بسته‌بندی و هولوگرام) — بند ۶-۳',
  })
  confirmReceipt(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchases.confirmReceipt(id, {
      adminUserId: req.user.adminUserId,
      agentId: req.user.agentId,
    });
  }

  // ── فروش شمش به شرکت ──
  @RequirePermission('agent_portal.view')
  @Get('buybacks')
  listBuybacks(
    @Req() req: AgentPortalRequest,
    @Query() q: TradingListQueryDto,
  ) {
    return this.buybacks.list(req.user.agentId, q);
  }

  @RequirePermission('agent_portal.view')
  @Get('buybacks/:id')
  buyback(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.buybacks.get(id, req.user.agentId);
  }

  @RequirePermission('agent_portal.buyback')
  @Post('buybacks/quote')
  @ApiOperation({ summary: 'پیش‌نمایش قیمت خرید شمش‌های ملکی توسط شرکت' })
  buybackQuote(@Req() req: AgentPortalRequest, @Body() dto: BuybackQuoteDto) {
    return this.buybacks.quote(req.user.agentId, dto.codes);
  }

  @RequirePermission('agent_portal.buyback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditLog('agent_portal.buyback.create')
  @Post('buybacks')
  createBuyback(
    @Req() req: AgentPortalRequest,
    @Body() dto: CreateBuybackOrderDto,
  ) {
    return this.buybacks.create(req.user.agentId, req.user.adminUserId, dto);
  }

  @RequirePermission('agent_portal.buyback')
  @AuditLog('agent_portal.buyback.invoice')
  @Post('buybacks/:id/agent-invoice')
  @ApiOperation({
    summary: 'ثبت شماره صورتحساب الکترونیک نماینده به نام شرکت (سامانه مؤدیان)',
  })
  buybackInvoice(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BuybackAgentInvoiceDto,
  ) {
    return this.buybacks.setAgentInvoice(req.user.agentId, id, dto);
  }

  @RequirePermission('agent_portal.buyback')
  @AuditLog('agent_portal.buyback.cancel')
  @Post('buybacks/:id/cancel')
  cancelBuyback(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.buybacks.cancelByAgent(req.user.agentId, id);
  }

  // ── صورتحساب‌های صادرشده به نام نماینده ──
  @RequirePermission('agent_portal.view')
  @Get('company-invoices')
  @ApiOperation({
    summary: 'صورتحساب‌ها و پیش‌فاکتورهای صادرشده توسط شرکت به نام نماینده',
  })
  companyInvoices(
    @Req() req: AgentPortalRequest,
    @Query() q: InvoiceListQueryDto,
  ) {
    return this.invoices.listForAgent(req.user.agentId, q);
  }

  @RequirePermission('agent_portal.view')
  @Get('company-invoices/:id')
  companyInvoice(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.getDocumentForAgent(id, req.user.agentId);
  }
}
