// api/src/livechat/livechat.gateway.ts
//
// کانال بلادرنگ چت (namespace /livechat):
//   • بازدیدکننده با توکن بازدیدکننده (handshake.auth.visitorToken) وصل می‌شود و پیام، انتخاب
//     گزینه‌ی ربات، فرم، امتیاز، «در حال نوشتن» و «خوانده شد» را از همین کانال می‌فرستد.
//   • اپراتور با بلیت یک‌بارمصرف کوتاه‌عمر (handshake.auth.ticket) که از REST احرازشده‌ی پنل
//     گرفته می‌شود وصل می‌شود؛ تغییرات اپراتور از REST (با ممیزی و قفل نشست پنل) انجام می‌شود و
//     این کانال فقط برای دریافت رویدادها و «در حال نوشتن» است. نشست پنل هر دقیقه دوباره بررسی و
//     با پایان/قفل شدن آن، اتصال قطع می‌شود.
import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { resolveCorsOrigins } from '../common/network/cors-origins';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  LivechatRealtimeService,
  ROOM_ALL_OPS,
  ROOM_OPS,
  operatorRoom,
  visitorRoom,
} from './livechat-realtime.service';
import {
  LivechatService,
  OperatorActor,
  ROOM_VISITORS,
  safeUrl,
} from './livechat.service';
import { LivechatOperatorsService } from './livechat-operators.service';

interface VisitorData {
  kind: 'visitor';
  visitorId: string;
  hits: number[];
  /** آخرین رویداد «در حال نوشتن» / تغییر صفحه (محدودیت نرخ رویدادهای پرتکرار) */
  lastTyping: number;
  lastPage: number;
}
interface OperatorData {
  kind: 'operator';
  actor: OperatorActor;
  sessionId: string;
}
type SocketData = VisitorData | OperatorData;

const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 15;

function errorMessage(err: unknown) {
  const res = (err as { getResponse?: () => unknown })?.getResponse?.();
  const msg =
    (res && typeof res === 'object' && 'message' in res ? res.message : null) ??
    (err as Error)?.message;
  return Array.isArray(msg)
    ? String(msg[0])
    : typeof msg === 'string'
      ? msg
      : 'خطا در پردازش درخواست';
}

