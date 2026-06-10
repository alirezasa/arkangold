import {
  Controller,
  Get,
  //Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthReq extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'موجودی کیف پول' })
  getWallet(@Req() req: AuthReq) {
    return this.walletService.getWallet(req.user.userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'تاریخچه تراکنش‌ها' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'type', required: false })
  getTransactions(
    @Req() req: AuthReq,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
  ) {
    return this.walletService.getTransactions(
      req.user.userId,
      page,
      limit,
      type,
    );
  }

  @Get('limits')
  @ApiOperation({ summary: 'سقف‌های واریز و برداشت + راهنما' })
  getLimits(@Req() req: AuthReq) {
    return this.walletService.getLimitsGuide(req.user.userId);
  }

  @Get('deposit/sheba-info')
  @ApiOperation({ summary: 'اطلاعات واریز با شبا' })
  getShebaInfo(@Req() req: AuthReq) {
    return this.walletService.getShebaDepositInfo(req.user.userId);
  }
}
