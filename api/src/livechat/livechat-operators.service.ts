// api/src/livechat/livechat-operators.service.ts
// پروفایل اپراتورها، وضعیت حضور، بلیت اتصال سوکت میز کار
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LivechatOperatorStatus } from '../generated/prisma';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import {
  LivechatRealtimeService,
  ROOM_ALL_OPS,
  ROOM_OPS,
} from './livechat-realtime.service';
import { LivechatService, OperatorActor } from './livechat.service';

const TICKET_TTL_SECONDS = 60;
const ticketKey = (t: string) => `livechat:ticket:${t}`;

export interface SocketTicket {
  adminUserId: string;
  sessionId: string;
  permissions: string[];
}

@Injectable()
export class LivechatOperatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: LivechatRealtimeService,
    private readonly livechat: LivechatService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /** پروفایل اپراتور (در اولین ورود به میز کار ساخته می‌شود) */
  async ensure(adminUserId: string) {
    const existing = await this.prisma.livechatOperator.findUnique({
      where: { adminUserId },
    });
    if (existing) return existing;
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: { fullName: true },
    });
    return this.prisma.livechatOperator.upsert({
      where: { adminUserId },
      create: {
        adminUserId,
        displayName: admin?.fullName?.trim() || 'کارشناس پشتیبانی',
      },
      update: {},
    });
  }

  async actorFor(user: AdminAuthenticatedUser): Promise<OperatorActor> {
    const op = await this.ensure(user.adminUserId);
    if (!op.isActive)
      throw new BadRequestException('حساب اپراتوری شما غیرفعال شده است');
    return {
      operatorId: op.id,
      adminUserId: user.adminUserId,
      displayName: op.displayName,
      canViewAll: user.permissions.includes('livechat.view_all'),
    };
  }

  async me(user: AdminAuthenticatedUser) {
    const op = await this.ensure(user.adminUserId);
    const departments = await this.prisma.livechatOperatorDepartment.findMany({
      where: { operatorId: op.id },
      include: { department: { select: { id: true, name: true } } },
    });
    return {
      ...op,
      connected: this.realtime.isOperatorConnected(op.id),
      departments: departments.map((d) => d.department),
      permissions: user.permissions.filter((p) => p.startsWith('livechat.')),
    };
  }

  async updateMe(
    user: AdminAuthenticatedUser,
    dto: {
      displayName?: string;
      title?: string | null;
      avatarUrl?: string | null;
      maxConcurrentChats?: number;
      acceptsAutoAssign?: boolean;
    },
  ) {
    const op = await this.ensure(user.adminUserId);
    await this.prisma.livechatOperator.update({
      where: { id: op.id },
      data: {
        displayName: dto.displayName?.trim() || undefined,
        title: dto.title === undefined ? undefined : dto.title?.trim() || null,
        avatarUrl:
          dto.avatarUrl === undefined
            ? undefined
            : dto.avatarUrl?.trim() || null,
        maxConcurrentChats: dto.maxConcurrentChats,
        acceptsAutoAssign: dto.acceptsAutoAssign,
      },
    });
    return this.me(user);
  }

  async setStatus(operatorId: string, status: LivechatOperatorStatus) {
    await this.prisma.livechatOperator.update({
      where: { id: operatorId },
      data: { status, lastSeenAt: new Date() },
    });
    this.realtime.setOperatorStatus(operatorId, status);
    await this.presenceChanged();
    if (status === LivechatOperatorStatus.ONLINE)
      await this.livechat.drainQueue();
    return { status };
  }

  /** اعلام حضور اپراتورها به میز کار و دسترس‌پذیری به بازدیدکنندگان */
  async presenceChanged() {
    this.realtime.emit(
      [ROOM_OPS, ROOM_ALL_OPS],
      'operators:presence',
      await this.presence(),
    );
    await this.livechat.broadcastAvailability();
  }

  async presence() {
    const ops = await this.prisma.livechatOperator.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        title: true,
        avatarUrl: true,
        maxConcurrentChats: true,
      },
      orderBy: { displayName: 'asc' },
    });
    const loads = await this.prisma.livechatConversation.groupBy({
      by: ['operatorId'],
      where: { status: 'OPEN', operatorId: { not: null } },
      _count: { _all: true },
    });
    const load = new Map(loads.map((l) => [l.operatorId, l._count._all]));
    return ops.map((o) => {
      const p = this.realtime.operators.get(o.id);
      return {
        ...o,
        connected: !!p,
        status: p ? p.status : 'OFFLINE',
        activeChats: load.get(o.id) ?? 0,
      };
    });
  }

  async issueTicket(user: AdminAuthenticatedUser) {
    await this.ensure(user.adminUserId);
    const ticket = randomBytes(24).toString('base64url');
    const value: SocketTicket = {
      adminUserId: user.adminUserId,
      sessionId: user.sessionId,
      permissions: user.permissions,
    };
    await this.redis.set(
      ticketKey(ticket),
      JSON.stringify(value),
      'EX',
      TICKET_TTL_SECONDS,
    );
    return { ticket, expiresIn: TICKET_TTL_SECONDS };
  }

  /** مصرف یک‌باره‌ی بلیت اتصال */
  async consumeTicket(ticket: string): Promise<SocketTicket | null> {
    if (!ticket || ticket.length > 100) return null;
    const raw = await this.redis.getdel(ticketKey(ticket));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SocketTicket;
    } catch {
      return null;
    }
  }

  // ── مدیریت اپراتورها (livechat.manage) ──

  async list() {
    // همه‌ی ادمین‌های فعال دارای دسترسی چت، حتی اگر هنوز وارد میز کار نشده‌اند
    const admins = await this.prisma.adminUser.findMany({
      where: {
        isActive: true,
        agentId: null,
        roles: {
          some: {
            role: {
              OR: [
                { key: 'SUPER_ADMIN' },
                {
                  permissions: {
                    some: { permission: { key: 'livechat.view' } },
                  },
                },
              ],
            },
          },
        },
      },
      select: { id: true, fullName: true, username: true },
    });
    for (const a of admins) await this.ensure(a.id);
    const presence = new Map((await this.presence()).map((p) => [p.id, p]));
    const ops = await this.prisma.livechatOperator.findMany({
      include: {
        adminUser: {
          select: { fullName: true, username: true, isActive: true },
        },
        departments: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return ops
      .filter((o) => o.adminUser.isActive)
      .map((o) => ({
        id: o.id,
        adminUserId: o.adminUserId,
        fullName: o.adminUser.fullName,
        username: o.adminUser.username,
        displayName: o.displayName,
        title: o.title,
        avatarUrl: o.avatarUrl,
        isActive: o.isActive,
        maxConcurrentChats: o.maxConcurrentChats,
        acceptsAutoAssign: o.acceptsAutoAssign,
        lastSeenAt: o.lastSeenAt,
        departments: o.departments.map((d) => d.department),
        connected: presence.get(o.id)?.connected ?? false,
        status: presence.get(o.id)?.status ?? 'OFFLINE',
        activeChats: presence.get(o.id)?.activeChats ?? 0,
      }));
  }

  async update(
    id: string,
    dto: {
      displayName?: string;
      title?: string | null;
      avatarUrl?: string | null;
      maxConcurrentChats?: number;
      acceptsAutoAssign?: boolean;
      isActive?: boolean;
      departmentIds?: string[];
    },
  ) {
    const op = await this.prisma.livechatOperator.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('اپراتور یافت نشد');
    await this.prisma.$transaction(async (tx) => {
      await tx.livechatOperator.update({
        where: { id },
        data: {
          displayName: dto.displayName?.trim() || undefined,
          title:
            dto.title === undefined ? undefined : dto.title?.trim() || null,
          avatarUrl:
            dto.avatarUrl === undefined
              ? undefined
              : dto.avatarUrl?.trim() || null,
          maxConcurrentChats: dto.maxConcurrentChats,
          acceptsAutoAssign: dto.acceptsAutoAssign,
          isActive: dto.isActive,
        },
      });
      if (dto.departmentIds) {
        await tx.livechatOperatorDepartment.deleteMany({
          where: { operatorId: id },
        });
        if (dto.departmentIds.length) {
          await tx.livechatOperatorDepartment.createMany({
            data: [...new Set(dto.departmentIds)].map((departmentId) => ({
              operatorId: id,
              departmentId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });
    if (dto.isActive === false) {
      const p = this.realtime.operators.get(id);
      if (p)
        this.realtime.disconnectSockets([...p.sockets], 'operator_disabled');
    }
    await this.presenceChanged();
    return { ok: true };
  }
}
