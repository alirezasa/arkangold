// api/src/livechat/livechat-admin.service.ts
// فهرست و جزئیات گفتگوها برای میز کار، مدیریت محتوا (دپارتمان، پاسخ سریع، منوی ربات، پایگاه
// دانش، پیام خودکار) و گزارش‌ها
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LivechatBotAction,
  LivechatConversationStatus as CS,
  Prisma,
} from '../generated/prisma';
import {
  LivechatRealtimeService,
  ROOM_ALL_OPS,
} from './livechat-realtime.service';
import { LivechatService, OperatorActor } from './livechat.service';
import { LivechatSmartService } from './livechat-smart.service';
import {
  CONVERSATION_SUMMARY_INCLUDE,
  MESSAGE_INCLUDE,
  toConversationSummary,
  toMessageDto,
} from './livechat.mappers';
import { normalizePersian } from './livechat-text.util';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { toEnglishDigits } from '../common/utils/jalali.util';
import type {
  BotNodeDto,
  CannedResponseDto,
  DepartmentDto,
  KnowledgeItemDto,
  ListConversationsQuery,
  TriggerDto,
  UpdateVisitorDto,
} from './livechat.dto';

const PAGE = 30;
const trimOrNull = (v: string | null | undefined) =>
  v == null ? v : v.trim() || null;
const cleanList = (v: string[] | undefined, max = 30) =>
  v === undefined
    ? undefined
    : [...new Set(v.map((x) => x.trim()).filter(Boolean))].slice(0, max);

