// api/src/tickets/tickets.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  CloseTicketDto,
  RateTicketDto,
} from '@arkan-gold/shared';
// مسیر Guard را مطابق پروژه واقعی هماهنگ کنید (همان چیزی که در AuthController استفاده می‌شود)
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TicketsService } from './tickets.service';

interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  phone: string;
}
interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // ۱۰ تیکت در ساعت (بخش ۳۸ اسپک)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTicketDto) {
    return this.ticketsService.createTicket(req.user.userId, dto);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListTicketsQueryDto) {
    return this.ticketsService.listMine(req.user.userId, query);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.getOneForUser(req.user.userId, id);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 3600000 } }) // ۳۰ پیام در ساعت (بخش ۳۸ اسپک)
  addMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    // isInternal از سمت کاربر همیشه نادیده گرفته می‌شود
    return this.ticketsService.addUserMessage(req.user.userId, id, {
      message: dto.message,
    });
  }

  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 5))
  uploadAttachments(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body('messageId') messageId?: string,
  ) {
    return this.ticketsService.uploadAttachment(
      req.user.userId,
      id,
      files,
      messageId,
    );
  }

  @Get(':id/attachments/:attachmentId/download-url')
  getDownloadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.ticketsService.getAttachmentDownloadUrl(
      req.user.userId,
      id,
      attachmentId,
    );
  }

  @Post(':id/close')
  close(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CloseTicketDto,
  ) {
    return this.ticketsService.closeTicket(req.user.userId, id, dto.reason);
  }

  @Post(':id/reopen')
  reopen(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.reopenTicket(req.user.userId, id);
  }

  @Post(':id/rating')
  rate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RateTicketDto,
  ) {
    return this.ticketsService.rateTicket(req.user.userId, id, dto);
  }

  @Get('meta/categories')
  categories() {
    return this.ticketsService.listActiveCategories();
  }
}
