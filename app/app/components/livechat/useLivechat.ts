"use client";
// app/app/components/livechat/useLivechat.ts
//
// وضعیت ویجت چت: نشست بازدیدکننده (از BFF)، اتصال بلادرنگ Socket.IO مستقیم به API، پیام‌ها
// (با ارسال خوش‌بینانه و جلوگیری از تکرار)، «در حال نوشتن»، خوانده شدن و شمارنده‌ی خوانده‌نشده.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Availability,
  BotOption,
  ChatConversation,
  ChatMessage,
  SessionResponse,
} from "./types";

const TOKEN_KEY = "arkan_livechat_token";
const SOCKET_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN ||
  (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(t: string | null) {
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ذخیره‌سازی مرورگر در دسترس نیست؛ نشست فقط تا بستن صفحه می‌ماند
  }
}

const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Ack<T = unknown> = { ok: boolean; data?: T; error?: string };

function sortMessages(list: ChatMessage[]) {
  return [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** ادغام پیام‌های سرور با فهرست فعلی: پیام موقت با همان clientMessageId جایگزین می‌شود */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    if (m.isInternal) continue;
    if (m.clientMessageId) {
      for (const [id, existing] of byId) {
        if (existing.local && existing.clientMessageId === m.clientMessageId) byId.delete(id);
      }
    }
    byId.set(m.id, m);
  }
  return sortMessages([...byId.values()]);
}

/** صدای کوتاه اعلان پیام (بدون فایل صوتی) */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.09);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
    o.onended = () => void ctx.close();
  } catch {
    // پخش صدا مجاز نیست (پیش از تعامل کاربر)
  }
}

