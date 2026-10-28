// api/src/livechat/livechat.service.ts
//
// موتور گفتگو: نشست بازدیدکننده، ارسال پیام، ربات منو و حالت هوشمند، صف و تخصیص اپراتور،
// حالت آفلاین (فرم تماس و پیامک)، انتقال، بستن و امتیازدهی. همه‌ی تغییرات از همین سرویس
// به اتاق‌های Socket.IO اعلام می‌شوند تا بازدیدکننده و میز کار اپراتورها هم‌زمان به‌روز شوند.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PriceService } from '../market/price.service';
import {
  LivechatBotAction,
  LivechatConversation,
  LivechatConversationStatus as CS,
  LivechatMessageType as MT,
  LivechatSenderType as ST,
  LivechatVisitor,
  Prisma,
} from '../generated/prisma';
import { LivechatSettingsService } from './livechat-settings.service';
import { LivechatSettingsData } from './livechat-settings.types';
import {
  LivechatRealtimeService,
  ROOM_ALL_OPS,
  ROOM_OPS,
  operatorRoom,
  visitorRoom,
} from './livechat-realtime.service';
import { LivechatBotService } from './livechat-bot.service';
import { LivechatSmartService } from './livechat-smart.service';
import { LivechatStorageService } from './livechat-storage.service';
import {
  BotOption,
  CONVERSATION_SUMMARY_INCLUDE,
  ConversationWithSummary,
  MESSAGE_INCLUDE,
  MessageDto,
  previewOf,
  renderTemplate,
  toConversationSummary,
  toMessageDto,
  toVisitorConversationDto,
} from './livechat.mappers';
import { containsPhrase } from './livechat-text.util';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { toEnglishDigits } from '../common/utils/jalali.util';
import {
  FileSecurityService,
  UploadActor,
} from '../common/file-security/file-security.service';
import { CHAT_ATTACHMENT_POLICY } from '../common/file-security/upload-policies';

export const ROOM_VISITORS = 'visitors';
const HISTORY_PAGE = 50;
const ACTIVE = [CS.BOT, CS.WAITING, CS.OPEN];

export interface OperatorActor {
  operatorId: string;
  adminUserId: string;
  displayName: string;
  canViewAll: boolean;
}

export interface SessionInput {
  token?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  url?: string | null;
  title?: string | null;
  referrer?: string | null;
}

interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface FormField {
  name: 'name' | 'phone' | 'email' | 'department' | 'message';
  label: string;
  required: boolean;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** نشانی صفحه/ارجاع‌دهنده از مرورگر بازدیدکننده می‌آید: فقط http(s) پذیرفته می‌شود (نه javascript: و ...) */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? u.href.slice(0, 500)
      : null;
  } catch {
    return null;
  }
}
const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

@Injectable()
export class LivechatService implements OnModuleInit {
  private readonly logger = new Logger(LivechatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: LivechatSettingsService,
    private readonly realtime: LivechatRealtimeService,
    private readonly bot: LivechatBotService,
    private readonly smart: LivechatSmartService,
    private readonly storage: LivechatStorageService,
    private readonly notifications: NotificationsService,
    private readonly price: PriceService,
    private readonly fileSecurity: FileSecurityService,
  ) {}

