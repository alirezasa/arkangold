// api/src/referral/referral.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { ReferralService } from './referral.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

class MyReferralsQueryDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
}

@ApiTags('Referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('me')
  @ApiOperation({
    summary: 'کد و لینک دعوت، آمار دعوت‌ها و پاداش‌های دریافتی کاربر',
  })
  getMine(
    @Req() req: AuthenticatedRequest,
    @Query() query: MyReferralsQueryDto,
  ) {
    return this.referralService.getMyReferrals(
      req.user.userId,
      query.page ? Number(query.page) : 1,
      query.limit ? Number(query.limit) : 20,
    );
  }
}
