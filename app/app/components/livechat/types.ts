// app/app/components/livechat/types.ts — قرارداد داده‌های ویجت چت با API

export interface BotOption {
  id: string;
  label: string;
  kind: "node" | "main" | "back" | "operator" | "link" | "kb" | "helpful";
  url?: string;
  nodeId?: string | null;
  kbId?: string;
  value?: "yes" | "no";
  icon?: string | null;
}

export interface FormField {
  name: "name" | "phone" | "email" | "department" | "message";
  label: string;
  required: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: "VISITOR" | "OPERATOR" | "BOT" | "SYSTEM";
  type: "TEXT" | "FILE" | "OPTIONS" | "EVENT" | "RATING" | "FORM";
  body: string;
  payload: {
    options?: BotOption[];
    form?: "prechat" | "offline";
    fields?: FormField[];
    departments?: { id: string; name: string }[];
    submitted?: boolean;
    event?: string;
    rated?: number | null;
    comment?: string | null;
    askComment?: boolean;
    offline?: boolean;
  } | null;
  isInternal: boolean;
  clientMessageId: string | null;
  operator: { id: string; displayName: string; title: string | null; avatarUrl: string | null } | null;
  attachment: { name: string | null; mime: string | null; size: number | null; isImage: boolean } | null;
  seenAt: string | null;
  createdAt: string;
  /** فقط سمت کلاینت: پیام در حال ارسال یا ناموفق */
  local?: "sending" | "failed";
  localError?: string;
}

export interface ChatConversation {
  id: string;
  number: number;
  status: "BOT" | "WAITING" | "OPEN" | "CLOSED";
  isOffline: boolean;
  operator: { id: string; displayName: string; title: string | null; avatarUrl: string | null } | null;
  department: { id: string; name: string } | null;
  rating: number | null;
  unread: number;
}

export interface Availability {
  online: boolean;
  withinHours: boolean;
  workingHoursText: string;
  hidden: boolean;
}

export interface WidgetSettings {
  enabled: boolean;
  widget: {
    title: string;
    subtitle: string;
    offlineSubtitle: string;
    welcomeMessage: string;
    primaryColor: string;
    accentColor: string;
    position: "left" | "right";
    offsetX: number;
    offsetBottom: number;
    launcherText: string;
    showLauncherText: boolean;
    showOnMobile: boolean;
    hiddenPaths: string[];
    showOperatorAvatar: boolean;
    soundEnabled: boolean;
    allowFileUpload: boolean;
    allowVisitorEndChat: boolean;
    composerPlaceholder: string;
  };
  bot: { enabled: boolean; mainMenuLabel: string; operatorButtonLabel: string; showOperatorButton: boolean };
  offline: { mode: "form" | "message" | "hide"; title: string; text: string };
  rating: { enabled: boolean; text: string; askComment: boolean; thanksText: string };
  maxMessageLength: number;
}

export interface ChatTrigger {
  id: string;
  message: string;
  urlContains: string | null;
  delaySeconds: number;
  onlyWhenOnline: boolean;
  openWidget: boolean;
}

export interface SessionResponse {
  token: string;
  banned: boolean;
  visitor: { id: string; name: string | null; phone: string | null; isUser: boolean };
  settings: WidgetSettings;
  availability: Availability;
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  hasMore: boolean;
  menu: { greeting: string; options: BotOption[] };
  triggers: ChatTrigger[];
}
