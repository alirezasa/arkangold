// admin/app/components/livechat/types.ts — داده‌های میز کار چت آنلاین

export type ConvStatus = "BOT" | "WAITING" | "OPEN" | "CLOSED";
export type OperatorStatus = "ONLINE" | "AWAY" | "OFFLINE";

export interface OperatorRef {
  id: string;
  displayName: string;
  title: string | null;
  avatarUrl: string | null;
}

export interface ConversationSummary {
  id: string;
  number: number;
  status: ConvStatus;
  subject: string | null;
  isOffline: boolean;
  isMissed: boolean;
  tags: string[];
  rating: number | null;
  unreadByOperator: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  queuedAt: string | null;
  assignedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  visitor: {
    id: string;
    name: string | null;
    phone: string | null;
    isUser: boolean;
    isBanned: boolean;
    currentUrl: string | null;
    currentTitle: string | null;
    online: boolean;
  };
  operator: OperatorRef | null;
  department: { id: string; name: string } | null;
}

export interface BotOption {
  id: string;
  label: string;
  kind: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: "VISITOR" | "OPERATOR" | "BOT" | "SYSTEM";
  type: "TEXT" | "FILE" | "OPTIONS" | "EVENT" | "RATING" | "FORM";
  body: string;
  payload: {
    options?: BotOption[];
    form?: string;
    fields?: { name: string; label: string }[];
    submitted?: boolean;
    event?: string;
    rated?: number | null;
    comment?: string | null;
    smart?: boolean;
    selected?: string;
  } | null;
  isInternal: boolean;
  clientMessageId: string | null;
  operator: OperatorRef | null;
  attachment: { name: string | null; mime: string | null; size: number | null; isImage: boolean } | null;
  seenAt: string | null;
  createdAt: string;
  local?: "sending" | "failed";
  localError?: string;
}

export interface VisitorProfile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  isBanned: boolean;
  bannedReason: string | null;
  lastIp: string | null;
  userAgent: string | null;
  currentUrl: string | null;
  currentTitle: string | null;
  referrer: string | null;
  visitsCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  online: boolean;
  user: {
    id: string;
    phone: string;
    status: string;
    createdAt: string;
    fullName: string | null;
    identityStatus: string | null;
  } | null;
  conversationsCount: number;
  previousConversations: {
    id: string;
    number: number;
    status: ConvStatus;
    subject: string | null;
    createdAt: string;
    rating: number | null;
    lastMessagePreview: string | null;
  }[];
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  extra: { startUrl: string | null; ratingComment: string | null; firstResponseAt: string | null; closedBy: string | null };
  visitor: VisitorProfile;
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  operatorId: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  usageCount: number;
}

export interface OperatorPresence {
  id: string;
  displayName: string;
  title: string | null;
  avatarUrl: string | null;
  maxConcurrentChats: number;
  connected: boolean;
  status: OperatorStatus;
  activeChats: number;
}

export interface Counts {
  queue: number;
  offline: number;
  mine: number;
  open: number;
  bot: number;
  unreadMine: number;
}

export interface OnlineVisitor {
  visitorId: string;
  name: string | null;
  phone: string | null;
  isUser: boolean;
  visitsCount?: number;
  url: string | null;
  title: string | null;
  connectedAt: string;
  activeConversation?: { id: string; status: ConvStatus; operatorId: string | null } | null;
}

export interface Bootstrap {
  me: {
    id: string;
    displayName: string;
    title: string | null;
    avatarUrl: string | null;
    status: OperatorStatus;
    maxConcurrentChats: number;
    acceptsAutoAssign: boolean;
    permissions: string[];
    departments: { id: string; name: string }[];
  };
  counts: Counts;
  canned: CannedResponse[];
  departments: { id: string; name: string }[];
  presence: OperatorPresence[];
  settings: { typingPreview: boolean; soundEnabled: boolean };
}

export const STATUS_META: Record<ConvStatus, { label: string; bg: string; color: string }> = {
  BOT: { label: "با ربات", bg: "#eef2ff", color: "#4338ca" },
  WAITING: { label: "در صف", bg: "#fef3c7", color: "#92400e" },
  OPEN: { label: "در گفتگو", bg: "#dcfce7", color: "#166534" },
  CLOSED: { label: "بسته", bg: "#f3f4f6", color: "#4b5563" },
};

export const OPERATOR_STATUS_META: Record<OperatorStatus, { label: string; color: string }> = {
  ONLINE: { label: "آنلاین", color: "#22c55e" },
  AWAY: { label: "دور از میز", color: "#f59e0b" },
  OFFLINE: { label: "آفلاین", color: "#9ca3af" },
};
