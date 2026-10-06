import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { InternalTransferDto } from '@arkan-gold/shared';
import {
  CardToCardInitiateDto,
  ConfirmCardToCardDto,
  LargeTransferInitiateDto,
  SourceCardDto,
  WithdrawalRequestDto,
} from './wallet-requests.dto';

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
    @Body() body: CardToCardInitiateDto,
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
    @Body() body: ConfirmCardToCardDto,
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
    @Body() body: SourceCardDto,
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
    @Body() body: SourceCardDto,
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
    @Body() body: LargeTransferInitiateDto,
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
    @Body() body: WithdrawalRequestDto,
  ) {
    return this.walletService.requestWithdrawal(
      req.user.userId,
      body.bankAccountId,
      body.amountRial,
    );
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'فهرست درخواست‌های برداشت کاربر' })
  listWithdrawals(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.listMyWithdrawals(
      req.user.userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Post('withdrawals/:id/cancel')
  @ApiOperation({ summary: 'لغو درخواست برداشت در انتظار بررسی' })
  cancelWithdrawal(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.walletService.cancelMyWithdrawal(req.user.userId, id);
  }

  // ── کانفیگ و محدودیت‌های انتقال داخلی ──
  @Get('transfer/config')
  @ApiOperation({ summary: 'تنظیمات و محدودیت‌های انتقال داخلی کیف پول' })
  getTransferConfig(@Req() req: AuthenticatedRequest) {
    return this.walletService.getTransferConfig(req.user.userId);
  }

  // ── انتقال داخلی طلا ──
  @Post('transfer')
  @ApiOperation({
    summary: 'انتقال داخلی طلا به کیف پول کاربر دیگر با شماره کارت',
  })
  transfer(
    @Req() req: AuthenticatedRequest,
    @Body() body: InternalTransferDto,
  ) {
    return this.walletService.internalTransfer(
      req.user.userId,
      body.destinationCardNumber,
      body.amountGrams,
    );
  }
}
