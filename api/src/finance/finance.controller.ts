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
  constructor(private withdrawalService: WithdrawalService) {}

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
}
