// api/src/livechat/livechat.mappers.ts — شکل خروجی گفتگو/پیام برای بازدیدکننده و اپراتور
import { Prisma } from '../generated/prisma';

export const OPERATOR_PUBLIC_SELECT = {
  id: true,
  displayName: true,
  title: true,
  avatarUrl: true,
} satisfies Prisma.LivechatOperatorSelect;

export const MESSAGE_INCLUDE = {
  operator: { select: OPERATOR_PUBLIC_SELECT },
} satisfies Prisma.LivechatMessageInclude;

export type MessageWithOperator = Prisma.LivechatMessageGetPayload<{
  include: typeof MESSAGE_INCLUDE;
}>;

export const CONVERSATION_SUMMARY_INCLUDE = {
  visitor: {
    select: {
      id: true,
      name: true,
      phone: true,
      userId: true,
      isBanned: true,
      currentUrl: true,
      currentTitle: true,
    },
  },
  operator: { select: OPERATOR_PUBLIC_SELECT },
  department: { select: { id: true, name: true } },
} satisfies Prisma.LivechatConversationInclude;

export type ConversationWithSummary = Prisma.LivechatConversationGetPayload<{
  include: typeof CONVERSATION_SUMMARY_INCLUDE;
}>;

export interface BotOption {
  id: string;
  label: string;
  /** node: گره منو، main: منوی اصلی، back: بازگشت، operator: اتصال به کارشناس، link: پیوند، kb: پاسخ پایگاه دانش، helpful: بازخورد پاسخ */
  kind: 'node' | 'main' | 'back' | 'operator' | 'link' | 'kb' | 'helpful';
  url?: string;
  nodeId?: string | null;
  kbId?: string;
  value?: 'yes' | 'no';
  icon?: string | null;
}

export function toMessageDto(m: MessageWithOperator) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderType: m.senderType,
    type: m.type,
    body: m.deletedAt ? '' : m.body,
    payload: m.deletedAt ? null : (m.payload ?? null),
    isInternal: m.isInternal,
    clientMessageId: m.clientMessageId,
    operator: m.operator
      ? {
          id: m.operator.id,
          displayName: m.operator.displayName,
          title: m.operator.title,
          avatarUrl: m.operator.avatarUrl,
        }
      : null,
    attachment:
      m.attachmentKey && !m.deletedAt
        ? {
            name: m.attachmentName,
            mime: m.attachmentMime,
            size: m.attachmentSize,
            isImage: (m.attachmentMime ?? '').startsWith('image/'),
          }
        : null,
    seenAt: m.seenAt,
    editedAt: m.editedAt,
    deleted: !!m.deletedAt,
    createdAt: m.createdAt,
  };
}

export type MessageDto = ReturnType<typeof toMessageDto>;

/** نسخه‌ی بازدیدکننده: یادداشت‌های داخلی هرگز ارسال نمی‌شوند */
export function toVisitorConversationDto(c: ConversationWithSummary) {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    isOffline: c.isOffline,
    operator: c.operator
      ? {
          id: c.operator.id,
          displayName: c.operator.displayName,
          title: c.operator.title,
          avatarUrl: c.operator.avatarUrl,
        }
      : null,
    department: c.department,
    rating: c.rating,
    unread: c.unreadByVisitor,
    closedAt: c.closedAt,
    createdAt: c.createdAt,
  };
}

export function toConversationSummary(
  c: ConversationWithSummary,
  visitorOnline: boolean,
) {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    subject: c.subject,
    isOffline: c.isOffline,
    isMissed: c.isMissed,
    tags: c.tags,
    rating: c.rating,
    unreadByOperator: c.unreadByOperator,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    queuedAt: c.queuedAt,
    assignedAt: c.assignedAt,
    closedAt: c.closedAt,
    createdAt: c.createdAt,
    visitor: {
      id: c.visitor.id,
      name: c.visitor.name,
      phone: c.visitor.phone,
      isUser: !!c.visitor.userId,
      isBanned: c.visitor.isBanned,
      currentUrl: c.visitor.currentUrl,
      currentTitle: c.visitor.currentTitle,
      online: visitorOnline,
    },
    operator: c.operator,
    department: c.department,
  };
}

export type ConversationSummary = ReturnType<typeof toConversationSummary>;

/** پیش‌نمایش کوتاه آخرین پیام در فهرست گفتگوها */
export function previewOf(
  body: string,
  type: string,
  attachmentName?: string | null,
) {
  if (type === 'FILE') return `📎 ${attachmentName ?? 'فایل'}`;
  const t = body.replace(/\s+/g, ' ').trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

/** جایگذاری متغیرهای {{name}} در متن */
export function renderTemplate(
  text: string,
  vars: Record<string, string | number | null | undefined>,
) {
  return (text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? all : String(v);
  });
}