  async onModuleInit() {
    // اولین راه‌اندازی: منوی پیش‌فرض (پاسخ‌های آماده) و ردیف تنظیمات ساخته می‌شود
    try {
      const row = await this.prisma.livechatSettings.findUnique({
        where: { id: 1 },
      });
      if (!row) {
        await this.bot.seedDefaults();
        await this.prisma.livechatSettings.create({
          data: { id: 1, data: {} },
        });
      }
    } catch (err) {
      this.logger.warn(
        `راه‌اندازی اولیه‌ی چت ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  نشست بازدیدکننده
  // ══════════════════════════════════════════════════════════════════════

  private async issueToken(visitorId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.livechatVisitorSession.create({
      data: { visitorId, tokenHash: hashToken(token) },
    });
    return token;
  }

  /** بازدیدکننده‌ی متعلق به توکن (برای سوکت و REST) */
  async visitorByToken(token: string | undefined | null) {
    if (!token || token.length > 200) return null;
    const session = await this.prisma.livechatVisitorSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { visitor: true },
    });
    if (!session) return null;
    if (Date.now() - session.lastUsedAt.getTime() > 60 * 60 * 1000) {
      void this.prisma.livechatVisitorSession
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }
    return session.visitor;
  }

  /**
   * توکن مهمان به حساب کاربر واردشده متصل می‌شود؛ ولی گفتگوی کاربر واردشده هرگز با توکن مهمان
   * (مثلاً پس از خروج از حساب روی همان مرورگر) نمایش داده نمی‌شود.
   */
  private async resolveVisitor(
    token: string | null | undefined,
    userId: string | null,
  ) {
    const current = token ? await this.visitorByToken(token) : null;
    if (userId) {
      if (current && current.userId === userId)
        return { visitor: current, token: token };
      let visitor = await this.prisma.livechatVisitor.findFirst({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
      });
      if (!visitor) {
        visitor =
          current && !current.userId
            ? await this.prisma.livechatVisitor.update({
                where: { id: current.id },
                data: { userId },
              })
            : await this.prisma.livechatVisitor.create({ data: { userId } });
        if (current && current.id === visitor.id)
          return { visitor, token: token };
      }
      return { visitor, token: await this.issueToken(visitor.id) };
    }
    if (current && !current.userId) return { visitor: current, token: token };
    const visitor = await this.prisma.livechatVisitor.create({ data: {} });
    return { visitor, token: await this.issueToken(visitor.id) };
  }

  /** نام و موبایل کاربر واردشده برای بازدیدکننده‌ای که هنوز مشخصاتی ندارد */
  private async fillFromUser(visitor: LivechatVisitor) {
    if (!visitor.userId || (visitor.name && visitor.phone)) return visitor;
    const user = await this.prisma.user.findUnique({
      where: { id: visitor.userId },
      select: {
        phone: true,
        identity: { select: { firstName: true, lastName: true } },
      },
    });
    if (!user) return visitor;
    const name = [user.identity?.firstName, user.identity?.lastName]
      .filter(Boolean)
      .join(' ');
    return this.prisma.livechatVisitor.update({
      where: { id: visitor.id },
      data: {
        name: visitor.name || name || null,
        phone: visitor.phone || user.phone,
      },
    });
  }

  async createSession(input: SessionInput) {
    const s = await this.settings.get();
    const { visitor: v0, token } = await this.resolveVisitor(
      input.token,
      input.userId ?? null,
    );
    const returning = Date.now() - v0.lastSeenAt.getTime() > 30 * 60 * 1000;
    let visitor = await this.prisma.livechatVisitor.update({
      where: { id: v0.id },
      data: {
        lastSeenAt: new Date(),
        lastIp: input.ip ?? v0.lastIp,
        userAgent: clean(input.userAgent, 400) || v0.userAgent,
        currentUrl: safeUrl(input.url) ?? v0.currentUrl,
        currentTitle: clean(input.title, 200) || v0.currentTitle,
        referrer: v0.referrer ?? safeUrl(input.referrer),
        ...(returning ? { visitsCount: { increment: 1 } } : {}),
      },
    });
    visitor = await this.fillFromUser(visitor);
    const ipBlocked = !!input.ip && s.privacy.ipBlocklist.includes(input.ip);
    return {
      token,
      ...(await this.sessionState(visitor, s)),
      banned: visitor.isBanned || ipBlocked,
    };
  }

  /** وضعیت کامل ویجت برای بازدیدکننده (پس از اتصال مجدد هم استفاده می‌شود) */
  async sessionState(visitor: LivechatVisitor, s?: LivechatSettingsData) {
    s ??= await this.settings.get();
    const audience = visitor.userId ? 'USER' : 'GUEST';
    const [
      conversation,
      messages,
      rootOptions,
      triggers,
      departments,
      availability,
    ] = await Promise.all([
      this.activeConversation(visitor.id),
      this.visitorHistory(visitor.id),
      this.bot.rootOptions(audience),
      this.prisma.livechatTrigger.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      s.preChat.askDepartment
        ? this.prisma.livechatDepartment.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      this.availability(),
    ]);
    return {
      visitor: {
        id: visitor.id,
        name: visitor.name,
        phone: visitor.phone,
        email: visitor.email,
        isUser: !!visitor.userId,
      },
      settings: this.publicSettings(s),
      availability,
      conversation: conversation
        ? toVisitorConversationDto(conversation)
        : null,
      messages: messages.items,
      hasMore: messages.hasMore,
      menu: {
        greeting: s.bot.greeting,
        options: [
          ...rootOptions,
          ...this.bot.footer(s.bot, { atRoot: true, showOperator: true }),
        ],
      },
      triggers: triggers
        .filter((t) => t.audience === 'ALL' || t.audience === audience)
        .map((t) => ({
          id: t.id,
          message: t.message,
          urlContains: t.urlContains,
          delaySeconds: t.delaySeconds,
          onlyWhenOnline: t.onlyWhenOnline,
          openWidget: t.openWidget,
        })),
      departments,
    };
  }

  publicSettings(s: LivechatSettingsData) {
    return {
      enabled: s.enabled,
      widget: s.widget,
      bot: {
        enabled: s.bot.enabled,
        mainMenuLabel: s.bot.mainMenuLabel,
        operatorButtonLabel: s.bot.operatorButtonLabel,
        showOperatorButton: s.bot.showOperatorButton,
      },
      offline: s.offline,
      preChat: s.preChat,
      rating: s.rating,
      maxMessageLength: s.privacy.maxMessageLength,
    };
  }

  async availability() {
    const s = await this.settings.get();
    const withinHours = await this.settings.isWorkingTime();
    const online = await this.onlineOperatorIds(null);
    return {
      online: withinHours && online.length > 0,
      withinHours,
      workingHoursText: await this.settings.workingHoursText(),
      hidden: s.offline.mode === 'hide' && !(withinHours && online.length > 0),
    };
  }

  /** اطلاع تغییر دسترس‌پذیری (اتصال/قطع اپراتورها) به همه‌ی بازدیدکنندگان متصل */
  async broadcastAvailability() {
    this.realtime.emit(
      ROOM_VISITORS,
      'availability',
      await this.availability(),
    );
  }

  private activeConversation(visitorId: string) {
    return this.prisma.livechatConversation.findFirst({
      where: { visitorId, status: { in: ACTIVE } },
      orderBy: { createdAt: 'desc' },
      include: CONVERSATION_SUMMARY_INCLUDE,
    });
  }

  /** تاریخچه‌ی پیوسته‌ی پیام‌های بازدیدکننده در همه‌ی گفتگوها (بدون یادداشت داخلی) */
  async visitorHistory(visitorId: string, before?: string) {
    const rows = await this.prisma.livechatMessage.findMany({
      where: {
        conversation: { visitorId },
        isInternal: false,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_PAGE + 1,
      include: MESSAGE_INCLUDE,
    });
    const hasMore = rows.length > HISTORY_PAGE;
    return {
      items: rows.slice(0, HISTORY_PAGE).reverse().map(toMessageDto),
      hasMore,
    };
  }

  async updateVisitorPage(
    visitorId: string,
    url?: string | null,
    title?: string | null,
  ) {
    const safe = safeUrl(url);
    const data = {
      ...(safe ? { currentUrl: safe } : {}),
      ...(title ? { currentTitle: clean(title, 200) } : {}),
      lastSeenAt: new Date(),
    };
    await this.prisma.livechatVisitor
      .update({ where: { id: visitorId }, data })
      .catch(() => undefined);
    this.realtime.emit(ROOM_ALL_OPS, 'visitor:page', { visitorId, ...data });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ارسال رویدادها
  // ══════════════════════════════════════════════════════════════════════

  private async loadConversation(id: string) {
    return this.prisma.livechatConversation.findUnique({
      where: { id },
      include: CONVERSATION_SUMMARY_INCLUDE,
    });
  }

  summary(c: ConversationWithSummary) {
    return toConversationSummary(c, this.realtime.isVisitorOnline(c.visitorId));
  }

  /**
   * به‌روزرسانی فهرست گفتگو: ناظران و اپراتور مسئول کامل، سایر اپراتورها فقط گفتگوهای بدون
   * اپراتور (صف) را می‌بینند و برای بقیه فقط «حذف از فهرست» دریافت می‌کنند.
   */
  async emitConversation(
    conversationId: string,
    opts: { toVisitor?: boolean } = {},
  ) {
    const c = await this.loadConversation(conversationId);
    if (!c) return;
    const summary = this.summary(c);
    const rooms = [
      ROOM_ALL_OPS,
      ...(c.operatorId ? [operatorRoom(c.operatorId)] : []),
    ];
    this.realtime.emit(rooms, 'conversation:updated', summary);
    const unassigned = !c.operatorId && c.status !== CS.CLOSED;
    this.realtime.emitExcept(
      ROOM_OPS,
      rooms,
      unassigned ? 'conversation:updated' : 'conversation:hidden',
      unassigned ? summary : { id: c.id },
    );
    if (opts.toVisitor !== false) {
      this.realtime.emit(
        visitorRoom(c.visitorId),
        'conversation:updated',
        toVisitorConversationDto(c),
      );
    }
    return c;
  }

  private emitMessage(
    c: Pick<LivechatConversation, 'id' | 'visitorId' | 'operatorId' | 'status'>,
    m: MessageDto,
    event = 'message:new',
  ) {
    const rooms = [
      ROOM_ALL_OPS,
      ...(c.operatorId ? [operatorRoom(c.operatorId)] : []),
    ];
    this.realtime.emit(rooms, event, m);
    if (!c.operatorId && c.status !== CS.CLOSED)
      this.realtime.emitExcept(ROOM_OPS, rooms, event, m);
    if (!m.isInternal) this.realtime.emit(visitorRoom(c.visitorId), event, m);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ثبت پیام
  // ══════════════════════════════════════════════════════════════════════

  private async addMessage(
    conv: LivechatConversation,
    data: {
      senderType: ST;
      type?: MT;
      body?: string;
      payload?: Prisma.InputJsonValue;
      operatorId?: string | null;
      isInternal?: boolean;
      clientMessageId?: string | null;
      attachment?: { key: string; name: string; mime: string; size: number };
    },
  ) {
    const clientMessageId = data.clientMessageId
      ? data.clientMessageId.slice(0, 64)
      : null;
    if (clientMessageId) {
      const dup = await this.prisma.livechatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conv.id,
            clientMessageId,
          },
        },
        include: MESSAGE_INCLUDE,
      });
      if (dup) return { message: toMessageDto(dup), duplicate: true };
    }
    const type = data.type ?? MT.TEXT;
    const body = data.body ?? '';
    const created = await this.prisma.livechatMessage.create({
      data: {
        conversationId: conv.id,
        senderType: data.senderType,
        type,
        body,
        payload: data.payload,
        operatorId: data.operatorId ?? null,
        isInternal: !!data.isInternal,
        clientMessageId,
        attachmentKey: data.attachment?.key,
        attachmentName: data.attachment?.name,
        attachmentMime: data.attachment?.mime,
        attachmentSize: data.attachment?.size,
      },
      include: MESSAGE_INCLUDE,
    });
    const now = created.createdAt;
    const isVisitor = data.senderType === ST.VISITOR;
    const visibleToVisitor = !data.isInternal && !isVisitor;
    await this.prisma.livechatConversation.update({
      where: { id: conv.id },
      data: {
        ...(data.isInternal
          ? {}
          : {
              lastMessageAt: now,
              lastMessagePreview: previewOf(body, type, data.attachment?.name),
            }),
        ...(isVisitor
          ? { unreadByOperator: { increment: 1 }, lastVisitorMsgAt: now }
          : {}),
        ...(visibleToVisitor && data.senderType === ST.OPERATOR
          ? { unreadByVisitor: { increment: 1 } }
          : {}),
      },
    });
    const dto = toMessageDto(created);
    this.emitMessage(conv, dto);
    return { message: dto, duplicate: false };
  }

  /** متغیرهای قابل استفاده در پاسخ‌های ربات و پایگاه دانش */
  private async renderVars(
    text: string,
    visitor?: LivechatVisitor | null,
    extra: Record<string, string | number> = {},
  ) {
    if (!text.includes('{{')) return text;
    const vars: Record<string, string | number | null | undefined> = {
      ...extra,
    };
    if (text.includes('{{working_hours}}'))
      vars.working_hours = await this.settings.workingHoursText();
    if (text.includes('{{gold_price}}')) {
      const p = (await this.price
        .getCurrentGoldPriceDecimal()
        .catch(() => null)) as unknown as {
        toFixed(dp: number): string;
      } | null;
      // ریال ← تومان
      const toman = p ? Math.round(Number(p.toFixed(0)) / 10) : NaN;
      vars.gold_price = Number.isFinite(toman)
        ? toman.toLocaleString('fa-IR')
        : 'نامشخص';
    }
    vars.name = visitor?.name || 'کاربر گرامی';
    return renderTemplate(text, vars);
  }

  private async botSay(
    conv: LivechatConversation,
    visitor: LivechatVisitor | null,
    text: string,
    options: BotOption[] = [],
    extra: Record<string, unknown> = {},
  ) {
    const body = await this.renderVars(text, visitor);
    return this.addMessage(conv, {
      senderType: ST.BOT,
      type: options.length ? MT.OPTIONS : MT.TEXT,
      body,
      payload: (options.length || Object.keys(extra).length
        ? { options, ...extra }
        : undefined) as unknown as Prisma.InputJsonValue | undefined,
    });
  }

  private systemEvent(
    conv: LivechatConversation,
    text: string,
    event: string,
    extra: Record<string, unknown> = {},
  ) {
    return this.addMessage(conv, {
      senderType: ST.SYSTEM,
      type: MT.EVENT,
      body: text,
      payload: { event, ...extra },
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  پیام بازدیدکننده
  // ══════════════════════════════════════════════════════════════════════

  private async assertVisitorCanWrite(visitorId: string) {
    const visitor = await this.prisma.livechatVisitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) throw new NotFoundException('بازدیدکننده یافت نشد');
    if (visitor.isBanned)
      throw new ForbiddenException('امکان ارسال پیام برای شما وجود ندارد');
    return visitor;
  }

  /** گفتگوی فعال یا ایجاد گفتگوی جدید */
  private async ensureConversation(
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
    triggerId?: string | null,
  ) {
    const active = await this.prisma.livechatConversation.findFirst({
      where: { visitorId: visitor.id, status: { in: ACTIVE } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return { conv: active, created: false };
    const conv = await this.prisma.livechatConversation.create({
      data: {
        visitorId: visitor.id,
        status: s.bot.enabled ? CS.BOT : CS.WAITING,
        startUrl: visitor.currentUrl,
      },
    });
    if (triggerId) {
      const trigger = await this.prisma.livechatTrigger.findUnique({
        where: { id: triggerId },
      });
      if (trigger) await this.botSay(conv, visitor, trigger.message);
    }
    await this.emitConversation(conv.id);
    return { conv, created: true };
  }

  async visitorSendText(
    visitorId: string,
    input: {
      text: string;
      clientMessageId?: string | null;
      triggerId?: string | null;
    },
  ) {
    const s = await this.settings.get();
    const visitor = await this.assertVisitorCanWrite(visitorId);
    const text = (input.text ?? '').trim();
    if (!text) throw new BadRequestException('متن پیام خالی است');
    if (text.length > s.privacy.maxMessageLength) {
      throw new BadRequestException(
        `پیام نباید بیشتر از ${s.privacy.maxMessageLength} نویسه باشد`,
      );
    }
    const { conv, created } = await this.ensureConversation(
      visitor,
      s,
      input.triggerId,
    );
    const { message, duplicate } = await this.addMessage(conv, {
      senderType: ST.VISITOR,
      body: text,
      clientMessageId: input.clientMessageId,
    });
    if (duplicate) return message;
    if (created && conv.status === CS.WAITING) {
      await this.handoff(conv.id, null);
    } else {
      await this.afterVisitorText(conv.id, visitor, text, s);
    }
    await this.emitConversation(conv.id, { toVisitor: false });
    return message;
  }

  private async afterVisitorText(
    convId: string,
    visitor: LivechatVisitor,
    text: string,
    s: LivechatSettingsData,
  ) {
    const conv = await this.prisma.livechatConversation.findUniqueOrThrow({
      where: { id: convId },
    });
    const isUser = !!visitor.userId;
    if (conv.status === CS.BOT) {
      if (
        !s.bot.enabled ||
        s.bot.freeTextBehavior === 'handoff' ||
        containsPhrase(text, s.smart.handoffKeywords)
      ) {
        return this.handoff(conv.id, null);
      }
      const audience = isUser ? 'USER' : 'GUEST';
      if (s.bot.freeTextBehavior === 'smart' && s.smart.enabled) {
        const r = await this.smart.find(text, s.smart, isUser);
        if (r.kind === 'kb') return this.sendKbAnswer(conv, visitor, r.id, s);
        if (r.kind === 'node') {
          const node = await this.bot.findNode(r.id);
          if (node) return this.runNode(conv, visitor, node, s);
        }
        if (r.kind === 'suggest') {
          return this.botSay(conv, visitor, s.smart.suggestText, [
            ...r.options,
            ...this.bot.footer(s.bot, { atRoot: false, showOperator: true }),
          ]);
        }
        if (s.smart.logUnanswered)
          await this.smart.logUnanswered(text, conv.id);
      }
      return this.botSay(conv, visitor, s.bot.fallbackText, [
        ...(await this.bot.rootOptions(audience)),
        ...this.bot.footer(s.bot, { atRoot: true, showOperator: true }),
      ]);
    }
    if (conv.status === CS.WAITING) {
      if (
        s.smart.enabled &&
        s.smart.answerWhileWaiting &&
        !containsPhrase(text, s.smart.handoffKeywords)
      ) {
        const r = await this.smart.find(text, s.smart, isUser);
        if (r.kind === 'kb')
          await this.sendKbAnswer(conv, visitor, r.id, s, { inQueue: true });
      }
      if (conv.isOffline) await this.maybeAskOfflineContact(conv, visitor, s);
    }
  }

  private async sendKbAnswer(
    conv: LivechatConversation,
    visitor: LivechatVisitor,
    kbId: string,
    s: LivechatSettingsData,
    opts: { inQueue?: boolean } = {},
  ) {
    const item = await this.prisma.livechatKnowledgeItem.update({
      where: { id: kbId },
      data: { hits: { increment: 1 } },
    });
    const options: BotOption[] = [];
    if (item.followUpNodeId) {
      const n = await this.bot.findNode(item.followUpNodeId);
      if (n) options.push(this.bot.nodeOption(n));
    }
    if (s.smart.askHelpful && !opts.inQueue) {
      options.push(
        {
          id: `helpful:${item.id}:yes`,
          label: 'بله، ممنون 👍',
          kind: 'helpful',
          kbId: item.id,
          value: 'yes',
        },
        {
          id: `helpful:${item.id}:no`,
          label: 'خیر',
          kind: 'helpful',
          kbId: item.id,
          value: 'no',
        },
      );
    }
    if (!opts.inQueue)
      options.push(
        ...this.bot.footer(s.bot, {
          atRoot: false,
          showOperator: !s.smart.askHelpful,
        }),
      );
    return this.botSay(conv, visitor, item.answer, options, {
      kbId: item.id,
      smart: true,
    });
  }

  /** اجرای یک گره منو برای بازدیدکننده */
  private async runNode(
    conv: LivechatConversation,
    visitor: LivechatVisitor,
    node: NonNullable<Awaited<ReturnType<LivechatBotService['findNode']>>>,
    s: LivechatSettingsData,
  ) {
    void this.prisma.livechatBotNode
      .update({ where: { id: node.id }, data: { hits: { increment: 1 } } })
      .catch(() => undefined);
    await this.prisma.livechatConversation.update({
      where: { id: conv.id },
      data: {
        botNodeId: node.id,
        subject: conv.subject ?? node.label.slice(0, 120),
      },
    });
    const audience = visitor.userId ? 'USER' : 'GUEST';
    switch (node.action) {
      case LivechatBotAction.MAIN_MENU:
        return this.showMainMenu(conv, visitor, s);
      case LivechatBotAction.CLOSE:
        if (node.replyText) await this.botSay(conv, visitor, node.replyText);
        return this.close(conv.id, 'VISITOR');
      case LivechatBotAction.HANDOFF:
        if (node.replyText) await this.botSay(conv, visitor, node.replyText);
        return this.handoff(conv.id, node.departmentId);
      default: {
        const options = await this.bot.optionsAfter(
          node,
          audience,
          s.bot,
          conv.status === CS.BOT,
        );
        const text =
          node.replyText ||
          (node.action === LivechatBotAction.MENU ? s.bot.greeting : '');
        return this.botSay(conv, visitor, text || node.label, options, {
          nodeId: node.id,
        });
      }
    }
  }

  private async showMainMenu(
    conv: LivechatConversation,
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
  ) {
    const audience = visitor.userId ? 'USER' : 'GUEST';
    return this.botSay(conv, visitor, s.bot.greeting, [
      ...(await this.bot.rootOptions(audience)),
      ...this.bot.footer(s.bot, {
        atRoot: true,
        showOperator: conv.status === CS.BOT,
      }),
    ]);
  }

  /** انتخاب دکمه‌ی ربات توسط بازدیدکننده */
  async visitorSelectOption(
    visitorId: string,
    input: {
      kind: string;
      nodeId?: string | null;
      kbId?: string | null;
      value?: string | null;
      label?: string | null;
      clientMessageId?: string | null;
      triggerId?: string | null;
    },
  ) {
    const s = await this.settings.get();
    const visitor = await this.assertVisitorCanWrite(visitorId);
    const node =
      input.kind === 'node' || input.kind === 'back'
        ? await this.bot.findNode(input.nodeId)
        : null;
    const kb =
      input.kind === 'kb' || input.kind === 'helpful'
        ? await this.prisma.livechatKnowledgeItem.findFirst({
            where: { id: input.kbId ?? '', isActive: true },
          })
        : null;
    let label: string;
    switch (input.kind) {
      case 'node':
        if (!node)
          throw new BadRequestException('این گزینه دیگر در دسترس نیست');
        label = node.label;
        break;
      case 'kb':
        if (!kb) throw new BadRequestException('این گزینه دیگر در دسترس نیست');
        label = kb.question;
        break;
      case 'helpful':
        if (!kb) throw new BadRequestException('این گزینه دیگر در دسترس نیست');
        label = input.value === 'yes' ? 'بله، ممنون 👍' : 'خیر';
        break;
      case 'back':
        label = s.bot.backLabel;
        break;
      case 'main':
        label = s.bot.mainMenuLabel;
        break;
      case 'operator':
        label = s.bot.operatorButtonLabel;
        break;
      default:
        throw new BadRequestException('گزینه نامعتبر است');
    }
    const { conv } = await this.ensureConversation(visitor, s, input.triggerId);
    const { duplicate } = await this.addMessage(conv, {
      senderType: ST.VISITOR,
      body: label,
      clientMessageId: input.clientMessageId,
      payload: {
        selected: input.kind,
        nodeId: node?.id ?? null,
        kbId: kb?.id ?? null,
      },
    });
    if (duplicate) return;
    const fresh = await this.prisma.livechatConversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    switch (input.kind) {
      case 'node':
        await this.runNode(fresh, visitor, node, s);
        break;
      case 'back':
        if (node) await this.runNode(fresh, visitor, node, s);
        else await this.showMainMenu(fresh, visitor, s);
        break;
      case 'main':
        await this.showMainMenu(fresh, visitor, s);
        break;
      case 'operator':
        await this.handoff(fresh.id, fresh.departmentId);
        break;
      case 'kb':
        await this.sendKbAnswer(fresh, visitor, kb.id, s);
        break;
      case 'helpful': {
        await this.prisma.livechatKnowledgeItem.update({
          where: { id: kb.id },
          data:
            input.value === 'yes'
              ? { helpful: { increment: 1 } }
              : { notHelpful: { increment: 1 } },
        });
        if (input.value === 'yes') {
          await this.botSay(
            fresh,
            visitor,
            'خوشحالیم که کمک کرد 🌟 سوال دیگری دارید؟',
            this.bot.footer(s.bot, { atRoot: false, showOperator: false }),
          );
        } else {
          await this.botSay(
            fresh,
            visitor,
            'متأسفیم! می‌توانید با کارشناس گفتگو کنید یا از منو گزینه‌ی دیگری انتخاب کنید.',
            this.bot.footer(s.bot, {
              atRoot: false,
              showOperator: fresh.status === CS.BOT,
            }),
          );
        }
        break;
      }
    }
    await this.emitConversation(conv.id);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  اتصال به کارشناس، صف و تخصیص
  // ══════════════════════════════════════════════════════════════════════

  /** اپراتورهای آنلاین (متصل + وضعیت آنلاین + فعال)، در صورت تعیین دپارتمانِ دارای عضو فقط اعضای آن */
  async onlineOperatorIds(departmentId: string | null) {
    const connected = this.realtime.onlineOperatorIds();
    if (!connected.length) return [];
    const ops = await this.prisma.livechatOperator.findMany({
      where: { id: { in: connected }, isActive: true },
      select: { id: true, departments: { select: { departmentId: true } } },
    });
    if (!departmentId) return ops.map((o) => o.id);
    const members = await this.prisma.livechatOperatorDepartment.count({
      where: { departmentId },
    });
    if (!members) return ops.map((o) => o.id);
    return ops
      .filter((o) => o.departments.some((d) => d.departmentId === departmentId))
      .map((o) => o.id);
  }

  private prechatFields(
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
    departmentId: string | null,
    departmentsCount: number,
  ): FormField[] {
    if (!s.preChat.enabled || (s.preChat.onlyGuests && visitor.userId))
      return [];
    const fields: FormField[] = [];
    if (s.preChat.askName && !visitor.name)
      fields.push({
        name: 'name',
        label: 'نام و نام خانوادگی',
        required: true,
      });
    if (s.preChat.askPhone && !visitor.phone)
      fields.push({
        name: 'phone',
        label: 'شماره موبایل',
        required: s.preChat.requirePhone,
      });
    if (s.preChat.askDepartment && !departmentId && departmentsCount > 1) {
      fields.push({
        name: 'department',
        label: 'واحد مورد نظر',
        required: true,
      });
    }
    return fields;
  }

  /** درخواست اتصال به کارشناس */
  async handoff(
    conversationId: string,
    departmentId: string | null,
    opts: { skipPrechat?: boolean } = {},
  ) {
    const s = await this.settings.get();
    const conv = await this.prisma.livechatConversation.findUnique({
      where: { id: conversationId },
      include: { visitor: true },
    });
    if (!conv || conv.status === CS.OPEN || conv.status === CS.CLOSED) return;
    if (conv.status === CS.WAITING && conv.queuedAt) return;
    const deptId = departmentId ?? conv.departmentId ?? null;

    if (!opts.skipPrechat) {
      const pending = await this.prisma.livechatMessage.findFirst({
        where: {
          conversationId: conv.id,
          type: MT.FORM,
          payload: { path: ['submitted'], equals: false },
        },
      });
      if (
        pending &&
        (pending.payload as { form?: string } | null)?.form === 'prechat'
      )
        return;
      const deptCount = s.preChat.askDepartment
        ? await this.prisma.livechatDepartment.count({
            where: { isActive: true },
          })
        : 0;
      const fields = this.prechatFields(conv.visitor, s, deptId, deptCount);
      if (fields.length) {
        const departments = fields.some((f) => f.name === 'department')
          ? await this.prisma.livechatDepartment.findMany({
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, name: true },
            })
          : [];
        await this.addMessage(conv, {
          senderType: ST.BOT,
          type: MT.FORM,
          body: s.preChat.intro,
          payload: {
            form: 'prechat',
            fields,
            departments,
            departmentId: deptId,
            submitted: false,
          } as unknown as Prisma.InputJsonValue,
        });
        if (conv.status !== CS.BOT) {
          await this.prisma.livechatConversation.update({
            where: { id: conv.id },
            data: { status: CS.BOT },
          });
        }
        return;
      }
    }

    const withinHours = await this.settings.isWorkingTime();
    const available =
      withinHours && (await this.onlineOperatorIds(deptId)).length > 0;
    const updated = await this.prisma.livechatConversation.update({
      where: { id: conv.id },
      data: {
        status: CS.WAITING,
        departmentId: deptId,
        queuedAt: new Date(),
        isOffline: !available,
      },
    });
    if (!available) {
      await this.goOffline(updated, conv.visitor, s);
    } else {
      if (s.bot.handoffText)
        await this.botSay(updated, conv.visitor, s.bot.handoffText);
      const assigned =
        s.routing.mode === 'auto'
          ? await this.tryAutoAssign(updated.id)
          : false;
      if (!assigned) await this.sendQueuePosition(updated.id);
    }
    await this.emitConversation(updated.id);
    this.realtime.emit(ROOM_OPS, 'queue:new', {
      id: updated.id,
      offline: !available,
    });
  }

  private async sendQueuePosition(conversationId: string) {
    const s = await this.settings.get();
    if (!s.routing.showQueuePosition) return;
    const conv = await this.prisma.livechatConversation.findUnique({
      where: { id: conversationId },
      include: { visitor: true },
    });
    if (!conv || conv.status !== CS.WAITING || !conv.queuedAt) return;
    const ahead = await this.prisma.livechatConversation.count({
      where: {
        status: CS.WAITING,
        isOffline: false,
        operatorId: null,
        queuedAt: { lt: conv.queuedAt },
      },
    });
    await this.botSay(
      conv,
      conv.visitor,
      renderTemplate(s.routing.queueText, {
        position: (ahead + 1).toLocaleString('fa-IR'),
      }),
    );
  }

  private async goOffline(
    conv: LivechatConversation,
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
  ) {
    if (!conv.isOffline) {
      conv = await this.prisma.livechatConversation.update({
        where: { id: conv.id },
        data: { isOffline: true },
      });
    }
    await this.botSay(
      conv,
      visitor,
      `${s.offline.title}\n${s.offline.text}`,
      [],
      { offline: true },
    );
    await this.maybeAskOfflineContact(conv, visitor, s);
    await this.notifyAdminsOffline(conv, visitor, s);
  }

  private visitorPhone(visitor: LivechatVisitor) {
    return visitor.phone ? normalizeIranMobile(visitor.phone) : null;
  }

  private async maybeAskOfflineContact(
    conv: LivechatConversation,
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
  ) {
    if (s.offline.mode === 'message' || this.visitorPhone(visitor)) return;
    const asked = await this.prisma.livechatMessage.findFirst({
      where: {
        conversationId: conv.id,
        type: MT.FORM,
        payload: { path: ['form'], equals: 'offline' },
      },
    });
    if (asked) return;
    const fields: FormField[] = [];
    if (!visitor.name)
      fields.push({ name: 'name', label: 'نام', required: false });
    fields.push({
      name: 'phone',
      label: 'شماره موبایل',
      required: s.offline.requirePhone,
    });
    await this.addMessage(conv, {
      senderType: ST.BOT,
      type: MT.FORM,
      body: 'برای اطلاع از پاسخ کارشناس، شماره موبایل خود را وارد کنید.',
      payload: {
        form: 'offline',
        fields,
        submitted: false,
      } as unknown as Prisma.InputJsonValue,
    });
  }

  private async notifyAdminsOffline(
    conv: LivechatConversation,
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
  ) {
    if (
      !s.notifications.smsAdminsOnOffline ||
      !s.notifications.adminPhones.length
    )
      return;
    const last = await this.prisma.livechatMessage.findFirst({
      where: { conversationId: conv.id, senderType: ST.VISITOR },
      orderBy: { createdAt: 'desc' },
    });
    const text = renderTemplate(s.notifications.smsAdminText, {
      visitor: visitor.name || visitor.phone || `بازدیدکننده #${conv.number}`,
      preview: previewOf(last?.body ?? '', last?.type ?? 'TEXT').slice(0, 60),
      number: conv.number,
    });
    for (const phone of s.notifications.adminPhones)
      void this.notifications.notifyPhoneSms(phone, text);
  }

