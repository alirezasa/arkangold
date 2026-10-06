// api/src/tickets/tickets.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TICKET_ATTACHMENT_POLICY } from '../common/file-security/upload-policies';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  CloseTicketDto,
  RateTicketDto,
} from '@arkan-gold/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { AllowMobileMismatch } from '../auth/decorators/allow-mobile-mismatch.decorator';
import { TicketsService } from './tickets.service';
import { OwnedResource } from '../common/audit/owned-resource.decorator';

interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  phone: string;
}
interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// پشتیبانی برای کاربرِ دارای شماره‌ی ناهمخوان با شاهکار هم باز می‌ماند تا بتواند راهنمایی بگیرد
@AllowMobileMismatch()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
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

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.getOneForUser(req.user.userId, id);
  }

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
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

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
  @Post(':id/attachments')
  // FPT_RVM_EXT.1.1 — سقف حجم و تعداد پیش از بافر شدن در حافظه
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: {
        fileSize: TICKET_ATTACHMENT_POLICY.maxBytes,
        files: 5,
        fields: 5,
        fieldSize: 1024,
      },
    }),
  )
  uploadAttachments(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body('messageId', new ParseUUIDPipe({ optional: true }))
    messageId?: string,
  ) {
    return this.ticketsService.uploadAttachment(
      req.user.userId,
      id,
      files,
      messageId,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
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

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
  @Post(':id/close')
  close(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CloseTicketDto,
  ) {
    return this.ticketsService.closeTicket(req.user.userId, id, dto.reason);
  }

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
  @Post(':id/reopen')
  reopen(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.reopenTicket(req.user.userId, id);
  }

  @OwnedResource({ model: 'ticket', ownerPath: 'userId' })
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
