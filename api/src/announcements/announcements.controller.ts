// api/src/announcements/announcements.controller.ts
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnnouncementsService } from './announcements.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

// اعلان‌های زنگوله اپلیکیشن کاربر
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'لیست اعلان‌های کاربر و تعداد خوانده‌نشده‌ها' })
  list(@Req() req: AuthenticatedRequest) {
    return this.service.listForUser(req.user.userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'علامت‌گذاری همه اعلان‌ها به‌عنوان خوانده‌شده' })
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.service.markAllRead(req.user.userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'علامت‌گذاری یک اعلان به‌عنوان خوانده‌شده' })
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markRead(req.user.userId, id);
  }
}