// گزینه‌های CORS سرور Socket.IO بین همه‌ی Gatewayهای همین سرور مشترک است (همان فهرست main.ts)؛
// احراز هویت چت با توکن handshake است و کوکی لازم ندارد
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? resolveCorsOrigins(),
  },
  namespace: 'livechat',
})
export class LivechatGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer() server!: Namespace;
  private readonly logger = new Logger(LivechatGateway.name);
  private sessionTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly realtime: LivechatRealtimeService,
    private readonly livechat: LivechatService,
    private readonly operators: LivechatOperatorsService,
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  afterInit(server: Namespace) {
    this.realtime.attach(server);
    this.sessionTimer = setInterval(
      () => void this.revalidateOperators(),
      60_000,
    );
    this.sessionTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sessionTimer) clearInterval(this.sessionTimer);
  }

  private data(client: Socket): SocketData | undefined {
    return client.data as SocketData | undefined;
  }

  async handleConnection(client: Socket) {
    const auth = (client.handshake.auth ?? {}) as {
      visitorToken?: string;
      ticket?: string;
      url?: string;
      title?: string;
    };
    try {
      if (auth.ticket) return await this.connectOperator(client, auth.ticket);
      if (auth.visitorToken)
        return await this.connectVisitor(
          client,
          auth.visitorToken,
          auth.url,
          auth.title,
        );
    } catch (err) {
      this.logger.warn(`اتصال چت رد شد: ${(err as Error).message}`);
    }
    client.emit('auth:error', { message: 'اتصال نامعتبر است' });
    client.disconnect(true);
  }

  private async connectVisitor(
    client: Socket,
    token: string,
    rawUrl?: string,
    rawTitle?: string,
  ) {
    const url = safeUrl(rawUrl);
    const title = typeof rawTitle === 'string' ? rawTitle.slice(0, 200) : null;
    const visitor = await this.livechat.visitorByToken(token);
    if (!visitor || visitor.isBanned) {
      client.emit('auth:error', {
        message: 'نشست چت نامعتبر است',
        code: visitor ? 'BANNED' : 'INVALID',
      });
      client.disconnect(true);
      return;
    }
    client.data = {
      kind: 'visitor',
      visitorId: visitor.id,
      hits: [],
      lastTyping: 0,
      lastPage: 0,
    } satisfies VisitorData;
    await client.join([visitorRoom(visitor.id), ROOM_VISITORS]);
    const first = this.realtime.visitorConnected(
      visitor.id,
      client.id,
      url,
      title,
    );
    await this.livechat.updateVisitorPage(visitor.id, url, title);
    if (first) {
      this.realtime.emit([ROOM_OPS, ROOM_ALL_OPS], 'visitor:online', {
        visitorId: visitor.id,
        name: visitor.name,
        phone: visitor.phone,
        isUser: !!visitor.userId,
        url: url ?? visitor.currentUrl,
        title: title ?? visitor.currentTitle,
        connectedAt: new Date(),
      });
    }
    client.emit('ready', { availability: await this.livechat.availability() });
  }

  private async connectOperator(client: Socket, ticket: string) {
    const t = await this.operators.consumeTicket(ticket);
    if (!t || !t.permissions.includes('livechat.view')) {
      client.emit('auth:error', {
        message: 'بلیت اتصال نامعتبر یا منقضی است',
        code: 'TICKET',
      });
      client.disconnect(true);
      return;
    }
    const op = await this.operators.ensure(t.adminUserId);
    if (!op.isActive) {
      client.emit('auth:error', {
        message: 'حساب اپراتوری شما غیرفعال است',
        code: 'DISABLED',
      });
      client.disconnect(true);
      return;
    }
    const actor: OperatorActor = {
      operatorId: op.id,
      adminUserId: t.adminUserId,
      displayName: op.displayName,
      canViewAll: t.permissions.includes('livechat.view_all'),
    };
    client.data = {
      kind: 'operator',
      actor,
      sessionId: t.sessionId,
    } satisfies OperatorData;
    await client.join([
      ROOM_OPS,
      operatorRoom(op.id),
      ...(actor.canViewAll ? [ROOM_ALL_OPS] : []),
    ]);
    this.realtime.operatorConnected(op.id, t.adminUserId, client.id, op.status);
    await this.prisma.livechatOperator.update({
      where: { id: op.id },
      data: { lastSeenAt: new Date() },
    });
    client.emit('ready', { operatorId: op.id, status: op.status });
    await this.operators.presenceChanged();
    if (op.status === 'ONLINE') void this.livechat.drainQueue();
  }

  async handleDisconnect(client: Socket) {
    const d = this.data(client);
    if (!d) return;
    if (d.kind === 'visitor') {
      if (this.realtime.visitorDisconnected(d.visitorId, client.id)) {
        this.realtime.emit([ROOM_OPS, ROOM_ALL_OPS], 'visitor:offline', {
          visitorId: d.visitorId,
        });
        await this.livechat
          .visitorTyping(d.visitorId, null)
          .catch(() => undefined);
      }
    } else if (
      this.realtime.operatorDisconnected(d.actor.operatorId, client.id)
    ) {
      await this.prisma.livechatOperator
        .update({
          where: { id: d.actor.operatorId },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => undefined);
      await this.operators.presenceChanged().catch(() => undefined);
    }
  }

  /** نشست پنل اپراتورهای متصل: منقضی، باطل، قفل عدم فعالیت یا ادمین غیرفعال ← قطع اتصال */
  private async revalidateOperators() {
    try {
      const { accessTtlSeconds: idleSeconds } =
        await this.systemConfig.getSessionPolicy('admin');
      for (const [id, socket] of this.server.sockets) {
        const d = this.data(socket);
        if (d?.kind !== 'operator') continue;
        const session = await this.prisma.adminSession.findUnique({
          where: { id: d.sessionId },
          select: {
            expiresAt: true,
            lastActivityAt: true,
            adminUser: { select: { isActive: true } },
          },
        });
        const valid =
          !!session &&
          session.adminUser.isActive &&
          session.expiresAt > new Date() &&
          Date.now() - session.lastActivityAt.getTime() <= idleSeconds * 1000;
        if (!valid) this.realtime.disconnectSockets([id], 'session');
      }
    } catch (err) {
      this.logger.warn(
        `بررسی نشست اپراتورها ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  /** محدودیت نرخ رویدادهای نوشتنی بازدیدکننده */
  private visitor(client: Socket, limited = true): VisitorData {
    const d = this.data(client);
    if (d?.kind !== 'visitor') throw new Error('دسترسی نامعتبر');
    if (limited) {
      const now = Date.now();
      d.hits = d.hits.filter((t) => now - t < RATE_WINDOW_MS);
      if (d.hits.length >= RATE_MAX)
        throw new Error('تعداد پیام‌ها زیاد است؛ کمی صبر کنید');
      d.hits.push(now);
    }
    return d;
  }

  private async run<T>(fn: () => Promise<T>) {
    try {
      return { ok: true, data: (await fn()) ?? null };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  // ── رویدادهای بازدیدکننده ──

  @SubscribeMessage('visitor:message')
  onVisitorMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { text?: string; clientMessageId?: string; triggerId?: string },
  ) {
    return this.run(async () => {
      const d = this.visitor(client);
      return this.livechat.visitorSendText(d.visitorId, {
        text: String(body?.text ?? ''),
        clientMessageId:
          typeof body?.clientMessageId === 'string'
            ? body.clientMessageId
            : null,
        triggerId: typeof body?.triggerId === 'string' ? body.triggerId : null,
      });
    });
  }

  @SubscribeMessage('visitor:option')
  onVisitorOption(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      kind?: string;
      nodeId?: string;
      kbId?: string;
      value?: string;
      clientMessageId?: string;
      triggerId?: string;
    },
  ) {
    return this.run(async () => {
      const d = this.visitor(client);
      const str = (v: unknown) => (typeof v === 'string' ? v : null);
      return this.livechat.visitorSelectOption(d.visitorId, {
        kind: String(body?.kind ?? ''),
        nodeId: str(body?.nodeId),
        kbId: str(body?.kbId),
        value: str(body?.value),
        clientMessageId: str(body?.clientMessageId),
        triggerId: str(body?.triggerId),
      });
    });
  }

  @SubscribeMessage('visitor:form')
  onVisitorForm(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { messageId?: string; values?: Record<string, unknown> },
  ) {
    return this.run(async () => {
      const d = this.visitor(client);
      return this.livechat.visitorSubmitForm(d.visitorId, {
        messageId: String(body?.messageId ?? ''),
        values:
          body?.values && typeof body.values === 'object' ? body.values : {},
      });
    });
  }

  @SubscribeMessage('visitor:rate')
  onVisitorRate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { messageId?: string; rating?: number; comment?: string },
  ) {
    return this.run(async () => {
      const d = this.visitor(client);
      return this.livechat.visitorRate(d.visitorId, {
        messageId: String(body?.messageId ?? ''),
        rating: Number(body?.rating),
        comment: typeof body?.comment === 'string' ? body.comment : null,
      });
    });
  }

  @SubscribeMessage('visitor:end')
  onVisitorEnd(@ConnectedSocket() client: Socket) {
    return this.run(async () =>
      this.livechat.visitorEnd(this.visitor(client).visitorId),
    );
  }

  @SubscribeMessage('visitor:seen')
  onVisitorSeen(@ConnectedSocket() client: Socket) {
    return this.run(async () =>
      this.livechat.visitorSeen(this.visitor(client, false).visitorId),
    );
  }

  @SubscribeMessage('visitor:typing')
  async onVisitorTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { text?: string },
  ) {
    const d = this.data(client);
    if (d?.kind !== 'visitor') return;
    const text = typeof body?.text === 'string' ? body.text : '';
    // پایان تایپ همیشه، به‌روزرسانی متن حداکثر هر ۴۰۰ میلی‌ثانیه
    const now = Date.now();
    if (text.trim() && now - d.lastTyping < 400) return;
    d.lastTyping = now;
    await this.livechat
      .visitorTyping(d.visitorId, text.trim() ? text : null)
      .catch(() => undefined);
  }

  @SubscribeMessage('visitor:page')
  async onVisitorPage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { url?: string; title?: string },
  ) {
    const d = this.data(client);
    if (d?.kind !== 'visitor') return;
    const now = Date.now();
    if (now - d.lastPage < 1000) return;
    d.lastPage = now;
    const url = safeUrl(body?.url);
    const title =
      typeof body?.title === 'string' ? body.title.slice(0, 200) : null;
    const p = this.realtime.visitors.get(d.visitorId);
    if (p) {
      if (url) p.url = url;
      if (title) p.title = title;
    }
    await this.livechat
      .updateVisitorPage(d.visitorId, url, title)
      .catch(() => undefined);
  }

  // ── رویدادهای اپراتور ──

  @SubscribeMessage('op:typing')
  async onOperatorTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string; typing?: boolean },
  ) {
    const d = this.data(client);
    if (d?.kind !== 'operator' || typeof body?.conversationId !== 'string')
      return;
    await this.livechat
      .operatorTyping(d.actor, body.conversationId, !!body.typing)
      .catch(() => undefined);
  }
}
