import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { BankAccountService } from './bank-account.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddBankAccountDto } from '@arkan-gold/shared';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { OwnedResource } from '../common/audit/owned-resource.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('users/me/bank-accounts')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Get()
  @ApiOperation({ summary: 'لیست حساب‌های بانکی کاربر' })
  getAccounts(@Req() req: AuthenticatedRequest) {
    return this.bankAccountService.getAccounts(req.user.userId);
  }

  // هر ثبت دو استعلام هزینه‌دار (تطبیق کارت + شبا) دارد → محدودیت نرخ
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'افزودن کارت بانکی (فقط شماره کارت؛ شبا خودکار تکمیل می‌شود)',
  })
  addAccount(@Req() req: AuthenticatedRequest, @Body() dto: AddBankAccountDto) {
    return this.bankAccountService.addAccount(req.user.userId, dto);
  }

  @OwnedResource({ model: 'bankAccount', ownerPath: 'userId' })
  @Patch(':id/set-default')
  @ApiOperation({ summary: 'تنظیم حساب پیش‌فرض' })
  setDefault(@Req() req: AuthenticatedRequest, @Param('id') accountId: string) {
    return this.bankAccountService.setDefault(req.user.userId, accountId);
  }

  @OwnedResource({ model: 'bankAccount', ownerPath: 'userId' })
  @Delete(':id')
  @ApiOperation({ summary: 'حذف کارت بانکی' })
  remove(@Req() req: AuthenticatedRequest, @Param('id') accountId: string) {
    return this.bankAccountService.removeAccount(req.user.userId, accountId);
  }
}
