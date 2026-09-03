import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { InternalTransferDto } from '@arkan-gold/shared';
import { Res } from '@nestjs/common';
import type { Response } from 'express';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ── موجودی و اطلاعات کیف پول ──
  @Get()
  @ApiOperation({ summary: 'اطلاعات کیف پول کاربر' })
  getWallet(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWallet(req.user.userId);
  }

  // ── کانفیگ‌های واریز ──
  @Get('deposit/config')
  @ApiOperation({ summary: 'تنظیمات و محدودیت‌های واریز' })
  getDepositConfig() {
    return this.walletService.getDepositConfig();
  }

  // ── کانفیگ برداشت ──
  @Get('withdrawal/config')
  @ApiOperation({ summary: 'تنظیمات و محدودیت‌های برداشت' })
  getWithdrawalConfig(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWithdrawalConfig(req.user.userId);
  }

  // ── شروع واریز کارت به کارت ──
  @Post('deposit/card-to-card/initiate')
  @ApiOperation({ summary: 'شروع فرآیند واریز کارت به کارت' })
  initiateCardToCard(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sourceCardId: string; amount: number },
  ) {
    return this.walletService.initiateCardToCard(
      req.user.userId,
      body.sourceCardId,
      body.amount,
    );
  }

  // ── تایید انجام واریز کارت به کارت ──
  @Post('deposit/card-to-card/confirm')
  @ApiOperation({ summary: 'تایید انجام واریز کارت به کارت توسط کاربر' })
  confirmCardToCard(
    @Req() req: AuthenticatedRequest,
    @Body() body: { transactionId: string },
  ) {
    return this.walletService.confirmCardToCard(
      req.user.userId,
      body.transactionId,
    );
  }

  // ── واریز حساب به حساب ──
  @Post('deposit/bank-transfer/initiate')
  @ApiOperation({ summary: 'دریافت اطلاعات واریز حساب به حساب' })
  initiateBankTransfer(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sourceCardId: string },
  ) {
    return this.walletService.initiateBankTransfer(
      req.user.userId,
      body.sourceCardId,
    );
  }

  // ── واریز شناسه‌دار ──
  @Post('deposit/tracking-id')
  @ApiOperation({ summary: 'دریافت شناسه واریز اختصاصی' })
  getTrackingIdDeposit(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sourceCardId: string },
  ) {
    return this.walletService.getTrackingIdDeposit(
      req.user.userId,
      body.sourceCardId,
    );
  }

  // ── واریز مبالغ بالا ──
  @Post('deposit/large-transfer/initiate')
  @ApiOperation({ summary: 'شروع فرآیند واریز مبالغ بالا (پیش‌فاکتور)' })
  initiateLargeTransfer(
    @Req() req: AuthenticatedRequest,
    @Body() body: { amount: number },
  ) {
    return this.walletService.initiateLargeTransfer(
      req.user.userId,
      body.amount,
    );
  }

  // ── درخواست برداشت ──
  @Post('withdrawal/request')
  @ApiOperation({ summary: 'ثبت درخواست برداشت' })
  requestWithdrawal(
    @Req() req: AuthenticatedRequest,
    @Body() body: { bankAccountId: string; amountRial: number },
  ) {
    return this.walletService.requestWithdrawal(
      req.user.userId,
      body.bankAccountId,
      body.amountRial,
    );
  }

  // ── انتقال داخلی کیف پول ──
  @Post('transfer')
  @ApiOperation({
    summary: 'انتقال داخلی ریال/طلا به کیف پول دیگر با شماره کارت',
  })
  transfer(
    @Req() req: AuthenticatedRequest,
    @Body() body: InternalTransferDto,
  ) {
    return this.walletService.internalTransfer(
      req.user.userId,
      body.destinationCardNumber,
      body.amountRial,
      body.amountGrams,
    );
  }

  @Get('deposit/large-transfer/:id/proforma')
  @ApiOperation({ summary: 'پیش‌نمایش/دانلود PDF پیش‌فاکتور' })
  async getProformaPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('download') download: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.walletService.generateProformaPdf(
      req.user.userId,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    );
    res.send(buffer);
  }
}
