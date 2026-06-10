import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WithdrawalService } from './withdrawal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsNumber, IsString, Min } from 'class-validator';
import { DepositService } from './deposit.service';
import {
  GatewayDepositDto,
  ConfirmGatewayDepositDto,
} from '@arkan-gold/shared';

class WithdrawDto {
  @IsNumber()
  @Min(1)
  amountRial!: number;

  @IsString()
  bankAccountId!: string;
}

interface AuthReq extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private withdrawalService: WithdrawalService,
    private depositService: DepositService,
  ) {}

  @Post('withdraw')
  @ApiOperation({ summary: 'درخواست برداشت' })
  requestWithdrawal(@Req() req: AuthReq, @Body() dto: WithdrawDto) {
    return this.withdrawalService.requestWithdrawal(
      req.user.userId,
      dto.amountRial,
      dto.bankAccountId,
    );
  }

  @Delete('withdraw/:id')
  @ApiOperation({ summary: 'لغو درخواست برداشت' })
  cancelWithdrawal(@Req() req: AuthReq, @Param('id') id: string) {
    return this.withdrawalService.cancelWithdrawal(req.user.userId, id);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'لیست درخواست‌های برداشت' })
  getWithdrawals(
    @Req() req: AuthReq,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.withdrawalService.getWithdrawals(req.user.userId, page, limit);
  }

  // endpointها:
  @Post('deposit/gateway/validate')
  @ApiOperation({ summary: 'اعتبارسنجی مبلغ واریز درگاه' })
  validateDeposit(@Req() req: AuthReq, @Body() dto: GatewayDepositDto) {
    return this.depositService.validateGatewayDeposit(req.user.userId, dto);
  }

  @Post('deposit/gateway/confirm')
  @ApiOperation({ summary: 'تایید واریز موفق از درگاه' })
  confirmDeposit(@Req() req: AuthReq, @Body() dto: ConfirmGatewayDepositDto) {
    return this.depositService.confirmGatewayDeposit(req.user.userId, dto);
  }

  @Get('deposit/sheba-info')
  @ApiOperation({ summary: 'اطلاعات واریز با شبا' })
  getShebaInfo(@Req() req: AuthReq) {
    return this.depositService.getShebaDepositInfo(req.user.userId);
  }
}
