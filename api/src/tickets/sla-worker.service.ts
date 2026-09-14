// api/src/tickets/sla-worker.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  TicketStatus,
  TicketPriority,
  TicketActivityAction,
} from '@arkan-gold/shared';
import { PrismaService } from '../prisma/prisma.service';

// SLA پیش‌فرض بر اساس اولویت — بخش ۱۶ اسپک. بعداً می‌توانید از یک جدول system_config بخوانید.
const SLA_FIRST_RESPONSE_MINUTES: Record<TicketPriority, number> = {
  [TicketPriority.LOW]: 12 * 60,
  [TicketPriority.NORMAL]: 8 * 60,
  [TicketPriority.HIGH]: 4 * 60,
  [TicketPriority.URGENT]: 60,
};

const SLA_RESOLUTION_MINUTES: Record<TicketPriority, number> = {
  [TicketPriority.LOW]: 72 * 60,
  [TicketPriority.NORMAL]: 48 * 60,
  [TicketPriority.HIGH]: 24 * 60,
  [TicketPriority.URGENT]: 8 * 60,
};

@Injectable()
export class TicketsSlaWorkerService {
  private readonly logger = new Logger(TicketsSlaWorkerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSla() {
    const openTickets = await this.prisma.ticket.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [
            TicketStatus.OPEN,
            TicketStatus.IN_PROGRESS,
            TicketStatus.REOPENED,
          ],
        },
      },
      select: {
        id: true,
        priority: true,
        createdAt: true,
        firstResponseAt: true,
      },
    });

    const now = Date.now();
    let breached = 0;

    for (const ticket of openTickets) {
      const resolutionLimitMs =
        SLA_RESOLUTION_MINUTES[ticket.priority as TicketPriority] * 60_000;
      const isResolutionBreached =
        now - ticket.createdAt.getTime() > resolutionLimitMs;

      const firstResponseLimitMs =
        SLA_FIRST_RESPONSE_MINUTES[ticket.priority as TicketPriority] * 60_000;
      const isFirstResponseBreached =
        !ticket.firstResponseAt &&
        now - ticket.createdAt.getTime() > firstResponseLimitMs;

      if (isResolutionBreached || isFirstResponseBreached) {
        breached++;
        await this.prisma.ticketActivityLog.create({
          data: {
            ticketId: ticket.id,
            action: TicketActivityAction.SLA_BREACHED,
            metadata: { isResolutionBreached, isFirstResponseBreached },
          },
        });
        // TODO: اتصال به NotificationService واقعی برای اطلاع به ادمین/مدیر تیم
      }
    }

    if (breached > 0) {
      this.logger.warn(`SLA breach detected for ${breached} ticket(s)`);
    }
  }
}
