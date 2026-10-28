// api/src/livechat/livechat-public.controller.ts
//
// مسیرهای REST ویجت چت برای بازدیدکننده (از طریق BFF اپ). شناسایی بازدیدکننده با سرآیند
// x-livechat-token؛ کاربر واردشده (اختیاری) از توکن دسترسی همان درخواست.
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { LivechatService } from './livechat.service';
import { MessagesQueryDto, VisitorSessionDto } from './livechat.dto';
import { OptionalUserGuard } from './optional-user.guard';
import { contentDisposition } from '../common/file-security/content-disposition';

interface MaybeUserRequest extends Request {
  user?: { userId: string } | null;
}

@Controller('livechat')
export class LivechatPublicController {
  constructor(private readonly livechat: LivechatService) {}

  private async visitor(token: string | undefined) {
    const v = await this.livechat.visitorByToken(token);
    if (!v)
      throw new UnauthorizedException({
        message: 'نشست چت نامعتبر است',
        code: 'LIVECHAT_SESSION',
      });
    return v;
  }

  @Post('session')
  @UseGuards(OptionalUserGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  session(@Req() req: MaybeUserRequest, @Body() dto: VisitorSessionDto) {
    return this.livechat.createSession({
      token: dto.token,
      userId: req.user?.userId ?? null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      url: dto.url,
      title: dto.title,
      referrer: dto.referrer,
    });
  }

  @Get('messages')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async messages(
    @Headers('x-livechat-token') token: string,
    @Query() q: MessagesQueryDto,
  ) {
    const v = await this.visitor(token);
    return this.livechat.visitorHistory(v.id, q.before);
  }

  @Post('upload')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: Request,
    @Headers('x-livechat-token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('clientMessageId') clientMessageId?: string,
  ) {
    const v = await this.visitor(token);
    return this.livechat.visitorUpload(v.id, file, clientMessageId ?? null, {
      userId: v.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('attachments/:messageId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async attachment(
    @Headers('x-livechat-token') token: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Res() res: Response,
  ) {
    const v = await this.visitor(token);
    const f = await this.livechat.attachment(messageId, { visitorId: v.id });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', contentDisposition(f.name));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(f.buffer);
  }
}