export function useLivechat(
  pathname: string,
  isOpen: boolean,
  muted: boolean,
  onRemoteOpen: () => void,
) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [connected, setConnected] = useState(false);
  const [operatorTyping, setOperatorTyping] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unread, setUnread] = useState(0);
  const [banned, setBanned] = useState(false);
  const [loadedAt, setLoadedAt] = useState(() => new Date(0).toISOString());

  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const openRef = useRef(isOpen);
  const soundRef = useRef(true);
  const mutedRef = useRef(muted);
  const remoteOpenRef = useRef(onRemoteOpen);
  const typingTimer = useRef<number | null>(null);
  const lastTypingSent = useRef(0);
  useEffect(() => {
    openRef.current = isOpen;
    mutedRef.current = muted;
    remoteOpenRef.current = onRemoteOpen;
  }, [isOpen, muted, onRemoteOpen]);

  const inDashboard = pathname.startsWith("/dashboard");

  const loadSession = useCallback(async () => {
    const res = await fetch("/api/livechat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: readToken() ?? undefined,
        url: window.location.href.slice(0, 1000),
        title: document.title.slice(0, 300),
        referrer: document.referrer.slice(0, 1000) || undefined,
      }),
    });
    if (!res.ok) throw new Error("session");
    const data = (await res.json()) as SessionResponse;
    tokenRef.current = data.token;
    saveToken(data.token);
    soundRef.current = data.settings.widget.soundEnabled;
    setSession(data);
    setLoadedAt(new Date().toISOString());
    setBanned(data.banned);
    setAvailability(data.availability);
    setConversation(data.conversation);
    setHasMore(data.hasMore);
    setMessages((cur) => mergeMessages(cur.filter((m) => m.local), data.messages));
    setUnread(data.conversation?.unread ?? 0);
    return data;
  }, []);

  // نشست: بار اول با کمی تأخیر (بارگذاری صفحه کند نشود)؛ با ورود/خروج از داشبورد دوباره
  // ساخته می‌شود تا گفتگو به حساب کاربر واردشده متصل (یا از آن جدا) شود
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      loadSession().catch(() => {
        if (!cancelled) setSession(null);
      });
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [loadSession, inDashboard]);

  // اتصال بلادرنگ
  const token = session?.token;
  const enabled = !!session?.settings.enabled && !session?.banned;
  useEffect(() => {
    if (!token || !enabled) return;
    const socket = io(`${SOCKET_ORIGIN}/livechat`, {
      auth: { visitorToken: token, url: window.location.href.slice(0, 1000), title: document.title.slice(0, 300) },
      reconnectionDelayMax: 15_000,
    });
    socketRef.current = socket;
    let resynced = false;

    socket.on("connect", () => {
      setConnected(true);
      // پس از اتصال مجدد، پیام‌های از دست‌رفته همگام می‌شوند
      if (resynced) void loadSession().catch(() => undefined);
      resynced = true;
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("ready", (d: { availability: Availability }) => setAvailability(d.availability));
    socket.on("availability", (a: Availability) => setAvailability(a));
    socket.on("auth:error", (e: { code?: string }) => {
      if (e?.code === "BANNED") setBanned(true);
      else {
        saveToken(null);
        void loadSession().catch(() => undefined);
      }
    });
    socket.on("auth:expired", (e: { reason?: string }) => {
      if (e?.reason === "banned") setBanned(true);
    });
    socket.on("message:new", (m: ChatMessage) => {
      setMessages((cur) => mergeMessages(cur, [m]));
      if (m.senderType === "OPERATOR" || m.senderType === "BOT") {
        if (m.senderType === "OPERATOR") setOperatorTyping(null);
        const visible = openRef.current && document.visibilityState === "visible";
        if (!visible && m.senderType === "OPERATOR") {
          setUnread((u) => u + 1);
          if (soundRef.current && !mutedRef.current) beep();
        }
      }
    });
    socket.on("message:updated", (m: ChatMessage) => setMessages((cur) => mergeMessages(cur, [m])));
    socket.on("message:seen", (d: { at: string }) =>
      setMessages((cur) => cur.map((m) => (m.senderType === "VISITOR" && !m.seenAt ? { ...m, seenAt: d.at } : m))),
    );
    socket.on("conversation:updated", (c: ChatConversation) => setConversation(c));
    socket.on("operator:typing", (d: { typing: boolean; operatorName: string }) => {
      setOperatorTyping(d.typing ? d.operatorName : null);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      if (d.typing) typingTimer.current = window.setTimeout(() => setOperatorTyping(null), 6000);
    });
    socket.on("chat:open", () => remoteOpenRef.current());

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, enabled, loadSession]);

  // اطلاع صفحه‌ی فعلی به اپراتورها
  useEffect(() => {
    const s = socketRef.current;
    if (!s?.connected) return;
    const t = window.setTimeout(() => {
      s.emit("visitor:page", { url: window.location.href.slice(0, 1000), title: document.title.slice(0, 300) });
    }, 500);
    return () => window.clearTimeout(t);
  }, [pathname, connected]);

  const emitAck = useCallback(<T,>(event: string, data: unknown) => {
    return new Promise<Ack<T>>((resolve) => {
      const s = socketRef.current;
      if (!s) return resolve({ ok: false, error: "اتصال برقرار نیست" });
      s.timeout(15_000).emit(event, data, (err: Error | null, res: Ack<T>) => {
        if (err) resolve({ ok: false, error: "پاسخی از سرور دریافت نشد؛ دوباره تلاش کنید" });
        else resolve(res ?? { ok: false });
      });
    });
  }, []);

  const pushLocal = useCallback((m: Partial<ChatMessage> & { clientMessageId: string }) => {
    const local: ChatMessage = {
      id: `local-${m.clientMessageId}`,
      conversationId: "",
      senderType: "VISITOR",
      type: "TEXT",
      body: "",
      payload: null,
      isInternal: false,
      operator: null,
      attachment: null,
      seenAt: null,
      createdAt: new Date().toISOString(),
      local: "sending",
      ...m,
    };
    setMessages((cur) => sortMessages([...cur, local]));
    return local.id;
  }, []);

  const failLocal = useCallback((id: string, error?: string) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, local: "failed", localError: error } : m)));
  }, []);

  const sendText = useCallback(
    async (text: string, triggerId?: string | null, retryOf?: ChatMessage) => {
      const body = text.trim();
      if (!body) return;
      const clientMessageId = retryOf?.clientMessageId ?? newClientId();
      if (retryOf) setMessages((cur) => cur.filter((m) => m.id !== retryOf.id));
      const localId = pushLocal({ clientMessageId, body });
      socketRef.current?.emit("visitor:typing", { text: "" });
      const res = await emitAck<ChatMessage>("visitor:message", { text: body, clientMessageId, triggerId });
      if (res.ok && res.data) setMessages((cur) => mergeMessages(cur, [res.data as ChatMessage]));
      else failLocal(localId, res.error);
    },
    [emitAck, failLocal, pushLocal],
  );

  const selectOption = useCallback(
    async (o: BotOption, triggerId?: string | null) => {
      if (o.kind === "link") return;
      const clientMessageId = newClientId();
      const localId = pushLocal({ clientMessageId, body: o.label });
      const res = await emitAck("visitor:option", {
        kind: o.kind,
        nodeId: o.nodeId ?? null,
        kbId: o.kbId ?? null,
        value: o.value ?? null,
        clientMessageId,
        triggerId,
      });
      if (!res.ok) failLocal(localId, res.error);
    },
    [emitAck, failLocal, pushLocal],
  );

  const submitForm = useCallback(
    async (messageId: string, values: Record<string, string>) => {
      const res = await emitAck("visitor:form", { messageId, values });
      if (!res.ok) throw new Error(res.error ?? "ثبت اطلاعات ناموفق بود");
    },
    [emitAck],
  );

  const rate = useCallback(
    async (messageId: string, rating: number, comment?: string) => {
      const res = await emitAck("visitor:rate", { messageId, rating, comment });
      if (!res.ok) throw new Error(res.error ?? "ثبت امتیاز ناموفق بود");
    },
    [emitAck],
  );

  const endChat = useCallback(async () => {
    const res = await emitAck("visitor:end", {});
    if (!res.ok) throw new Error(res.error ?? "پایان گفتگو ناموفق بود");
  }, [emitAck]);

  const upload = useCallback(
    async (file: File) => {
      const clientMessageId = newClientId();
      const localId = pushLocal({
        clientMessageId,
        type: "FILE",
        attachment: { name: file.name, mime: file.type, size: file.size, isImage: false },
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientMessageId", clientMessageId);
      try {
        const res = await fetch("/api/livechat/upload", {
          method: "POST",
          headers: { "x-livechat-token": tokenRef.current ?? "" },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) return failLocal(localId, data?.message ?? "ارسال فایل ناموفق بود");
        setMessages((cur) => mergeMessages(cur, [data as ChatMessage]));
      } catch {
        failLocal(localId, "ارسال فایل ناموفق بود");
      }
    },
    [failLocal, pushLocal],
  );

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return;
    const first = messages.find((m) => !m.local);
    if (!first) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/livechat/messages?before=${encodeURIComponent(first.createdAt)}`, {
        headers: { "x-livechat-token": tokenRef.current ?? "" },
      });
      if (res.ok) {
        const data = (await res.json()) as { items: ChatMessage[]; hasMore: boolean };
        setMessages((cur) => mergeMessages(cur, data.items));
        setHasMore(data.hasMore);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages]);

  /** دریافت پیوست با توکن بازدیدکننده (تصویر درون‌خطی یا دانلود) */
  const fetchAttachment = useCallback(async (messageId: string) => {
    const res = await fetch(`/api/livechat/attachments/${messageId}`, {
      headers: { "x-livechat-token": tokenRef.current ?? "" },
    });
    if (!res.ok) throw new Error("دریافت فایل ناموفق بود");
    return res.blob();
  }, []);

  const markSeen = useCallback(() => {
    setUnread(0);
    socketRef.current?.emit("visitor:seen", {}, () => undefined);
  }, []);

  const typing = useCallback((text: string) => {
    const now = Date.now();
    if (text && now - lastTypingSent.current < 800) return;
    lastTypingSent.current = now;
    socketRef.current?.emit("visitor:typing", { text: text.slice(0, 300) });
  }, []);

  // خوانده شدن پیام‌ها هنگام باز بودن پنجره
  const lastIncoming = useMemo(
    () => [...messages].reverse().find((m) => m.senderType !== "VISITOR" && !m.local)?.id,
    [messages],
  );
  useEffect(() => {
    if (!isOpen || !connected) return;
    const run = () => document.visibilityState === "visible" && markSeen();
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [isOpen, connected, lastIncoming, markSeen]);

  return {
    session,
    messages,
    conversation,
    availability,
    connected,
    operatorTyping,
    hasMore,
    loadingOlder,
    unread,
    banned,
    loadedAt,
    sendText,
    selectOption,
    submitForm,
    rate,
    endChat,
    upload,
    loadOlder,
    fetchAttachment,
    typing,
  };
}

export type LivechatApi = ReturnType<typeof useLivechat>;
