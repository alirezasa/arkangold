import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTransactionsQueryDto } from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'تاریخچه تراکنش‌های کاربر' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetTransactionsQueryDto,
  ) {
    return this.transactionsService.getUserTransactions(req.user.userId, query);
  }

  // ⚠️ باید قبل از ':id' تعریف شود وگرنه Nest آن را به‌عنوان id تشخیص می‌دهد
  @Get('summary')
  @ApiOperation({ summary: 'خلاصه آماری تراکنش‌ها' })
  getSummary(@Req() req: AuthenticatedRequest) {
    return this.transactionsService.getSummary(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک تراکنش' })
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.transactionsService.getTransactionById(req.user.userId, id);
  }
}