@Injectable()
export class LivechatAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: LivechatRealtimeService,
    private readonly livechat: LivechatService,
    private readonly smart: LivechatSmartService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════
  //  گفتگوها
  // ══════════════════════════════════════════════════════════════════════

  async listConversations(actor: OperatorActor, q: ListConversationsQuery) {
    const where: Prisma.LivechatConversationWhereInput = {};
    const mineOrQueue: Prisma.LivechatConversationWhereInput = {
      OR: [
        { operatorId: actor.operatorId },
        { operatorId: null, status: { not: CS.CLOSED } },
      ],
    };
    switch (q.view) {
      case 'queue':
        Object.assign(where, {
          status: CS.WAITING,
          operatorId: null,
          isOffline: false,
        });
        break;
      case 'offline':
        Object.assign(where, {
          status: CS.WAITING,
          operatorId: null,
          isOffline: true,
        });
        break;
      case 'mine':
        Object.assign(where, { operatorId: actor.operatorId, status: CS.OPEN });
        break;
      case 'open':
        Object.assign(where, { status: CS.OPEN });
        break;
      case 'bot':
        Object.assign(where, { status: CS.BOT });
        break;
      case 'closed':
        Object.assign(where, { status: CS.CLOSED });
        break;
      default:
        break;
    }
    const and: Prisma.LivechatConversationWhereInput[] = [where];
    if (!actor.canViewAll) and.push(mineOrQueue);
    if (q.departmentId) and.push({ departmentId: q.departmentId });
    if (q.operatorId) and.push({ operatorId: q.operatorId });
    if (q.visitorId) and.push({ visitorId: q.visitorId });
    if (q.search?.trim()) {
      const s = q.search.trim();
      const num = Number(toEnglishDigits(s).replace(/^#/, ''));
      and.push({
        OR: [
          ...(Number.isInteger(num) && num > 0 && num < 2 ** 31
            ? [{ number: num }]
            : []),
          { visitor: { name: { contains: s, mode: 'insensitive' } } },
          { visitor: { phone: { contains: toEnglishDigits(s) } } },
          { subject: { contains: s, mode: 'insensitive' } },
          { tags: { has: s } },
          {
            messages: { some: { body: { contains: s, mode: 'insensitive' } } },
          },
        ],
      });
    }
    const rows = await this.prisma.livechatConversation.findMany({
      where: { AND: and },
      include: CONVERSATION_SUMMARY_INCLUDE,
      orderBy:
        q.view === 'queue' || q.view === 'offline'
          ? [{ queuedAt: 'asc' }, { createdAt: 'asc' }]
          : [{ lastMessageAt: 'desc' }],
      take: PAGE + 1,
      skip: q.cursor ? 1 : 0,
      ...(q.cursor ? { cursor: { id: q.cursor } } : {}),
    });
    const items = rows
      .slice(0, PAGE)
      .map((c) =>
        toConversationSummary(c, this.realtime.isVisitorOnline(c.visitorId)),
      );
    return {
      items,
      nextCursor: rows.length > PAGE ? items[items.length - 1]?.id : null,
    };
  }

  /** شمارنده‌های زبانه‌های میز کار */
  async counts(actor: OperatorActor) {
    const base = actor.canViewAll
      ? {}
      : { OR: [{ operatorId: actor.operatorId }, { operatorId: null }] };
    const [queue, offline, mine, open, bot, unread] = await Promise.all([
      this.prisma.livechatConversation.count({
        where: { status: CS.WAITING, operatorId: null, isOffline: false },
      }),
      this.prisma.livechatConversation.count({
        where: { status: CS.WAITING, operatorId: null, isOffline: true },
      }),
      this.prisma.livechatConversation.count({
        where: { status: CS.OPEN, operatorId: actor.operatorId },
      }),
      this.prisma.livechatConversation.count({
        where: { status: CS.OPEN, ...base },
      }),
      this.prisma.livechatConversation.count({ where: { status: CS.BOT } }),
      this.prisma.livechatConversation.aggregate({
        where: { status: CS.OPEN, operatorId: actor.operatorId },
        _sum: { unreadByOperator: true },
      }),
    ]);
    return {
      queue,
      offline,
      mine,
      open,
      bot,
      unreadMine: unread._sum.unreadByOperator ?? 0,
    };
  }

  async conversationDetail(actor: OperatorActor, id: string) {
    const conv = await this.livechat.canAccess(actor, id);
    if (!conv) throw new ForbiddenException('دسترسی به این گفتگو ندارید');
    const full = await this.prisma.livechatConversation.findUniqueOrThrow({
      where: { id },
      include: CONVERSATION_SUMMARY_INCLUDE,
    });
    const visitor = await this.visitorProfile(full.visitorId);
    return {
      conversation: toConversationSummary(
        full,
        this.realtime.isVisitorOnline(full.visitorId),
      ),
      extra: {
        startUrl: full.startUrl,
        ratingComment: full.ratingComment,
        firstResponseAt: full.firstResponseAt,
        closedBy: full.closedBy,
      },
      visitor,
      ...(await this.messages(actor, id)),
    };
  }

  async messages(
    actor: OperatorActor,
    conversationId: string,
    before?: string,
  ) {
    const conv = await this.livechat.canAccess(actor, conversationId);
    if (!conv) throw new ForbiddenException('دسترسی به این گفتگو ندارید');
    const rows = await this.prisma.livechatMessage.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 101,
      include: MESSAGE_INCLUDE,
    });
    return {
      messages: rows.slice(0, 100).reverse().map(toMessageDto),
      hasMore: rows.length > 100,
    };
  }

  async visitorProfile(visitorId: string) {
    const v = await this.prisma.livechatVisitor.findUnique({
      where: { id: visitorId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            status: true,
            createdAt: true,
            identity: {
              select: { firstName: true, lastName: true, status: true },
            },
          },
        },
      },
    });
    if (!v) throw new NotFoundException('بازدیدکننده یافت نشد');
    const [conversations, previous] = await Promise.all([
      this.prisma.livechatConversation.count({ where: { visitorId } }),
      this.prisma.livechatConversation.findMany({
        where: { visitorId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          number: true,
          status: true,
          subject: true,
          createdAt: true,
          rating: true,
          lastMessagePreview: true,
        },
      }),
    ]);
    const presence = this.realtime.visitors.get(visitorId);
    return {
      id: v.id,
      name: v.name,
      phone: v.phone,
      email: v.email,
      notes: v.notes,
      tags: v.tags,
      isBanned: v.isBanned,
      bannedReason: v.bannedReason,
      lastIp: v.lastIp,
      userAgent: v.userAgent,
      currentUrl: presence?.url ?? v.currentUrl,
      currentTitle: presence?.title ?? v.currentTitle,
      referrer: v.referrer,
      visitsCount: v.visitsCount,
      firstSeenAt: v.firstSeenAt,
      lastSeenAt: v.lastSeenAt,
      online: !!presence,
      user: v.user
        ? {
            id: v.user.id,
            phone: v.user.phone,
            status: v.user.status,
            createdAt: v.user.createdAt,
            fullName:
              [v.user.identity?.firstName, v.user.identity?.lastName]
                .filter(Boolean)
                .join(' ') || null,
            identityStatus: v.user.identity?.status ?? null,
          }
        : null,
      conversationsCount: conversations,
      previousConversations: previous,
    };
  }

  async updateConversation(
    actor: OperatorActor,
    id: string,
    dto: { tags?: string[]; subject?: string | null },
  ) {
    const conv = await this.livechat.canAccess(actor, id);
    if (!conv) throw new ForbiddenException('دسترسی به این گفتگو ندارید');
    await this.prisma.livechatConversation.update({
      where: { id },
      data: {
        tags: cleanList(dto.tags, 20),
        subject:
          dto.subject === undefined ? undefined : trimOrNull(dto.subject),
      },
    });
    await this.livechat.emitConversation(id, { toVisitor: false });
    return { ok: true };
  }

  async updateVisitor(visitorId: string, dto: UpdateVisitorDto) {
    let phone: string | null | undefined =
      dto.phone === undefined ? undefined : trimOrNull(dto.phone);
    if (phone) {
      phone = normalizeIranMobile(toEnglishDigits(phone));
      if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
    }
    const v = await this.prisma.livechatVisitor.update({
      where: { id: visitorId },
      data: {
        name: dto.name === undefined ? undefined : trimOrNull(dto.name),
        phone,
        email: dto.email === undefined ? undefined : trimOrNull(dto.email),
        notes: dto.notes === undefined ? undefined : trimOrNull(dto.notes),
        tags: cleanList(dto.tags),
      },
    });
    this.realtime.emit(ROOM_ALL_OPS, 'visitor:updated', {
      visitorId,
      name: v.name,
      phone: v.phone,
    });
    return this.visitorProfile(visitorId);
  }

  async setBan(visitorId: string, banned: boolean, reason?: string | null) {
    await this.prisma.livechatVisitor.update({
      where: { id: visitorId },
      data: banned
        ? {
            isBanned: true,
            bannedReason: trimOrNull(reason) ?? null,
            bannedAt: new Date(),
          }
        : { isBanned: false, bannedReason: null, bannedAt: null },
    });
    if (banned) {
      const active = await this.prisma.livechatConversation.findMany({
        where: { visitorId, status: { not: CS.CLOSED } },
        select: { id: true },
      });
      for (const c of active) await this.livechat.close(c.id, 'SYSTEM');
      const p = this.realtime.visitors.get(visitorId);
      if (p) this.realtime.disconnectSockets([...p.sockets], 'banned');
    }
    return this.visitorProfile(visitorId);
  }

  onlineVisitors() {
    return Promise.all(
      [...this.realtime.visitors.values()].map(async (p) => {
        const v = await this.prisma.livechatVisitor.findUnique({
          where: { id: p.visitorId },
          select: {
            id: true,
            name: true,
            phone: true,
            userId: true,
            visitsCount: true,
            isBanned: true,
          },
        });
        const active = await this.prisma.livechatConversation.findFirst({
          where: { visitorId: p.visitorId, status: { not: CS.CLOSED } },
          select: { id: true, status: true, operatorId: true },
        });
        return {
          visitorId: p.visitorId,
          name: v?.name ?? null,
          phone: v?.phone ?? null,
          isUser: !!v?.userId,
          visitsCount: v?.visitsCount ?? 1,
          url: p.url,
          title: p.title,
          connectedAt: p.connectedAt,
          activeConversation: active,
        };
      }),
    ).then((list) =>
      list.sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime()),
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  //  دپارتمان‌ها
  // ══════════════════════════════════════════════════════════════════════

  async departments() {
    const rows = await this.prisma.livechatDepartment.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { operators: true, conversations: true } } },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      isActive: d.isActive,
      sortOrder: d.sortOrder,
      operatorsCount: d._count.operators,
      conversationsCount: d._count.conversations,
    }));
  }

  createDepartment(dto: DepartmentDto) {
    return this.prisma.livechatDepartment.create({
      data: {
        name: dto.name.trim(),
        description: trimOrNull(dto.description) ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  updateDepartment(id: string, dto: Partial<DepartmentDto>) {
    return this.prisma.livechatDepartment.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        description:
          dto.description === undefined
            ? undefined
            : trimOrNull(dto.description),
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async deleteDepartment(id: string) {
    await this.prisma.livechatDepartment.delete({ where: { id } });
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  پاسخ‌های سریع
  // ══════════════════════════════════════════════════════════════════════

  canned(actor: OperatorActor) {
    return this.prisma.livechatCannedResponse.findMany({
      where: { OR: [{ operatorId: null }, { operatorId: actor.operatorId }] },
      orderBy: [{ usageCount: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      include: { department: { select: { id: true, name: true } } },
    });
  }

  private normalizeShortcut(s: string) {
    const v = s.trim().replace(/^\/+/, '').replace(/\s+/g, '-');
    if (!v) throw new BadRequestException('میانبر را وارد کنید');
    return v.slice(0, 40);
  }

  createCanned(
    actor: OperatorActor,
    dto: CannedResponseDto,
    canManage: boolean,
  ) {
    const shared = dto.shared !== false;
    if (shared && !canManage)
      throw new ForbiddenException(
        'ایجاد پاسخ سریع مشترک نیاز به دسترسی مدیریت چت دارد',
      );
    return this.prisma.livechatCannedResponse.create({
      data: {
        shortcut: this.normalizeShortcut(dto.shortcut),
        title: dto.title.trim(),
        body: dto.body.trim(),
        departmentId: dto.departmentId || null,
        operatorId: shared ? null : actor.operatorId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  private async ownCanned(
    actor: OperatorActor,
    id: string,
    canManage: boolean,
  ) {
    const row = await this.prisma.livechatCannedResponse.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('پاسخ سریع یافت نشد');
    if (row.operatorId ? row.operatorId !== actor.operatorId : !canManage) {
      throw new ForbiddenException('اجازه‌ی ویرایش این پاسخ سریع را ندارید');
    }
    return row;
  }

  async updateCanned(
    actor: OperatorActor,
    id: string,
    dto: Partial<CannedResponseDto>,
    canManage: boolean,
  ) {
    await this.ownCanned(actor, id, canManage);
    return this.prisma.livechatCannedResponse.update({
      where: { id },
      data: {
        shortcut: dto.shortcut
          ? this.normalizeShortcut(dto.shortcut)
          : undefined,
        title: dto.title?.trim() || undefined,
        body: dto.body?.trim() || undefined,
        departmentId:
          dto.departmentId === undefined ? undefined : dto.departmentId || null,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async deleteCanned(actor: OperatorActor, id: string, canManage: boolean) {
    await this.ownCanned(actor, id, canManage);
    await this.prisma.livechatCannedResponse.delete({ where: { id } });
    return { ok: true };
  }

  async useCanned(id: string) {
    await this.prisma.livechatCannedResponse
      .update({ where: { id }, data: { usageCount: { increment: 1 } } })
      .catch(() => undefined);
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  منوی ربات
  // ══════════════════════════════════════════════════════════════════════

  botNodes() {
    return this.prisma.livechatBotNode.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { department: { select: { id: true, name: true } } },
    });
  }

  private async validateNode(dto: Partial<BotNodeDto>, id?: string) {
    if (dto.parentId) {
      if (dto.parentId === id)
        throw new BadRequestException('گره نمی‌تواند والد خودش باشد');
      // جلوگیری از چرخه: والد جدید نباید از نوادگان همین گره باشد
      let cursor: string | null = dto.parentId;
      for (let i = 0; cursor && i < 50; i++) {
        if (cursor === id)
          throw new BadRequestException('ساختار منو نمی‌تواند چرخه داشته باشد');
        const parent: { parentId: string | null } | null =
          await this.prisma.livechatBotNode.findUnique({
            where: { id: cursor },
            select: { parentId: true },
          });
        if (!parent) throw new BadRequestException('گره والد یافت نشد');
        cursor = parent.parentId;
      }
    }
    if (dto.action === LivechatBotAction.LINK && dto.url !== undefined) {
      const url = (dto.url ?? '').trim();
      if (!/^(https:\/\/|\/)/.test(url) || url.startsWith('//')) {
        throw new BadRequestException(
          'نشانی پیوند باید با https:// یا / شروع شود',
        );
      }
    }
  }

  async createBotNode(dto: BotNodeDto) {
    await this.validateNode(dto);
    const max = await this.prisma.livechatBotNode.aggregate({
      where: { parentId: dto.parentId ?? null },
      _max: { sortOrder: true },
    });
    const node = await this.prisma.livechatBotNode.create({
      data: {
        parentId: dto.parentId || null,
        label: dto.label.trim(),
        action: dto.action,
        replyText: trimOrNull(dto.replyText) ?? null,
        url: trimOrNull(dto.url) ?? null,
        departmentId: dto.departmentId || null,
        keywords: cleanList(dto.keywords) ?? [],
        icon: trimOrNull(dto.icon) ?? null,
        audience: dto.audience ?? 'ALL',
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
      },
    });
    this.smart.invalidate();
    return node;
  }

  async updateBotNode(id: string, dto: Partial<BotNodeDto>) {
    const current = await this.prisma.livechatBotNode.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('گزینه یافت نشد');
    await this.validateNode(
      { ...dto, action: dto.action ?? current.action },
      id,
    );
    const node = await this.prisma.livechatBotNode.update({
      where: { id },
      data: {
        parentId: dto.parentId === undefined ? undefined : dto.parentId || null,
        label: dto.label?.trim() || undefined,
        action: dto.action,
        replyText:
          dto.replyText === undefined ? undefined : trimOrNull(dto.replyText),
        url: dto.url === undefined ? undefined : trimOrNull(dto.url),
        departmentId:
          dto.departmentId === undefined ? undefined : dto.departmentId || null,
        keywords: cleanList(dto.keywords),
        icon: dto.icon === undefined ? undefined : trimOrNull(dto.icon),
        audience: dto.audience,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
    this.smart.invalidate();
    return node;
  }

  async deleteBotNode(id: string) {
    await this.prisma.livechatBotNode.delete({ where: { id } });
    this.smart.invalidate();
    return { ok: true };
  }

  /** ترتیب جدید فرزندان یک والد */
  async reorderBotNodes(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.livechatBotNode.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    );
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  پایگاه دانش و پرسش‌های بی‌پاسخ
  // ══════════════════════════════════════════════════════════════════════

  knowledge() {
    return this.prisma.livechatKnowledgeItem.findMany({
      orderBy: [{ hits: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createKnowledge(dto: KnowledgeItemDto) {
    const item = await this.prisma.livechatKnowledgeItem.create({
      data: {
        question: dto.question.trim(),
        answer: dto.answer.trim(),
        variants: cleanList(dto.variants, 50) ?? [],
        keywords: cleanList(dto.keywords) ?? [],
        followUpNodeId: dto.followUpNodeId || null,
        isActive: dto.isActive ?? true,
      },
    });
    if (dto.fromUnansweredId)
      await this.resolveUnanswered(dto.fromUnansweredId);
    this.smart.invalidate();
    return item;
  }

  async updateKnowledge(id: string, dto: Partial<KnowledgeItemDto>) {
    const item = await this.prisma.livechatKnowledgeItem.update({
      where: { id },
      data: {
        question: dto.question?.trim() || undefined,
        answer: dto.answer?.trim() || undefined,
        variants: cleanList(dto.variants, 50),
        keywords: cleanList(dto.keywords),
        followUpNodeId:
          dto.followUpNodeId === undefined
            ? undefined
            : dto.followUpNodeId || null,
        isActive: dto.isActive,
      },
    });
    this.smart.invalidate();
    return item;
  }

  async deleteKnowledge(id: string) {
    await this.prisma.livechatKnowledgeItem.delete({ where: { id } });
    this.smart.invalidate();
    return { ok: true };
  }

  unanswered() {
    return this.prisma.livechatUnanswered.findMany({
      where: { resolvedAt: null },
      orderBy: [{ count: 'desc' }, { lastAskedAt: 'desc' }],
      take: 200,
    });
  }

  async resolveUnanswered(id: string) {
    await this.prisma.livechatUnanswered
      .update({ where: { id }, data: { resolvedAt: new Date() } })
      .catch(() => undefined);
    return { ok: true };
  }

  /** آزمایش پاسخ ربات به یک پرسش (بدون ثبت در گفتگو) */
  async testSmart(
    text: string,
    settings: Parameters<LivechatSmartService['find']>[1],
  ) {
    const r = await this.smart.find(text, settings, false);
    if (r.kind === 'kb') {
      const item = await this.prisma.livechatKnowledgeItem.findUnique({
        where: { id: r.id },
      });
      return {
        kind: 'kb',
        score: Math.round(r.score * 100),
        question: item?.question,
        answer: r.answer,
      };
    }
    if (r.kind === 'node') {
      const node = await this.prisma.livechatBotNode.findUnique({
        where: { id: r.id },
      });
      return {
        kind: 'node',
        score: Math.round(r.score * 100),
        label: node?.label,
        reply: node?.replyText,
      };
    }
    if (r.kind === 'suggest')
      return { kind: 'suggest', options: r.options.map((o) => o.label) };
    return { kind: 'none', normalized: normalizePersian(text) };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  پیام‌های خودکار
  // ══════════════════════════════════════════════════════════════════════

  triggers() {
    return this.prisma.livechatTrigger.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createTrigger(dto: TriggerDto) {
    return this.prisma.livechatTrigger.create({
      data: this.triggerData(dto) as Prisma.LivechatTriggerCreateInput,
    });
  }

  updateTrigger(id: string, dto: Partial<TriggerDto>) {
    return this.prisma.livechatTrigger.update({
      where: { id },
      data: this.triggerData(dto),
    });
  }

  private triggerData(
    dto: Partial<TriggerDto>,
  ): Prisma.LivechatTriggerUpdateInput {
    return {
      name: dto.name?.trim() || undefined,
      message: dto.message?.trim() || undefined,
      urlContains:
        dto.urlContains === undefined ? undefined : trimOrNull(dto.urlContains),
      delaySeconds: dto.delaySeconds,
      audience: dto.audience,
      onlyWhenOnline: dto.onlyWhenOnline,
      openWidget: dto.openWidget,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }

  async deleteTrigger(id: string) {
    await this.prisma.livechatTrigger.delete({ where: { id } });
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  گزارش‌ها
  // ══════════════════════════════════════════════════════════════════════

  async reports(fromRaw?: string, toRaw?: string) {
    const to = toRaw ? new Date(toRaw) : new Date();
    const from = fromRaw
      ? new Date(fromRaw)
      : new Date(to.getTime() - 30 * 24 * 3600_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw new BadRequestException('بازه‌ی زمانی نامعتبر است');
    const range = { gte: from, lte: to };
    const where = { createdAt: range };

    const [total, byStatus, botOnly, missed, offline, rated, ratingAgg] =
      await Promise.all([
        this.prisma.livechatConversation.count({ where }),
        this.prisma.livechatConversation.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.livechatConversation.count({
          where: { ...where, operatorId: null, queuedAt: null },
        }),
        this.prisma.livechatConversation.count({
          where: { ...where, isMissed: true },
        }),
        this.prisma.livechatConversation.count({
          where: { ...where, isOffline: true },
        }),
        this.prisma.livechatConversation.count({
          where: { ...where, rating: { not: null } },
        }),
        this.prisma.livechatConversation.aggregate({
          where: { ...where, rating: { not: null } },
          _avg: { rating: true },
        }),
      ]);

    // میانگین زمان انتظار تا تخصیص و زمان اولین پاسخ (ثانیه)
    const timing = await this.prisma.$queryRaw<
      {
        avg_wait: number | null;
        avg_first: number | null;
        avg_duration: number | null;
      }[]
    >`
      SELECT
        AVG(EXTRACT(EPOCH FROM (assigned_at - queued_at))) FILTER (WHERE assigned_at IS NOT NULL AND queued_at IS NOT NULL AND assigned_at >= queued_at AND NOT is_offline) AS avg_wait,
        AVG(EXTRACT(EPOCH FROM (first_response_at - COALESCE(queued_at, created_at)))) FILTER (WHERE first_response_at IS NOT NULL AND NOT is_offline) AS avg_first,
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at))) FILTER (WHERE closed_at IS NOT NULL AND operator_id IS NOT NULL) AS avg_duration
      FROM livechat_conversations
      WHERE created_at >= ${from} AND created_at <= ${to}`;

    const daily = await this.prisma.$queryRaw<
      { day: string; total: bigint; with_operator: bigint; missed: bigint }[]
    >`
      SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS day,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE operator_id IS NOT NULL) AS with_operator,
             COUNT(*) FILTER (WHERE is_missed) AS missed
      FROM livechat_conversations
      WHERE created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1 ORDER BY 1`;

    const hourly = await this.prisma.$queryRaw<
      { hour: number; total: bigint }[]
    >`
      SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::int AS hour, COUNT(*) AS total
      FROM livechat_conversations
      WHERE created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1 ORDER BY 1`;

    const perOperator = await this.prisma.$queryRaw<
      {
        operator_id: string;
        conversations: bigint;
        avg_rating: number | null;
        rated: bigint;
        avg_first: number | null;
        messages: bigint;
      }[]
    >`
      SELECT c.operator_id,
             COUNT(DISTINCT c.id) AS conversations,
             AVG(c.rating) AS avg_rating,
             COUNT(c.rating) AS rated,
             AVG(EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.assigned_at, c.created_at)))) FILTER (WHERE c.first_response_at IS NOT NULL AND NOT c.is_offline) AS avg_first,
             (SELECT COUNT(*) FROM livechat_messages m WHERE m.operator_id = c.operator_id AND m.created_at >= ${from} AND m.created_at <= ${to} AND m.sender_type = 'OPERATOR' AND NOT m.is_internal) AS messages
      FROM livechat_conversations c
      WHERE c.operator_id IS NOT NULL AND c.created_at >= ${from} AND c.created_at <= ${to}
      GROUP BY c.operator_id`;
    const ops = await this.prisma.livechatOperator.findMany({
      select: { id: true, displayName: true },
    });
    const opName = new Map(ops.map((o) => [o.id, o.displayName]));

    const topNodes = await this.prisma.livechatBotNode.findMany({
      where: { hits: { gt: 0 } },
      orderBy: { hits: 'desc' },
      take: 10,
      select: { id: true, label: true, hits: true },
    });
    const topKnowledge = await this.prisma.livechatKnowledgeItem.findMany({
      where: { hits: { gt: 0 } },
      orderBy: { hits: 'desc' },
      take: 10,
      select: {
        id: true,
        question: true,
        hits: true,
        helpful: true,
        notHelpful: true,
      },
    });
    const ratingDist = await this.prisma.livechatConversation.groupBy({
      by: ['rating'],
      where: { ...where, rating: { not: null } },
      _count: { _all: true },
    });

    const t = timing[0] ?? {
      avg_wait: null,
      avg_first: null,
      avg_duration: null,
    };
    return {
      from,
      to,
      totals: {
        total,
        botOnly,
        withOperator: total - botOnly,
        missed,
        offline,
        rated,
        avgRating: ratingAgg._avg.rating
          ? Number(ratingAgg._avg.rating.toFixed(2))
          : null,
        avgWaitSeconds:
          t.avg_wait != null ? Math.round(Number(t.avg_wait)) : null,
        avgFirstResponseSeconds:
          t.avg_first != null ? Math.round(Number(t.avg_first)) : null,
        avgDurationSeconds:
          t.avg_duration != null ? Math.round(Number(t.avg_duration)) : null,
      },
      byStatus: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count._all]),
      ),
      daily: daily.map((d) => ({
        day: d.day,
        total: Number(d.total),
        withOperator: Number(d.with_operator),
        missed: Number(d.missed),
      })),
      hourly: hourly.map((h) => ({
        hour: Number(h.hour),
        total: Number(h.total),
      })),
      perOperator: perOperator
        .map((p) => ({
          operatorId: p.operator_id,
          name: opName.get(p.operator_id) ?? '—',
          conversations: Number(p.conversations),
          messages: Number(p.messages),
          rated: Number(p.rated),
          avgRating:
            p.avg_rating != null
              ? Number(Number(p.avg_rating).toFixed(2))
              : null,
          avgFirstResponseSeconds:
            p.avg_first != null ? Math.round(Number(p.avg_first)) : null,
        }))
        .sort((a, b) => b.conversations - a.conversations),
      ratingDistribution: Object.fromEntries(
        ratingDist.map((r) => [String(r.rating), r._count._all]),
      ),
      topNodes,
      topKnowledge,
      unansweredOpen: await this.prisma.livechatUnanswered.count({
        where: { resolvedAt: null },
      }),
    };
  }
}
