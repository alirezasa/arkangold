// api/src/livechat/livechat-realtime.service.ts
//
// حضور زنده (بازدیدکنندگان و اپراتورهای متصل) و ارسال رویدادها به اتاق‌های Socket.IO.
// سرویس‌ها مستقیماً به Gateway وابسته نیستند (جلوگیری از وابستگی چرخه‌ای)؛ Gateway هنگام
// راه‌اندازی، سرور Socket.IO را در این سرویس ثبت می‌کند.
//
// حضور در حافظه‌ی همین فرآیند نگه داشته می‌شود (API یک نمونه دارد). برای اجرای چند نمونه باید
// adapter ردیس Socket.IO و نگهداری حضور در Redis اضافه شود.
import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

export const ROOM_ALL_OPS = 'ops:all'; // اپراتورهای دارای دسترسی مشاهده‌ی همه‌ی گفتگوها
export const ROOM_OPS = 'ops'; // همه‌ی اپراتورهای متصل (صف انتظار)
export const visitorRoom = (visitorId: string) => `visitor:${visitorId}`;
export const operatorRoom = (operatorId: string) => `op:${operatorId}`;

export interface VisitorPresence {
  visitorId: string;
  sockets: Set<string>;
  url: string | null;
  title: string | null;
  connectedAt: Date;
  /** متن در حال تایپ (برای پیش‌نمایش به اپراتور) */
  typing: string | null;
}

export interface OperatorPresence {
  operatorId: string;
  adminUserId: string;
  sockets: Set<string>;
  status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  connectedAt: Date;
}

@Injectable()
export class LivechatRealtimeService {
  private server: Namespace | null = null;
  readonly visitors = new Map<string, VisitorPresence>();
  readonly operators = new Map<string, OperatorPresence>();
  /** زمان آخرین تخصیص هر اپراتور (تقسیم عادلانه در تساوی بار کاری) */
  readonly lastAssignedAt = new Map<string, number>();

  attach(server: Namespace) {
    this.server = server;
  }

  emit(room: string | string[], event: string, data: unknown) {
    if (!this.server) return;
    this.server.to(room).emit(event, data);
  }

  /** ارسال به یک اتاق به‌جز اعضای اتاق‌های دیگر */
  emitExcept(room: string, except: string[], event: string, data: unknown) {
    if (!this.server) return;
    this.server.to(room).except(except).emit(event, data);
  }

  // ── بازدیدکنندگان ──
  visitorConnected(
    visitorId: string,
    socketId: string,
    url?: string | null,
    title?: string | null,
  ) {
    let p = this.visitors.get(visitorId);
    const first = !p;
    if (!p) {
      p = {
        visitorId,
        sockets: new Set(),
        url: url ?? null,
        title: title ?? null,
        connectedAt: new Date(),
        typing: null,
      };
      this.visitors.set(visitorId, p);
    }
    p.sockets.add(socketId);
    if (url) p.url = url;
    if (title) p.title = title;
    return first;
  }

  /** خروجی true یعنی آخرین اتصال بازدیدکننده قطع شد */
  visitorDisconnected(visitorId: string, socketId: string): boolean {
    const p = this.visitors.get(visitorId);
    if (!p) return false;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      this.visitors.delete(visitorId);
      return true;
    }
    return false;
  }

  isVisitorOnline(visitorId: string) {
    return this.visitors.has(visitorId);
  }

  // ── اپراتورها ──
  operatorConnected(
    operatorId: string,
    adminUserId: string,
    socketId: string,
    status: OperatorPresence['status'],
  ) {
    let p = this.operators.get(operatorId);
    if (!p) {
      p = {
        operatorId,
        adminUserId,
        sockets: new Set(),
        status,
        connectedAt: new Date(),
      };
      this.operators.set(operatorId, p);
    }
    p.sockets.add(socketId);
    p.status = status;
  }

  operatorDisconnected(operatorId: string, socketId: string): boolean {
    const p = this.operators.get(operatorId);
    if (!p) return false;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      this.operators.delete(operatorId);
      return true;
    }
    return false;
  }

  setOperatorStatus(operatorId: string, status: OperatorPresence['status']) {
    const p = this.operators.get(operatorId);
    if (p) p.status = status;
  }

  /** اپراتورهای متصل با وضعیت «آنلاین» */
  onlineOperatorIds(): string[] {
    return [...this.operators.values()]
      .filter((p) => p.status === 'ONLINE')
      .map((p) => p.operatorId);
  }

  isOperatorConnected(operatorId: string) {
    return this.operators.has(operatorId);
  }

  disconnectSockets(socketIds: string[], reason: string) {
    if (!this.server) return;
    for (const id of socketIds) {
      const s = this.server.sockets.get(id);
      if (s) {
        s.emit('auth:expired', { reason });
        s.disconnect(true);
      }
    }
  }
}
