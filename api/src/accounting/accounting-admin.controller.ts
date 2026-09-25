import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { AccountingAdminService } from './accounting-admin.service';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingManageService } from './accounting-manage.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import {
  AsOfQueryDto,
  CreateAccountDto,
  FinalizeDto,
  FiscalYearDto,
  ListJournalQueryDto,
  ListVouchersQueryDto,
  LockDateDto,
  PeriodQueryDto,
  ReasonDto,
  RevaluationDto,
  StatementQueryDto,
  TrialBalanceQueryDto,
  UpdateAccountDto,
  VoucherDto,
} from './accounting.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Accounting')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@RequirePermission('accounting.view')
@Controller('admin/accounting')
export class AccountingAdminController {
  constructor(
    private readonly service: AccountingAdminService,
    private readonly reports: AccountingReportsService,
    private readonly manage: AccountingManageService,
  ) {}

  // ── خلاصه و داشبورد ──
  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'داشبورد مالی: نقد، بدهی‌ها، پوشش طلا، سود و زیان ماه',
  })
  dashboard() {
    return this.reports.dashboard();
  }

  // ── سرفصل حساب‌ها ──
  @Get('accounts')
  listAccounts() {
    return this.manage.listAccounts();
  }

  @RequirePermission('accounting.manage')
  @AuditLog('accounting.account.create')
  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto) {
    return this.manage.createAccount(dto);
  }

  @RequirePermission('accounting.manage')
  @AuditLog('accounting.account.update')
  @Patch('accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.manage.updateAccount(id, dto);
  }

  @Get('accounts/:id/ledger')
  async getLedger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ) {
    const result = await this.reports.accountStatement(id, query);
    if (!result) throw new NotFoundException('حساب یافت نشد');
    return result;
  }

  // ── دفتر روزنامه ──
  @Get('journal-entries')
  listJournalEntries(@Query() query: ListJournalQueryDto) {
    return this.service.listJournalEntries(query);
  }

  @Get('journal-entries/:id')
  async getJournalEntry(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.getJournalEntryDetail(id);
    if (!result) throw new NotFoundException('سند یافت نشد');
    return result;
  }

  // ── گزارش‌های مالی ──
  @Get('trial-balance')
  getTrialBalance(@Query() query: TrialBalanceQueryDto) {
    return this.reports.trialBalance(query);
  }

  @Get('reports/income-statement')
  @ApiOperation({ summary: 'صورت سود و زیان دوره' })
  incomeStatement(@Query() query: PeriodQueryDto) {
    return this.reports.incomeStatement(query);
  }

  @Get('reports/balance-sheet')
  @ApiOperation({ summary: 'ترازنامه در تاریخ مشخص' })
  balanceSheet(@Query() query: AsOfQueryDto) {
    return this.reports.balanceSheet(query.asOf);
  }

  @Get('reports/gold-position')
  @ApiOperation({ summary: 'موقعیت طلا: خزانه، در راه، بدهی کاربران، شمش' })
  goldPosition() {
    return this.reports.goldPosition();
  }

  @Get('reports/reconciliation')
  @ApiOperation({
    summary:
      'مغایرت‌گیری دفتر کل با کیف پول‌ها، نمایندگان، شرکا و تأمین‌کنندگان',
  })
  reconciliation() {
    return this.reports.reconciliation();
  }

  // ── ارزیابی طلا ──
  @Get('revaluation/preview')
  revaluationPreview(@Query() query: RevaluationDto) {
    return this.reports.revaluationPreview(query.pricePerGramRial);
  }

  @RequirePermission('accounting.manage')
  @AuditLog('accounting.revaluation.post')
  @Post('revaluation')
  postRevaluation(@Req() req: AdminRequest, @Body() dto: RevaluationDto) {
    return this.reports.postRevaluation(
      req.user.adminUserId,
      dto.pricePerGramRial,
    );
  }

  // ── اسناد دستی ──
  @Get('vouchers')
  listVouchers(@Query() query: ListVouchersQueryDto) {
    return this.manage.listVouchers(query);
  }

  @RequirePermission('accounting.voucher.create')
  @AuditLog('accounting.voucher.create')
  @Post('vouchers')
  createVoucher(@Req() req: AdminRequest, @Body() dto: VoucherDto) {
    return this.manage.createVoucher(req.user.adminUserId, dto);
  }

  @RequirePermission('accounting.voucher.create')
  @AuditLog('accounting.voucher.update')
  @Patch('vouchers/:id')
  updateVoucher(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoucherDto,
  ) {
    return this.manage.updateVoucher(req.user.adminUserId, id, dto);
  }

  @RequirePermission('accounting.voucher.create')
  @AuditLog('accounting.voucher.cancel')
  @Post('vouchers/:id/cancel')
  cancelVoucher(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manage.cancelVoucher(req.user.adminUserId, id);
  }

  @RequirePermission('accounting.voucher.approve')
  @AuditLog('accounting.voucher.approve')
  @Post('vouchers/:id/approve')
  approveVoucher(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manage.approveVoucher(req.user.adminUserId, id);
  }

  @RequirePermission('accounting.voucher.approve')
  @AuditLog('accounting.voucher.reject')
  @Post('vouchers/:id/reject')
  rejectVoucher(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.manage.rejectVoucher(req.user.adminUserId, id, dto.reason);
  }

  @RequirePermission('accounting.voucher.approve')
  @AuditLog('accounting.voucher.reverse')
  @Post('vouchers/:id/reverse')
  reverseVoucher(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.manage.reverseVoucher(req.user.adminUserId, id, dto.reason);
  }

  // ── سال مالی و قفل دوره ──
  @Get('fiscal-years')
  listFiscalYears() {
    return this.manage.listFiscalYears();
  }

  @RequirePermission('accounting.period.manage')
  @AuditLog('accounting.fiscal_year.create')
  @Post('fiscal-years')
  createFiscalYear(@Body() dto: FiscalYearDto) {
    return this.manage.createFiscalYear(dto);
  }

  @RequirePermission('accounting.period.manage')
  @AuditLog('accounting.fiscal_year.close')
  @Post('fiscal-years/:id/close')
  closeFiscalYear(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manage.closeFiscalYear(req.user.adminUserId, id);
  }

  @RequirePermission('accounting.period.manage')
  @AuditLog('accounting.period.lock')
  @Post('lock-date')
  setLockDate(@Body() dto: LockDateDto) {
    return this.manage.setLockDate(dto.date ?? null);
  }

  @RequirePermission('accounting.period.manage')
  @AuditLog('accounting.journal.finalize')
  @Post('finalize')
  finalize(@Body() dto: FinalizeDto) {
    return this.manage.finalizeJournals(dto.upTo);
  }
}