  /** ثبت فرم پیش از گفتگو / فرم تماس آفلاین */
  async visitorSubmitForm(
    visitorId: string,
    input: { messageId: string; values: Record<string, unknown> },
  ) {
    const visitor = await this.assertVisitorCanWrite(visitorId);
    const msg = await this.prisma.livechatMessage.findFirst({
      where: {
        id: input.messageId,
        type: MT.FORM,
        conversation: { visitorId },
      },
      include: { conversation: true },
    });
    if (!msg) throw new NotFoundException('فرم یافت نشد');
    const payload = (msg.payload ?? {}) as {
      form?: string;
      fields?: FormField[];
      departmentId?: string | null;
      submitted?: boolean;
    };
    if (payload.submitted) return;
    const values = input.values ?? {};
    const data: Prisma.LivechatVisitorUpdateInput = {};
    let departmentId = payload.departmentId ?? null;
    for (const f of payload.fields ?? []) {
      const raw = clean(values[f.name], f.name === 'message' ? 2000 : 120);
      if (f.required && !raw)
        throw new BadRequestException(`${f.label} را وارد کنید`);
      if (!raw) continue;
      if (f.name === 'name') data.name = raw;
      if (f.name === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))
          throw new BadRequestException('ایمیل معتبر نیست');
        data.email = raw;
      }
      if (f.name === 'phone') {
        const phone = normalizeIranMobile(toEnglishDigits(raw));
        if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
        data.phone = phone;
      }
      if (f.name === 'department') {
        const d = await this.prisma.livechatDepartment.findFirst({
          where: { id: raw, isActive: true },
        });
        if (!d) throw new BadRequestException('واحد انتخاب‌شده معتبر نیست');
        departmentId = d.id;
      }
    }
    const updatedVisitor = Object.keys(data).length
      ? await this.prisma.livechatVisitor.update({
          where: { id: visitor.id },
          data,
        })
      : visitor;
    const updatedMsg = await this.prisma.livechatMessage.update({
      where: { id: msg.id },
      data: {
        payload: {
          ...payload,
          submitted: true,
        } as unknown as Prisma.InputJsonValue,
      },
      include: MESSAGE_INCLUDE,
    });
    this.emitMessage(
      msg.conversation,
      toMessageDto(updatedMsg),
      'message:updated',
    );
    const s = await this.settings.get();
    if (payload.form === 'prechat') {
      await this.handoff(msg.conversationId, departmentId, {
        skipPrechat: true,
      });
    } else if (payload.form === 'offline') {
      await this.botSay(msg.conversation, updatedVisitor, s.offline.thanksText);
    }
    this.realtime.emit(ROOM_ALL_OPS, 'visitor:updated', { visitorId, ...data });
    await this.emitConversation(msg.conversationId);
  }

  /** تخصیص خودکار به کم‌مشغله‌ترین اپراتور آنلاین */
  async tryAutoAssign(conversationId: string): Promise<boolean> {
    const conv = await this.prisma.livechatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.status !== CS.WAITING || conv.operatorId) return false;
    const ids = await this.onlineOperatorIds(conv.departmentId);
    if (!ids.length) return false;
    const ops = await this.prisma.livechatOperator.findMany({
      where: { id: { in: ids }, acceptsAutoAssign: true, isActive: true },
    });
    const loads = await this.prisma.livechatConversation.groupBy({
      by: ['operatorId'],
      where: { status: CS.OPEN, operatorId: { in: ops.map((o) => o.id) } },
      _count: { _all: true },
    });
    const load = new Map(loads.map((l) => [l.operatorId, l._count._all]));
    const eligible = ops
      .map((o) => ({ o, load: load.get(o.id) ?? 0 }))
      .filter((x) => x.load < x.o.maxConcurrentChats)
      .sort(
        (a, b) =>
          a.load - b.load ||
          (this.realtime.lastAssignedAt.get(a.o.id) ?? 0) -
            (this.realtime.lastAssignedAt.get(b.o.id) ?? 0),
      );
    for (const { o } of eligible) {
      if (
        await this.assign(conversationId, o.id, {
          onlyIfWaiting: true,
          by: 'auto',
        })
      )
        return true;
    }
    return false;
  }

  /** تخصیص صف به اپراتورهای آزاد (پس از آنلاین شدن اپراتور یا بسته شدن گفتگو) */
  async drainQueue() {
    const s = await this.settings.get();
    if (s.routing.mode !== 'auto') return;
    const waiting = await this.prisma.livechatConversation.findMany({
      where: { status: CS.WAITING, operatorId: null },
      orderBy: { queuedAt: 'asc' },
      take: 50,
      select: { id: true },
    });
    for (const w of waiting) {
      const ok = await this.tryAutoAssign(w.id);
      if (!ok && !this.realtime.onlineOperatorIds().length) break;
    }
  }

  /**
   * تخصیص گفتگو به اپراتور. onlyIfWaiting: فقط اگر هنوز در صف بدون اپراتور باشد (رقابت دو
   * اپراتور برای پذیرش یک گفتگو با به‌روزرسانی شرطی حل می‌شود).
   */
  async assign(
    conversationId: string,
    operatorId: string,
    opts: {
      onlyIfWaiting?: boolean;
      by: 'auto' | 'claim' | 'transfer';
      byName?: string;
    },
  ): Promise<boolean> {
    const op = await this.prisma.livechatOperator.findUnique({
      where: { id: operatorId },
    });
    if (!op || !op.isActive) return false;
    const before = await this.prisma.livechatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!before) return false;
    const res = await this.prisma.livechatConversation.updateMany({
      where: opts.onlyIfWaiting
        ? {
            id: conversationId,
            operatorId: null,
            status: { in: [CS.WAITING, CS.BOT] },
          }
        : { id: conversationId },
      data: {
        status: CS.OPEN,
        operatorId,
        assignedAt: new Date(),
        isOffline: before.isOffline,
        closedAt: null,
        closedBy: null,
      },
    });
    if (!res.count) return false;
    this.realtime.lastAssignedAt.set(operatorId, Date.now());
    const conv = await this.prisma.livechatConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const s = await this.settings.get();
    const text =
      opts.by === 'transfer'
        ? renderTemplate(s.routing.transferText, { target: op.displayName })
        : renderTemplate(s.routing.assignedText, { operator: op.displayName });
    await this.systemEvent(
      conv,
      text,
      opts.by === 'transfer' ? 'transferred' : 'assigned',
      {
        operatorId: op.id,
        operatorName: op.displayName,
        by: opts.byName ?? null,
      },
    );
    await this.emitConversation(conversationId);
    if (before.operatorId && before.operatorId !== operatorId) {
      this.realtime.emit(
        operatorRoom(before.operatorId),
        'conversation:hidden',
        { id: conversationId },
      );
    }
    this.realtime.emit(operatorRoom(operatorId), 'conversation:assigned', {
      id: conversationId,
      by: opts.by,
    });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  اپراتور
  // ══════════════════════════════════════════════════════════════════════

  private async convForOperator(actor: OperatorActor, conversationId: string) {
    const conv = await this.prisma.livechatConversation.findUnique({
      where: { id: conversationId },
      include: { visitor: true },
    });
    if (!conv) throw new NotFoundException('گفتگو یافت نشد');
    const unassigned = !conv.operatorId && conv.status !== CS.CLOSED;
    if (
      !actor.canViewAll &&
      conv.operatorId !== actor.operatorId &&
      !unassigned
    ) {
      throw new ForbiddenException('این گفتگو به کارشناس دیگری سپرده شده است');
    }
    return conv;
  }

  async canAccess(actor: OperatorActor, conversationId: string) {
    try {
      return await this.convForOperator(actor, conversationId);
    } catch {
      return null;
    }
  }

  async operatorSend(
    actor: OperatorActor,
    conversationId: string,
    input: {
      text?: string;
      isInternal?: boolean;
      clientMessageId?: string | null;
    },
    file?: UploadedFileLike,
    uploadActor?: UploadActor,
  ) {
    const s = await this.settings.get();
    let conv = await this.convForOperator(actor, conversationId);
    const text = (input.text ?? '').trim();
    const isInternal = !!input.isInternal;
    if (!text && !file) throw new BadRequestException('متن پیام خالی است');
    if (text.length > 5000)
      throw new BadRequestException('پیام بیش از حد طولانی است');

    if (!isInternal) {
      if (conv.status === CS.CLOSED || !conv.operatorId) {
        // پاسخ به گفتگوی بسته (مثلاً پیام آفلاین) یا پذیرش از صف: گفتگو به همین اپراتور سپرده می‌شود
        const ok = await this.assign(conv.id, actor.operatorId, {
          by: 'claim',
          onlyIfWaiting: conv.status !== CS.CLOSED,
        });
        if (!ok)
          throw new BadRequestException(
            'این گفتگو هم‌زمان توسط کارشناس دیگری پذیرفته شد',
          );
        conv = await this.convForOperator(actor, conversationId);
      }
    }

    let attachment:
      { key: string; name: string; mime: string; size: number } | undefined;
    if (file) {
      const safe = await this.fileSecurity.process(
        file,
        CHAT_ATTACHMENT_POLICY,
        uploadActor,
      );
      attachment = {
        key: await this.storage.save(conv.id, safe),
        name: safe.displayName,
        mime: safe.mime,
        size: safe.size,
      };
    }
    const { message, duplicate } = await this.addMessage(conv, {
      senderType: ST.OPERATOR,
      operatorId: actor.operatorId,
      type: attachment ? MT.FILE : MT.TEXT,
      body: text,
      isInternal,
      clientMessageId: input.clientMessageId,
      attachment,
    });
    if (duplicate) return message;
    if (!isInternal) {
      if (!conv.firstResponseAt) {
        await this.prisma.livechatConversation.update({
          where: { id: conv.id },
          data: { firstResponseAt: new Date() },
        });
      }
      if (!this.realtime.isVisitorOnline(conv.visitorId)) {
        void this.smsVisitorAboutReply(conv.visitor, s);
      }
    }
    await this.emitConversation(conv.id, { toVisitor: !isInternal });
    return message;
  }

  /** پیامک «پاسخ داده شد» به بازدیدکننده‌ای که آنلاین نیست (با فاصله‌ی زمانی حداقل) */
  private async smsVisitorAboutReply(
    visitor: LivechatVisitor,
    s: LivechatSettingsData,
  ) {
    if (!s.notifications.smsVisitorOnReply) return;
    let phone = this.visitorPhone(visitor);
    if (!phone && visitor.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: visitor.userId },
        select: { phone: true },
      });
      phone = u?.phone ? normalizeIranMobile(u.phone) : null;
    }
    if (!phone) return;
    const cooldown = s.notifications.smsCooldownMinutes * 60_000;
    // به‌روزرسانی شرطی تا دو پاسخ هم‌زمان دو پیامک نفرستند
    const claimed = await this.prisma.livechatVisitor.updateMany({
      where: {
        id: visitor.id,
        OR: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { lt: new Date(Date.now() - cooldown) } },
        ],
      },
      data: { lastNotifiedAt: new Date() },
    });
    if (!claimed.count) return;
    const text = renderTemplate(s.notifications.smsVisitorText, {
      link: s.notifications.chatLink,
      name: visitor.name ?? '',
    });
    if (visitor.userId)
      await this.notifications.notifyUserSms(visitor.userId, text);
    else await this.notifications.notifyPhoneSms(phone, text);
  }

  async claim(actor: OperatorActor, conversationId: string) {
    const conv = await this.convForOperator(actor, conversationId);
    if (conv.operatorId === actor.operatorId) return { ok: true };
    if (conv.operatorId && !actor.canViewAll)
      throw new ForbiddenException('این گفتگو قبلاً پذیرفته شده است');
    const ok = await this.assign(conversationId, actor.operatorId, {
      onlyIfWaiting: !actor.canViewAll,
      by: 'claim',
    });
    if (!ok)
      throw new BadRequestException(
        'این گفتگو هم‌زمان توسط کارشناس دیگری پذیرفته شد',
      );
    return { ok: true };
  }

  async transfer(
    actor: OperatorActor,
    conversationId: string,
    input: {
      operatorId?: string | null;
      departmentId?: string | null;
      note?: string | null;
    },
  ) {
    const conv = await this.convForOperator(actor, conversationId);
    if (conv.status === CS.CLOSED)
      throw new BadRequestException('گفتگو بسته شده است');
    if (
      conv.operatorId &&
      conv.operatorId !== actor.operatorId &&
      !actor.canViewAll
    ) {
      throw new ForbiddenException(
        'فقط کارشناس مسئول یا ناظر می‌تواند گفتگو را منتقل کند',
      );
    }
    if (input.note) {
      await this.addMessage(conv, {
        senderType: ST.OPERATOR,
        operatorId: actor.operatorId,
        body: clean(input.note, 1000),
        isInternal: true,
      });
    }
    if (input.operatorId) {
      const target = await this.prisma.livechatOperator.findFirst({
        where: { id: input.operatorId, isActive: true },
      });
      if (!target) throw new BadRequestException('کارشناس مقصد معتبر نیست');
      await this.assign(conv.id, target.id, {
        by: 'transfer',
        byName: actor.displayName,
      });
      return { ok: true };
    }
    if (input.departmentId) {
      const dept = await this.prisma.livechatDepartment.findFirst({
        where: { id: input.departmentId, isActive: true },
      });
      if (!dept) throw new BadRequestException('دپارتمان مقصد معتبر نیست');
      const s = await this.settings.get();
      const updated = await this.prisma.livechatConversation.update({
        where: { id: conv.id },
        data: {
          status: CS.WAITING,
          operatorId: null,
          departmentId: dept.id,
          queuedAt: new Date(),
        },
      });
      await this.systemEvent(
        updated,
        renderTemplate(s.routing.transferText, { target: dept.name }),
        'transferred',
        {
          departmentId: dept.id,
          by: actor.displayName,
        },
      );
      if (conv.operatorId)
        this.realtime.emit(
          operatorRoom(conv.operatorId),
          'conversation:hidden',
          { id: conv.id },
        );
      if (s.routing.mode === 'auto') await this.tryAutoAssign(conv.id);
      await this.emitConversation(conv.id);
      this.realtime.emit(ROOM_OPS, 'queue:new', {
        id: conv.id,
        offline: updated.isOffline,
      });
      return { ok: true };
    }
    throw new BadRequestException('مقصد انتقال را مشخص کنید');
  }

  async operatorClose(actor: OperatorActor, conversationId: string) {
    const conv = await this.convForOperator(actor, conversationId);
    if (
      conv.operatorId &&
      conv.operatorId !== actor.operatorId &&
      !actor.canViewAll
    ) {
      throw new ForbiddenException(
        'فقط کارشناس مسئول یا ناظر می‌تواند گفتگو را ببندد',
      );
    }
    await this.close(conversationId, 'OPERATOR');
    return { ok: true };
  }

  /** بستن گفتگو؛ by: VISITOR | OPERATOR | SYSTEM */
  async close(conversationId: string, by: 'VISITOR' | 'OPERATOR' | 'SYSTEM') {
    const s = await this.settings.get();
    const conv = await this.prisma.livechatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.status === CS.CLOSED) return;
    const res = await this.prisma.livechatConversation.updateMany({
      where: { id: conversationId, status: { not: CS.CLOSED } },
      data: {
        status: CS.CLOSED,
        closedAt: new Date(),
        closedBy: by,
        isMissed: conv.status === CS.WAITING && !conv.firstResponseAt,
        unreadByOperator: 0,
      },
    });
    if (!res.count) return;
    const closed = await this.prisma.livechatConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const label =
      by === 'VISITOR'
        ? 'بازدیدکننده گفتگو را پایان داد.'
        : s.routing.closedText;
    await this.systemEvent(closed, label, 'closed', { by });
    if (s.rating.enabled && conv.operatorId && conv.firstResponseAt) {
      await this.addMessage(closed, {
        senderType: ST.BOT,
        type: MT.RATING,
        body: s.rating.text,
        payload: {
          askComment: s.rating.askComment,
          rated: null,
        },
      });
    }
    await this.emitConversation(conversationId);
    if (conv.operatorId) void this.drainQueue();
  }

  async visitorEnd(visitorId: string) {
    const s = await this.settings.get();
    if (!s.widget.allowVisitorEndChat)
      throw new ForbiddenException('پایان گفتگو توسط کاربر غیرفعال است');
    const conv = await this.activeConversation(visitorId);
    if (conv) await this.close(conv.id, 'VISITOR');
  }

  async visitorRate(
    visitorId: string,
    input: { messageId: string; rating: number; comment?: string | null },
  ) {
    const rating = Math.round(Number(input.rating));
    if (!(rating >= 1 && rating <= 5))
      throw new BadRequestException('امتیاز باید بین ۱ تا ۵ باشد');
    const msg = await this.prisma.livechatMessage.findFirst({
      where: {
        id: input.messageId,
        type: MT.RATING,
        conversation: { visitorId },
      },
      include: { conversation: true },
    });
    if (!msg) throw new NotFoundException('درخواست امتیاز یافت نشد');
    if (Date.now() - msg.createdAt.getTime() > 7 * 24 * 3600_000) {
      throw new BadRequestException('مهلت ثبت امتیاز این گفتگو گذشته است');
    }
    const comment = clean(input.comment, 1000) || null;
    await this.prisma.livechatConversation.update({
      where: { id: msg.conversationId },
      data: { rating, ratingComment: comment, ratedAt: new Date() },
    });
    const payload = {
      ...((msg.payload ?? {}) as Record<string, unknown>),
      rated: rating,
      comment,
    };
    const updated = await this.prisma.livechatMessage.update({
      where: { id: msg.id },
      data: { payload: payload },
      include: MESSAGE_INCLUDE,
    });
    this.emitMessage(
      msg.conversation,
      toMessageDto(updated),
      'message:updated',
    );
    await this.emitConversation(msg.conversationId, { toVisitor: false });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  خوانده شدن و در حال نوشتن
  // ══════════════════════════════════════════════════════════════════════

  async visitorSeen(visitorId: string) {
    const conv = await this.activeConversation(visitorId);
    const now = new Date();
    const res = await this.prisma.livechatMessage.updateMany({
      where: {
        conversation: { visitorId },
        senderType: { not: ST.VISITOR },
        isInternal: false,
        seenAt: null,
      },
      data: { seenAt: now },
    });
    if (conv) {
      await this.prisma.livechatConversation.update({
        where: { id: conv.id },
        data: { unreadByVisitor: 0 },
      });
      if (res.count) {
        const rooms = [
          ROOM_ALL_OPS,
          ...(conv.operatorId ? [operatorRoom(conv.operatorId)] : []),
        ];
        this.realtime.emit(rooms, 'message:seen', {
          conversationId: conv.id,
          by: 'VISITOR',
          at: now,
        });
      }
    }
  }

  async operatorSeen(actor: OperatorActor, conversationId: string) {
    const conv = await this.convForOperator(actor, conversationId);
    // ناظری که فقط گفتگوی دیگری را نگاه می‌کند، رسید «خوانده شد» برای بازدیدکننده ثبت نمی‌کند
    if (conv.operatorId && conv.operatorId !== actor.operatorId) return;
    const now = new Date();
    const res = await this.prisma.livechatMessage.updateMany({
      where: { conversationId, senderType: ST.VISITOR, seenAt: null },
      data: { seenAt: now },
    });
    await this.prisma.livechatConversation.update({
      where: { id: conversationId },
      data: { unreadByOperator: 0 },
    });
    if (res.count)
      this.realtime.emit(visitorRoom(conv.visitorId), 'message:seen', {
        conversationId,
        by: 'OPERATOR',
        at: now,
      });
    await this.emitConversation(conversationId, { toVisitor: false });
  }

  async visitorTyping(visitorId: string, text: string | null) {
    const s = await this.settings.get();
    const conv = await this.prisma.livechatConversation.findFirst({
      where: { visitorId, status: { in: ACTIVE } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, operatorId: true },
    });
    if (!conv) return;
    const preview = s.privacy.typingPreview && text ? text.slice(0, 300) : null;
    const rooms = [
      ROOM_ALL_OPS,
      ...(conv.operatorId ? [operatorRoom(conv.operatorId)] : []),
    ];
    this.realtime.emit(rooms, 'visitor:typing', {
      conversationId: conv.id,
      visitorId,
      typing: !!text,
      preview,
    });
  }

  async operatorTyping(
    actor: OperatorActor,
    conversationId: string,
    typing: boolean,
  ) {
    const conv = await this.canAccess(actor, conversationId);
    if (!conv || conv.status === CS.CLOSED) return;
    this.realtime.emit(visitorRoom(conv.visitorId), 'operator:typing', {
      conversationId,
      typing,
      operatorName: actor.displayName,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  پیوست‌ها
  // ══════════════════════════════════════════════════════════════════════

  async visitorUpload(
    visitorId: string,
    file: UploadedFileLike,
    clientMessageId: string | null,
    actor: UploadActor,
  ) {
    const s = await this.settings.get();
    if (!s.widget.allowFileUpload)
      throw new ForbiddenException('ارسال فایل غیرفعال است');
    const visitor = await this.assertVisitorCanWrite(visitorId);
    const safe = await this.fileSecurity.process(
      file,
      CHAT_ATTACHMENT_POLICY,
      actor,
    );
    const { conv } = await this.ensureConversation(visitor, s);
    const key = await this.storage.save(conv.id, safe);
    const { message } = await this.addMessage(conv, {
      senderType: ST.VISITOR,
      type: MT.FILE,
      clientMessageId,
      attachment: {
        key,
        name: safe.displayName,
        mime: safe.mime,
        size: safe.size,
      },
    });
    // فایل در حالت ربات یعنی بازدیدکننده با کارشناس کار دارد
    if (conv.status === CS.BOT) await this.handoff(conv.id, null);
    await this.emitConversation(conv.id, { toVisitor: false });
    return message;
  }

  async attachment(
    messageId: string,
    scope: { visitorId: string } | { actor: OperatorActor },
  ) {
    const msg = await this.prisma.livechatMessage.findUnique({
      where: { id: messageId },
    });
    if (!msg?.attachmentKey || msg.deletedAt)
      throw new NotFoundException('فایل یافت نشد');
    if ('visitorId' in scope) {
      const conv = await this.prisma.livechatConversation.findUnique({
        where: { id: msg.conversationId },
      });
      if (!conv || conv.visitorId !== scope.visitorId || msg.isInternal)
        throw new NotFoundException('فایل یافت نشد');
    } else {
      await this.convForOperator(scope.actor, msg.conversationId);
    }
    return {
      buffer: await this.storage.read(msg.attachmentKey),
      mime: msg.attachmentMime ?? 'application/octet-stream',
      name: msg.attachmentName ?? 'file',
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  شروع گفتگو توسط اپراتور (بازدیدکننده‌ی آنلاین)
  // ══════════════════════════════════════════════════════════════════════

  async operatorStart(actor: OperatorActor, visitorId: string, text: string) {
    const visitor = await this.prisma.livechatVisitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) throw new NotFoundException('بازدیدکننده یافت نشد');
    let conv = await this.prisma.livechatConversation.findFirst({
      where: { visitorId, status: { in: ACTIVE } },
      orderBy: { createdAt: 'desc' },
    });
    if (
      conv?.operatorId &&
      conv.operatorId !== actor.operatorId &&
      !actor.canViewAll
    ) {
      throw new ForbiddenException(
        'این بازدیدکننده با کارشناس دیگری در گفتگوست',
      );
    }
    if (!conv) {
      conv = await this.prisma.livechatConversation.create({
        data: {
          visitorId,
          status: CS.WAITING,
          startUrl: visitor.currentUrl,
          queuedAt: new Date(),
          subject: 'گفتگوی آغازشده توسط کارشناس',
        },
      });
    }
    if (conv.operatorId !== actor.operatorId)
      await this.assign(conv.id, actor.operatorId, { by: 'claim' });
    const message = await this.operatorSend(actor, conv.id, { text });
    this.realtime.emit(visitorRoom(visitorId), 'chat:open', {
      conversationId: conv.id,
    });
    return { conversationId: conv.id, message };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  کارهای زمان‌بندی‌شده
  // ══════════════════════════════════════════════════════════════════════

  /** صفی که بیش از حد انتظار بی‌پاسخ ماند به حالت آفلاین می‌رود */
  async expireQueue() {
    const s = await this.settings.get();
    if (!s.routing.queueTimeoutSeconds) return;
    const stale = await this.prisma.livechatConversation.findMany({
      where: {
        status: CS.WAITING,
        isOffline: false,
        operatorId: null,
        queuedAt: {
          lt: new Date(Date.now() - s.routing.queueTimeoutSeconds * 1000),
        },
      },
      include: { visitor: true },
      take: 50,
    });
    for (const c of stale) {
      await this.goOffline(c, c.visitor, s);
      await this.emitConversation(c.id);
    }
  }

  /** بستن گفتگوهای بی‌فعالیت (گفتگوهای آفلاینِ منتظر پاسخ بسته نمی‌شوند) */
  async autoCloseIdle() {
    const s = await this.settings.get();
    if (!s.routing.autoCloseMinutes) return;
    const before = new Date(Date.now() - s.routing.autoCloseMinutes * 60_000);
    const idle = await this.prisma.livechatConversation.findMany({
      where: {
        lastMessageAt: { lt: before },
        OR: [{ status: CS.BOT }, { status: CS.OPEN }],
      },
      select: { id: true, visitorId: true },
      take: 100,
    });
    for (const c of idle) await this.close(c.id, 'SYSTEM');
  }

  /** بازدیدکنندگان مهمانی که ۳۰ روز سر نزده‌اند و هیچ گفتگویی ندارند حذف می‌شوند */
  async pruneStaleVisitors() {
    const res = await this.prisma.livechatVisitor.deleteMany({
      where: {
        userId: null,
        lastSeenAt: { lt: new Date(Date.now() - 30 * 24 * 3600_000) },
        conversations: { none: {} },
      },
    });
    if (res.count)
      this.logger.log(`[Livechat] ${res.count} بازدیدکننده‌ی بی‌گفتگو پاک شد`);
  }
}
