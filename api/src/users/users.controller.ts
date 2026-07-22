import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitIdentityDto } from '@arkan-gold/shared';
import { UpdateLegalProfileDto } from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'پروفایل کاربر جاری' })
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getProfile(req.user.userId);
  }

  @Post('me/identity')
  @ApiOperation({ summary: 'ارسال اطلاعات هویتی و احراز هویت' })
  submitIdentity(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitIdentityDto,
  ) {
    return this.usersService.submitIdentity(req.user.userId, dto);
  }

  @Get('me/legal-profile')
  @ApiOperation({ summary: 'دریافت پروفایل حقوقی' })
  getLegalProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getLegalProfile(req.user.userId);
  }

  @Post('me/legal-profile')
  @ApiOperation({ summary: 'ثبت/بروزرسانی اطلاعات شرکت' })
  updateLegalProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateLegalProfileDto,
  ) {
    return this.usersService.updateLegalProfile(req.user.userId, dto);
  }

  @Post('me/request-legal-upgrade')
  requestLegalUpgrade(@Req() req: AuthenticatedRequest) {
    return this.usersService.requestLegalUpgrade(req.user.userId);
  }
}
