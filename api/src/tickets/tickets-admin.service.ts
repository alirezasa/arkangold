// api/src/tickets/tickets-admin.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import {
  TicketSenderType,
  TicketActivityAction,
  TicketPriority,
  AssignTicketDto,
  ChangeTicketStatusDto,
  ChangeTicketPriorityDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  CreateTicketCategoryDto,
  UpdateTicketCategoryDto,
  TicketStatus,
} from '@arkan-gold/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from './tickets.service';
import {
  ticketAdminReplySmsText,
  ticketAssignedAdminSmsText,
} from './tickets-sms-messages.util';

interface AdminActor {
  adminId: string;
  /** آیا این ادمین اجازه دیدن همه تیکت‌ها را دارد یا فقط تیکت‌های اختصاص‌یافته به خودش (بخش ۲۲ اسپک) */
  canViewAll: boolean;
}

@Injectable()
export class TicketsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService, // reuse: transitionStatus / logActivity
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------
  // لیست همه تیکت‌ها (با Scoping بر اساس Permission)
  // ---------------------------------------------------------------------
  async listAll(actor: AdminActor, query: ListTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where: Prisma.TicketWhereInput = {
      deletedAt: null,
      ...(actor.canViewAll ? {} : { assignedAdminId: actor.adminId }),
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.priority
        ? {
            priority: query.priority,
          }
        : {}),
      ...(query.assignedAdminId
        ? { assignedAdminId: query.assignedAdminId }
        : {}),
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
        include: {
          category: true,
          user: { select: { id: true, phone: true } },
          assignedAdmin: { select: { id: true, fullName: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOne(actor: AdminActor, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        deletedAt: null,
        ...(actor.canViewAll ? {} : { assignedAdminId: actor.adminId }),
      },
      include: {
        category: true,
        user: { select: { id: true, phone: true } },
        assignedAdmin: { select: { id: true, fullName: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { attachments: true },
        },
        attachments: true,
        assignments: { orderBy: { createdAt: 'desc' } },
        statusLogs: { orderBy: { createdAt: 'desc' } },
        rating: true,
      },
    });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد یا دسترسی ندارید');
    return ticket;
  }

  private async assertScope(actor: AdminActor, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        deletedAt: null,
        ...(actor.canViewAll ? {} : { assignedAdminId: actor.adminId }),
      },
    });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد یا دسترسی ندارید');
    return ticket;
  }

  async getAttachmentDownloadUrl(
    actor: AdminActor,
    ticketId: string,
    attachmentId: string,
  ) {
    await this.assertScope(actor, ticketId);
    return this.ticketsService.getAttachmentDownloadUrlForAdmin(
      ticketId,
      attachmentId,
      actor.adminId,
    );
  }

  // ---------------------------------------------------------------------
  // ارجاع تیکت (Assign / Reassign)
  // ---------------------------------------------------------------------
  async assign(actor: AdminActor, ticketId: string, dto: AssignTicketDto) {
    const ticket = await this.assertScope(actor, ticketId);
    const isReassign = !!ticket.assignedAdminId;
    const status = ticket.status as unknown as TicketStatus;

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: { assignedAdminId: dto.adminId },
      }),
      this.prisma.ticketAssignment.create({
        data: {
          ticketId,
          assignedAdminId: dto.adminId,
          assignedBy: actor.adminId,
          assignmentReason: dto.reason,
        },
      }),
    ]);

    // اولین ارجاع یک تیکت باز، آن را به‌طور خودکار «در حال بررسی» می‌کند — از
    // همان مسیر transitionStatus عبور می‌کند تا هم در تاریخچه وضعیت ثبت شود
    // هم پیامک اطلاع‌رسانی به کاربر ارسال شود.
    if (status === TicketStatus.OPEN) {
      await this.ticketsService.transitionStatus(
        {
          id: ticketId,
          userId: ticket.userId,
          ticketNumber: ticket.ticketNumber,
          status,
        },
        TicketStatus.IN_PROGRESS,
        {
          adminId: actor.adminId,
          changedByType: TicketSenderType.ADMIN,
          reason: 'ارجاع خودکار به کارشناس',
        },
      );
    }

    await this.ticketsService.logActivity(ticketId, {
      adminId: actor.adminId,
      action: isReassign
        ? TicketActivityAction.TICKET_REASSIGNED
        : TicketActivityAction.TICKET_ASSIGNED,
      metadata: { assignedAdminId: dto.adminId, reason: dto.reason },
    });

    const assignedAdmin = await this.prisma.adminUser.findUnique({
      where: { id: dto.adminId },
      select: { phone: true },
    });
    if (assignedAdmin?.phone) {
      await this.notifications.notifyPhoneSms(
        assignedAdmin.phone,
        ticketAssignedAdminSmsText(ticket.ticketNumber, ticket.subject),
      );
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------
  // تغییر وضعیت / اولویت
  // ---------------------------------------------------------------------
  async changeStatus(
    actor: AdminActor,
    ticketId: string,
    dto: ChangeTicketStatusDto,
  ) {
    const ticket = await this.assertScope(actor, ticketId);

    // Casting هماهنگ‌کننده بین Prisma Model و پکیج Shared
    await this.ticketsService.transitionStatus(
      {
        ...ticket,
        status: ticket.status as unknown as TicketStatus,
      },
      dto.status,
      {
        adminId: actor.adminId,
        changedByType: TicketSenderType.ADMIN,
        reason: dto.reason,
      },
    );

    if (dto.status === TicketStatus.CLOSED) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          closedAt: new Date(),
          closedBy: actor.adminId,
          closedReason: dto.reason,
        },
      });
    }

    await this.ticketsService.logActivity(ticketId, {
      adminId: actor.adminId,
      action:
        dto.status === TicketStatus.RESOLVED
          ? TicketActivityAction.TICKET_RESOLVED
          : dto.status === TicketStatus.CLOSED
            ? TicketActivityAction.TICKET_CLOSED
            : TicketActivityAction.STATUS_CHANGED,
      metadata: { newStatus: dto.status, reason: dto.reason },
    });

    return { success: true };
  }

  async changePriority(
    actor: AdminActor,
    ticketId: string,
    dto: ChangeTicketPriorityDto,
  ) {
    await this.assertScope(actor, ticketId);
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        priority: dto.priority,
      },
    });
    await this.ticketsService.logActivity(ticketId, {
      adminId: actor.adminId,
      action: TicketActivityAction.PRIORITY_CHANGED,
      metadata: { newPriority: dto.priority },
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------
  // پاسخ ادمین / یادداشت داخلی
  // ---------------------------------------------------------------------
  async addMessage(
    actor: AdminActor,
    ticketId: string,
    dto: CreateTicketMessageDto,
  ) {
    const ticket = await this.assertScope(actor, ticketId);
    const isInternal = !!dto.isInternal;

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        adminId: actor.adminId,
        senderType: TicketSenderType.ADMIN,
        message: dto.message.trim(),
        isInternal,
      },
    });

    if (!isInternal) {
      // پاسخ عمومی → منتظر پاسخ کاربر، ثبت اولین پاسخ برای SLA
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          lastMessageAt: new Date(),
          status: TicketStatus.WAITING_FOR_USER,
          firstResponseAt: ticket.firstResponseAt ?? new Date(),
        },
      });

      await this.notifications.notifyUserSms(
        ticket.userId,
        ticketAdminReplySmsText(ticket.ticketNumber),
      );
    }

    await this.ticketsService.logActivity(ticketId, {
      adminId: actor.adminId,
      action: isInternal
        ? TicketActivityAction.INTERNAL_NOTE_ADDED
        : TicketActivityAction.MESSAGE_SENT,
      metadata: { messageId: message.id },
    });

    return message;
  }

  // ---------------------------------------------------------------------
  // دسته‌بندی‌ها (CRUD)
  // ---------------------------------------------------------------------
  async listCategories() {
    return this.prisma.ticketCategory.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createCategory(dto: CreateTicketCategoryDto) {
    return this.prisma.ticketCategory.create({ data: dto });
  }

  async updateCategory(id: string, dto: UpdateTicketCategoryDto) {
    const category = await this.prisma.ticketCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    return this.prisma.ticketCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.ticketCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    // Soft delete — و همزمان غیرفعال تا در ایجاد تیکت جدید انتخاب نشود
    return this.prisma.ticketCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ---------------------------------------------------------------------
  // Dashboard خلاصه
  // ---------------------------------------------------------------------
  async dashboardSummary() {
    const [
      total,
      open,
      inProgress,
      waitingForUser,
      resolved,
      closed,
      urgent,
      unassigned,
    ] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where: { deletedAt: null } }),
      this.prisma.ticket.count({
        where: {
          status: TicketStatus.OPEN,
          deletedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: TicketStatus.IN_PROGRESS,
          deletedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: TicketStatus.WAITING_FOR_USER,
          deletedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: TicketStatus.RESOLVED,
          deletedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: TicketStatus.CLOSED,
          deletedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          priority: TicketPriority.URGENT,
          deletedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: { assignedAdminId: null, deletedAt: null },
      }),
    ]);

    return {
      total,
      open,
      inProgress,
      waitingForUser,
      resolved,
      closed,
      urgent,
      unassigned,
    };
  }
}
