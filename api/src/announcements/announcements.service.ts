// api/src/announcements/announcements.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './announcements.dto';

const USER_FEED_LIMIT = 30;

/** لینک اعلان فقط مسیر داخلی اپلیکیشن یا آدرس https مجاز است (جلوگیری از javascript: و ...) */
function normalizeLink(link?: string | null): string | null {
  const value = link?.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https:\/\/[^\s]+$/i.test(value)) return value;
  throw new BadRequestException(
    'لینک باید مسیر داخلی (مثلاً /dashboard/wallet) یا آدرس https باشد',
  );
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** شرط نمایش اعلان برای یک کاربر: فعال، منتشرشده، منقضی‌نشده و مخاطب همه یا خود کاربر */
  private visibleWhere(userId: string): Prisma.AnnouncementWhereInput {
    const now = new Date();
    return {
      isActive: true,
      publishedAt: { lte: now },
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        {
          OR: [
            { audience: 'ALL' },
            { audience: 'SELECTED', recipients: { some: { userId } } },
          ],
        },
      ],
    };
  }

  // ══════════════════════════════════════════
  // ── سمت کاربر ──
  // ══════════════════════════════════════════
  async listForUser(userId: string) {
    const where = this.visibleWhere(userId);
    const [items, unreadCount] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: USER_FEED_LIMIT,
        select: {
          id: true,
          title: true,
          body: true,
          link: true,
          level: true,
          publishedAt: true,
          reads: { where: { userId }, select: { readAt: true } },
        },
      }),
      this.prisma.announcement.count({
        where: { ...where, reads: { none: { userId } } },
      }),
    ]);

    return {
      unreadCount,
      items: items.map(({ reads, ...a }) => ({
        ...a,
        readAt: reads[0]?.readAt ?? null,
      })),
    };
  }

  async markRead(userId: string, announcementId: string) {
    const visible = await this.prisma.announcement.findFirst({
      where: { id: announcementId, ...this.visibleWhere(userId) },
      select: { id: true },
    });
    if (!visible) throw new NotFoundException('اعلان یافت نشد');

    await this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: {},
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    const unread = await this.prisma.announcement.findMany({
      where: { ...this.visibleWhere(userId), reads: { none: { userId } } },
      select: { id: true },
    });
    if (unread.length > 0) {
      await this.prisma.announcementRead.createMany({
        data: unread.map((a) => ({ announcementId: a.id, userId })),
        skipDuplicates: true,
      });
    }
    return { success: true, count: unread.length };
  }

  // ══════════════════════════════════════════
  // ── سمت ادمین ──
  // ══════════════════════════════════════════
  async adminList() {
    const items = await this.prisma.announcement.findMany({
      orderBy: { publishedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        recipients: {
          take: 50,
          include: { user: { select: { id: true, phone: true } } },
        },
        _count: { select: { reads: true, recipients: true } },
      },
    });
    return items.map(({ _count, ...a }) => ({
      ...a,
      readCount: _count.reads,
      recipientCount: _count.recipients,
    }));
  }

  async create(adminUserId: string, dto: CreateAnnouncementDto) {
    const audience = dto.audience ?? 'ALL';
    const userIds = [...new Set(dto.userIds ?? [])];
    if (audience === 'SELECTED' && userIds.length === 0) {
      throw new BadRequestException('حداقل یک کاربر دریافت‌کننده انتخاب کنید');
    }
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= publishedAt) {
      throw new BadRequestException('تاریخ انقضا باید بعد از زمان انتشار باشد');
    }

    return this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        link: normalizeLink(dto.link),
        level: dto.level ?? 'INFO',
        audience,
        isActive: dto.isActive ?? true,
        publishedAt,
        expiresAt,
        createdById: adminUserId,
        recipients:
          audience === 'SELECTED'
            ? { create: userIds.map((userId) => ({ userId })) }
            : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('اعلان یافت نشد');

    const expiresAt =
      dto.expiresAt === undefined
        ? undefined
        : dto.expiresAt
          ? new Date(dto.expiresAt)
          : null;
    if (expiresAt && expiresAt <= existing.publishedAt) {
      throw new BadRequestException('تاریخ انقضا باید بعد از زمان انتشار باشد');
    }

    return this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        body: dto.body?.trim(),
        link: dto.link === undefined ? undefined : normalizeLink(dto.link),
        level: dto.level,
        isActive: dto.isActive,
        expiresAt,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('اعلان یافت نشد');
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }
}
