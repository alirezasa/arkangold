// api/src/auth/step-up.controller.ts
// FTA_TSE_EXT.4.2 — شروع و تأیید «تأیید ثانویه» پیش از عملیات حساس کاربر
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { IsIn, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  STEP_UP_PURPOSES,
  StepUpPurpose,
  StepUpService,
} from '../common/auth-security/step-up.service';

class StartStepUpDto {
  @IsIn(Object.keys(STEP_UP_PURPOSES))
  purpose!: StepUpPurpose;
}

class VerifyStepUpDto {
  @IsString()
  @Length(20, 100)
  challengeToken!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}

interface AuthedRequest extends Request {
  user: { userId: string; sessionId: string };
}

@Controller('auth/step-up')
@UseGuards(JwtAuthGuard)
export class StepUpController {
  constructor(private stepUp: StepUpService) {}

  @Post('start')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  start(@Body() dto: StartStepUpDto, @Req() req: AuthedRequest) {
    return this.stepUp.start(req.user.userId, req.user.sessionId, dto.purpose);
  }

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() dto: VerifyStepUpDto, @Req() req: AuthedRequest) {
    return this.stepUp.verify(
      req.user.userId,
      req.user.sessionId,
      dto.challengeToken,
      dto.code,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }
}
