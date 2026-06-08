import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BankAccountService } from './bank-account.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddBankAccountDto } from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/bank-accounts')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Get()
  @ApiOperation({ summary: 'لیست حساب‌های بانکی کاربر' })
  getAccounts(@Req() req: AuthenticatedRequest) {
    return this.bankAccountService.getAccounts(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'افزودن حساب بانکی جدید' })
  addAccount(@Req() req: AuthenticatedRequest, @Body() dto: AddBankAccountDto) {
    return this.bankAccountService.addAccount(req.user.userId, dto);
  }

  @Patch(':id/set-default')
  @ApiOperation({ summary: 'تنظیم حساب پیش‌فرض' })
  setDefault(@Req() req: AuthenticatedRequest, @Param('id') accountId: string) {
    return this.bankAccountService.setDefault(req.user.userId, accountId);
  }
}
