// api/src/tickets/tickets.service.ts
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import {
  TicketStatus,
  TicketSenderType,
  TicketActivityAction,
  TICKET_STATUS_TRANSITIONS,
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  RateTicketDto,
} from '@arkan-gold/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { STORAGE_SERVICE, IStorageService } from './storage/storage.service';
import {
  buildTicketStorageKey,
  validateUploadedFile,
  getExtension,
  TICKET_MAX_FILES_PER_UPLOAD,
} from './tickets-file.util';
import {
  ticketCreatedSmsText,
  ticketNewUserMessageAdminSmsText,
  ticketStatusChangedSmsText,
} from './tickets-sms-messages.util';

type UploadedFileLike = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  // ---------------------------------------------------------------------
  // ایجاد تیکت
  // ---------------------------------------------------------------------
  async createTicket(userId: string, dto: CreateTicketDto) {
    const category = await this.prisma.ticketCategory.findFirst({
      where: { id: dto.categoryId, isActive: true, deletedAt: null },
    });
    if (!category) {
      throw new BadRequestException({
        message: 'دسته‌بندی انتخاب‌شده معتبر نیست',
        error_code: 'INVALID_CATEGORY',
      });
    }

    // هشدار تیکت مشابه اخیر (بخش ۲۰ اسپک) — فقط اطلاع‌رسانی، جلوگیری نمی‌کند
    const recentSimilar = await this.prisma.ticket.findFirst({
      where: {
        userId,
        categoryId: dto.categoryId,
        status: {
          in: [
            TicketStatus.OPEN,
            TicketStatus.IN_PROGRESS,
            TicketStatus.WAITING_FOR_USER,
          ],
        },
        createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) }, // ۲۴ ساعت اخیر
      },
      orderBy: { createdAt: 'desc' },
    });

    const ticket = await this.createTicketWithUniqueNumber(userId, dto);

    await this.logActivity(ticket.id, {
      userId,
      action: TicketActivityAction.TICKET_CREATED,
      metadata: { subject: dto.subject },
    });

    await this.notifications.notifyUserSms(
      userId,
      ticketCreatedSmsText(ticket.ticketNumber, ticket.subject),
    );

    return { ticket, similarTicket: recentSimilar ?? null };
  }

  /** تولید ticketNumber با retry روی برخورد یکتایی، مثل الگوی cardNumber شما */
  private async createTicketWithUniqueNumber(
    userId: string,
    dto: CreateTicketDto,
  ) {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const randomPart = Math.floor(10000000 + Math.random() * 89999999);
      const ticketNumber = `TKT-${year}-${randomPart}`;
      try {
        return await this.prisma.ticket.create({
          data: {
            ticketNumber,
            userId,
            categoryId: dto.categoryId,
            subject: dto.subject.trim(),
            description: dto.description.trim(),
            priority: dto.priority ?? 'NORMAL',
            status: TicketStatus.OPEN,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue; // برخورد یکتایی نادر — تلاش دوباره
        }
        throw err;
      }
    }
    throw new BadRequestException(
      'امکان ایجاد تیکت وجود ندارد، دوباره تلاش کنید',
    );
  }

  // ---------------------------------------------------------------------
  // لیست و مشاهده (فقط تیکت‌های خود کاربر — محافظت IDOR)
  // ---------------------------------------------------------------------
  async listMine(userId: string, query: ListTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where: Prisma.TicketWhereInput = {
      userId, // هرگز حذف نشود — مرز اصلی IDOR
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: 'insensitive' } },
              { ticketNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: { category: true },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** برمی‌گرداند و در همان کوئری مالکیت را چک می‌کند تا وجود/عدم‌وجود تیکت دیگران فاش نشود */
  async getOneForUser(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId, deletedAt: null },
      include: {
        category: true,
        assignedAdmin: { select: { id: true, fullName: true } },
        messages: {
          where: { isInternal: false, deletedAt: null }, // کاربر هرگز Internal Note نمی‌بیند
          orderBy: { createdAt: 'asc' },
          include: { attachments: true },
        },
        attachments: true,
        rating: true,
      },
    });
    if (!ticket) {
      throw new NotFoundException('تیکت یافت نشد');
    }
    return ticket;
  }

  private async assertOwnership(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId, deletedAt: null },
    });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    // Enum تولیدشده توسط Prisma و Enum پکیج Shared مقادیر یکسانی دارند
    return { ...ticket, status: ticket.status as unknown as TicketStatus };
  }

  // ---------------------------------------------------------------------
  // ارسال پیام توسط کاربر
  // ---------------------------------------------------------------------
  async addUserMessage(
    userId: string,
    ticketId: string,
    dto: CreateTicketMessageDto,
  ) {
    const ticket = await this.assertOwnership(userId, ticketId);

    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException({
        message: 'تیکت بسته شده است؛ ابتدا آن را بازگشایی کنید',
        error_code: 'TICKET_CLOSED',
      });
    }

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        userId,
        senderType: TicketSenderType.USER,
        message: dto.message.trim(),
        isInternal: false, // کاربر هرگز نمی‌تواند Internal ثبت کند
      },
    });

    const nextStatus =
      ticket.status === TicketStatus.WAITING_FOR_USER
        ? TicketStatus.OPEN
        : ticket.status;

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { lastMessageAt: new Date(), status: nextStatus },
    });

    await this.logActivity(ticketId, {
      userId,
      action: TicketActivityAction.MESSAGE_SENT,
      metadata: { messageId: message.id },
    });

    if (ticket.assignedAdminId) {
      const admin = await this.prisma.adminUser.findUnique({
        where: { id: ticket.assignedAdminId },
        select: { phone: true },
      });
      if (admin?.phone) {
        await this.notifications.notifyPhoneSms(
          admin.phone,
          ticketNewUserMessageAdminSmsText(ticket.ticketNumber),
        );
      }
    }

    return message;
  }

  // ---------------------------------------------------------------------
  // آپلود فایل ضمیمه
  // ---------------------------------------------------------------------
  async uploadAttachment(
    userId: string,
    ticketId: string,
    files: UploadedFileLike[],
    messageId?: string,
  ) {
    const ticket = await this.assertOwnership(userId, ticketId);
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('تیکت بسته است، امکان آپلود وجود ندارد');
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('فایلی ارسال نشده است');
    }
    if (files.length > TICKET_MAX_FILES_PER_UPLOAD) {
      throw new BadRequestException(
        `حداکثر ${TICKET_MAX_FILES_PER_UPLOAD} فایل در هر درخواست مجاز است`,
      );
    }

    if (messageId) {
      const msg = await this.prisma.ticketMessage.findFirst({
        where: { id: messageId, ticketId, userId },
      });
      if (!msg) throw new ForbiddenException('پیام معتبر نیست');
    }

    const created: Array<
      Awaited<ReturnType<typeof this.prisma.ticketAttachment.create>>
    > = [];
    for (const file of files) {
      validateUploadedFile(file);
      const { storageKey } = buildTicketStorageKey(
        userId,
        ticketId,
        file.originalname,
      );

      await this.storage.upload({
        key: storageKey,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      const record = await this.prisma.ticketAttachment.create({
        data: {
          ticketId,
          messageId: messageId ?? null,
          userId,
          originalFilename: file.originalname,
          storageKey,
          mimeType: file.mimetype,
          fileSize: file.size,
          extension: getExtension(file.originalname),
        },
      });
      created.push(record);

      await this.logActivity(ticketId, {
        userId,
        action: TicketActivityAction.FILE_UPLOADED,
        metadata: { attachmentId: record.id, filename: file.originalname },
      });
    }

    return created;
  }

  /** تولید Presigned URL کوتاه‌مدت برای دانلود — با بررسی مالکیت کاربر */
  async getAttachmentDownloadUrl(
    userId: string,
    ticketId: string,
    attachmentId: string,
  ) {
    await this.assertOwnership(userId, ticketId);
    return this.resolveAttachmentDownloadUrl(ticketId, attachmentId, {
      userId,
    });
  }

  /**
   * همان تولید Presigned URL برای سمت ادمین — بررسی محدوده دسترسی (Scope) قبلاً
   * در TicketsAdminService.assertScope انجام شده، این‌جا دیگر مالکیت کاربر چک نمی‌شود.
   */
  async getAttachmentDownloadUrlForAdmin(
    ticketId: string,
    attachmentId: string,
    adminId: string,
  ) {
    return this.resolveAttachmentDownloadUrl(ticketId, attachmentId, {
      adminId,
    });
  }

  private async resolveAttachmentDownloadUrl(
    ticketId: string,
    attachmentId: string,
    actor: { userId?: string; adminId?: string },
  ) {
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: { id: attachmentId, ticketId, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('فایل یافت نشد');

    const url = await this.storage.getSignedDownloadUrl(
      attachment.storageKey,
      300,
    );

    await this.logActivity(ticketId, {
      userId: actor.userId,
      adminId: actor.adminId,
      action: TicketActivityAction.FILE_DOWNLOADED,
      metadata: { attachmentId },
    });

    return { url, expiresInSeconds: 300 };
  }

  // ---------------------------------------------------------------------
  // بستن / بازگشایی
  // ---------------------------------------------------------------------
  async closeTicket(userId: string, ticketId: string, reason?: string) {
    const ticket = await this.assertOwnership(userId, ticketId);
    await this.transitionStatus(ticket, TicketStatus.CLOSED, {
      userId,
      changedByType: TicketSenderType.USER,
      reason,
    });
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { closedAt: new Date(), closedBy: userId, closedReason: reason },
    });
    await this.logActivity(ticketId, {
      userId,
      action: TicketActivityAction.TICKET_CLOSED,
    });
    return { success: true };
  }

  async reopenTicket(userId: string, ticketId: string) {
    const ticket = await this.assertOwnership(userId, ticketId);
    if (
      ticket.status !== TicketStatus.CLOSED &&
      ticket.status !== TicketStatus.RESOLVED
    ) {
      throw new BadRequestException(
        'فقط تیکت بسته یا حل‌شده قابل بازگشایی است',
      );
    }
    // محدودیت زمانی پیشنهادی: تا ۷ روز پس از بسته شدن قابل بازگشایی توسط خود کاربر
    if (
      ticket.closedAt &&
      Date.now() - ticket.closedAt.getTime() > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException({
        message: 'مهلت بازگشایی این تیکت گذشته است؛ لطفاً تیکت جدید ثبت کنید',
        error_code: 'REOPEN_WINDOW_EXPIRED',
      });
    }
    await this.transitionStatus(ticket, TicketStatus.REOPENED, {
      userId,
      changedByType: TicketSenderType.USER,
    });
    await this.logActivity(ticketId, {
      userId,
      action: TicketActivityAction.TICKET_REOPENED,
    });
    return { success: true };
  }

  async rateTicket(userId: string, ticketId: string, dto: RateTicketDto) {
    const ticket = await this.assertOwnership(userId, ticketId);
    if (
      ticket.status !== TicketStatus.RESOLVED &&
      ticket.status !== TicketStatus.CLOSED
    ) {
      throw new BadRequestException(
        'فقط تیکت حل‌شده یا بسته‌شده قابل امتیازدهی است',
      );
    }
    return this.prisma.ticketRating.upsert({
      where: { ticketId },
      create: { ticketId, userId, rating: dto.rating, comment: dto.comment },
      update: { rating: dto.rating, comment: dto.comment },
    });
  }

  // ---------------------------------------------------------------------
  // ابزارهای مشترک (توسط سرویس ادمین هم استفاده می‌شوند)
  // ---------------------------------------------------------------------
  async transitionStatus(
    ticket: {
      id: string;
      userId: string;
      ticketNumber: string;
      status: TicketStatus;
    },
    newStatus: TicketStatus,
    actor: {
      userId?: string;
      adminId?: string;
      changedByType: TicketSenderType;
      reason?: string;
    },
  ) {
    const allowed = TICKET_STATUS_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException({
        message: `تغییر وضعیت از ${ticket.status} به ${newStatus} مجاز نیست`,
        error_code: 'INVALID_STATUS_TRANSITION',
      });
    }

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: newStatus,
          ...(newStatus === TicketStatus.RESOLVED
            ? { resolvedAt: new Date() }
            : {}),
        },
      }),
      this.prisma.ticketStatusHistory.create({
        data: {
          ticketId: ticket.id,
          oldStatus: ticket.status,
          newStatus,
          changedBy: actor.userId ?? actor.adminId ?? 'system',
          changedByType: actor.changedByType,
          reason: actor.reason,
        },
      }),
    ]);

    await this.notifications.notifyUserSms(
      ticket.userId,
      ticketStatusChangedSmsText(ticket.ticketNumber, newStatus),
    );
  }

  async logActivity(
    ticketId: string,
    entry: {
      userId?: string;
      adminId?: string;
      action: TicketActivityAction;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.prisma.ticketActivityLog.create({
      data: {
        ticketId,
        userId: entry.userId,
        adminId: entry.adminId,
        action: entry.action,
        metadata: entry.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async listActiveCategories() {
    return this.prisma.ticketCategory.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
