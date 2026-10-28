"use client";
// admin/app/(dashboard)/livechat/page.tsx — میز کار چت آنلاین
//
// سه ستون: فهرست گفتگوها (صف، گفتگوهای من، همه، پیام‌های آفلاین، ربات، بسته‌شده، بازدیدکنندگان
// آنلاین) ← گفتگوی انتخاب‌شده ← مشخصات بازدیدکننده. همه‌چیز بلادرنگ از کانال Socket.IO می‌آید و
// تغییرات (ارسال، پذیرش، انتقال، بستن) از REST پنل با ممیزی و قفل نشست انجام می‌شود.
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import axios from "axios";
import Link from "next/link";
import { Bell, BellOff, Globe, Loader2, MessagesSquare, Send, Settings, WifiOff } from "lucide-react";
import ConversationList, { type ConsoleView, relTime, visitorLabel } from "@/app/components/livechat/ConversationList";
import ChatView from "@/app/components/livechat/ChatView";
import VisitorPanel from "@/app/components/livechat/VisitorPanel";
import { useOperatorSocket } from "@/app/components/livechat/useOperatorSocket";
import { playChatSound, unlockChatSound } from "@/app/components/livechat/sound";
import type {
  Bootstrap,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  OnlineVisitor,
  OperatorPresence,
  OperatorStatus,
  VisitorProfile,
} from "@/app/components/livechat/types";
import { OPERATOR_STATUS_META } from "@/app/components/livechat/types";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function OnlineVisitors({
  visitors,
  onOpen,
  onStart,
}: {
  visitors: OnlineVisitor[];
  onOpen: (conversationId: string) => void;
  onStart: (v: OnlineVisitor) => void;
}) {
  if (!visitors.length) return <p className="py-10 text-center text-[12px] text-gray-400">بازدیدکننده‌ی آنلاینی نیست</p>;
  return (
    <>
      {visitors.map((v) => (
        <div key={v.visitorId} className="border-b px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-600" />
            <span className="text-[12.5px] font-black text-gray-800">{visitorLabel(v)}</span>
            {v.isUser && <span className="rounded bg-blue-50 px-1 text-[9.5px] font-bold text-blue-600">کاربر</span>}
            <span className="mr-auto text-[10px] text-gray-400">{relTime(v.connectedAt)}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-gray-500" dir="auto" title={v.url ?? ""}>
            {v.title || v.url}
          </p>
          {v.activeConversation ? (
            <button type="button" onClick={() => onOpen(v.activeConversation!.id)} className="mt-1 text-[11px] font-bold text-blue-700">
              مشاهده‌ی گفتگوی جاری
            </button>
          ) : (
            <button type="button" onClick={() => onStart(v)} className="mt-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--color-emerald)" }}>
              <Send className="h-3 w-3 -scale-x-100" /> شروع گفتگو
            </button>
          )}
        </div>
      ))}
    </>
  );
}
const SOUND_KEY = "arkan-admin-livechat-sound";

function matchesView(c: ConversationSummary, view: ConsoleView, meId: string) {
  switch (view) {
    case "queue":
      return c.status === "WAITING" && !c.operator && !c.isOffline;
    case "offline":
      return c.status === "WAITING" && !c.operator && c.isOffline;
    case "mine":
      return c.status === "OPEN" && c.operator?.id === meId;
    case "open":
      return c.status === "OPEN";
    case "bot":
      return c.status === "BOT";
    case "closed":
      return c.status === "CLOSED";
    default:
      return false;
  }
}

function sortFor(view: ConsoleView) {
  return (a: ConversationSummary, b: ConversationSummary) =>
    view === "queue" || view === "offline"
      ? new Date(a.queuedAt ?? a.createdAt).getTime() - new Date(b.queuedAt ?? b.createdAt).getTime()
      : new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
}

const newClientId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function LivechatConsolePage() {
  const { data: boot, mutate: mutateBoot } = useSWR<Bootstrap>("/api/admin/livechat/bootstrap", fetcher);
  const me = boot?.me;
  const canViewAll = !!me?.permissions.includes("livechat.view_all");
  const canManage = !!me?.permissions.includes("livechat.manage");

  const [view, setView] = useState<ConsoleView>("queue");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const { data: counts, mutate: mutateCounts } = useSWR("/api/admin/livechat/counts", fetcher, { refreshInterval: 60_000 });
  const [presenceLive, setPresence] = useState<OperatorPresence[] | null>(null);
  const presence = presenceLive ?? boot?.presence ?? [];
  const [visitors, setVisitors] = useState<OnlineVisitor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [typing, setTyping] = useState<Record<string, string | null>>({});
  const [showInfo, setShowInfo] = useState(() => typeof window === "undefined" || window.innerWidth >= 1280);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusLive, setStatus] = useState<OperatorStatus | null>(null);
  const status = statusLive ?? boot?.me.status ?? null;
  const selectedRef = useRef<string | null>(null);
  const viewRef = useRef(view);
  const soundRef = useRef(soundOn);
  useEffect(() => {
    selectedRef.current = selectedId;
    viewRef.current = view;
    soundRef.current = soundOn;
  });

  // صدا پس از اولین تعامل کاربر فعال می‌شود
  useEffect(() => {
    window.addEventListener("pointerdown", unlockChatSound, { once: true });
    return () => window.removeEventListener("pointerdown", unlockChatSound);
  }, []);

  // ── فهرست ──
  const loadList = useCallback(
    async (cursor?: string | null) => {
      if (view === "visitors") {
        const res = await axios.get<OnlineVisitor[]>("/api/admin/livechat/visitors/online");
        setVisitors(res.data);
        return;
      }
      setLoadingList(true);
      try {
        const res = await axios.get<{ items: ConversationSummary[]; nextCursor: string | null }>(
          "/api/admin/livechat/conversations",
          { params: { view, search: debounced || undefined, cursor: cursor || undefined } },
        );
        setItems((cur) => (cursor ? [...cur, ...res.data.items] : res.data.items));
        setNextCursor(res.data.nextCursor);
      } finally {
        setLoadingList(false);
      }
    },
    [view, debounced],
  );
  useEffect(() => {
    // دریافت فهرست با تغییر زبانه/جستجو
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  // ── گفتگوی انتخاب‌شده ──
  const openConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await axios.get<ConversationDetail>(`/api/admin/livechat/conversations/${id}`);
    if (selectedRef.current !== id) return;
    setDetail(res.data);
    setMessages(res.data.messages);
    setHasMore(res.data.hasMore);
    if (res.data.conversation.unreadByOperator > 0) void axios.post(`/api/admin/livechat/conversations/${id}/seen`);
  }, []);

  const countsTimer = useRef<number | null>(null);
  const refreshCounts = useCallback(() => {
    if (countsTimer.current) window.clearTimeout(countsTimer.current);
    countsTimer.current = window.setTimeout(() => void mutateCounts(), 400);
  }, [mutateCounts]);

  // ── رویدادهای بلادرنگ ──
  const upsert = useCallback(
    (c: ConversationSummary) => {
      const v = viewRef.current;
      const meId = me?.id ?? "";
      setItems((cur) => {
        const rest = cur.filter((x) => x.id !== c.id);
        if (!matchesView(c, v, meId) || debounced) return debounced ? cur.map((x) => (x.id === c.id ? c : x)) : rest;
        return [...rest, c].sort(sortFor(v));
      });
      setDetail((d) => (d && d.conversation.id === c.id ? { ...d, conversation: c } : d));
      refreshCounts();
    },
    [me?.id, debounced, refreshCounts],
  );

  const socket = useOperatorSocket(
    {
      "conversation:updated": ((c: ConversationSummary) => upsert(c)) as never,
      "conversation:hidden": ((d: { id: string }) => {
        setItems((cur) => cur.filter((x) => x.id !== d.id));
        refreshCounts();
      }) as never,
      "conversation:assigned": ((d: { id: string; by: string }) => {
        if (soundRef.current) playChatSound("queue");
        if (d.by === "auto" || d.by === "transfer") {
          if (!selectedRef.current) {
            setView("mine");
            void openConversation(d.id);
          }
        }
      }) as never,
      "queue:new": (() => {
        if (soundRef.current) playChatSound("queue");
        refreshCounts();
      }) as never,
      "message:new": ((m: ChatMessage) => {
        if (m.conversationId === selectedRef.current) {
          setMessages((cur) => {
            const rest = m.clientMessageId ? cur.filter((x) => !(x.local && x.clientMessageId === m.clientMessageId)) : cur;
            return rest.some((x) => x.id === m.id) ? rest : [...rest, m];
          });
          if (m.senderType === "VISITOR") {
            setTyping((t) => ({ ...t, [m.conversationId]: null }));
            if (document.visibilityState === "visible") void axios.post(`/api/admin/livechat/conversations/${m.conversationId}/seen`);
          }
        }
        if (m.senderType === "VISITOR" && soundRef.current && (m.conversationId !== selectedRef.current || document.visibilityState !== "visible")) {
          playChatSound("message");
        }
      }) as never,
      "message:updated": ((m: ChatMessage) => {
        if (m.conversationId === selectedRef.current) setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
      }) as never,
      "message:seen": ((d: { conversationId: string; at: string }) => {
        if (d.conversationId === selectedRef.current) {
          setMessages((cur) => cur.map((x) => (x.senderType === "OPERATOR" && !x.seenAt ? { ...x, seenAt: d.at } : x)));
        }
      }) as never,
      "visitor:typing": ((d: { conversationId: string; typing: boolean; preview: string | null }) => {
        setTyping((t) => ({ ...t, [d.conversationId]: d.typing ? (d.preview ?? "") : null }));
      }) as never,
      "visitor:online": ((v: OnlineVisitor) => {
        setVisitors((cur) => [v, ...cur.filter((x) => x.visitorId !== v.visitorId)]);
        setItems((cur) => cur.map((x) => (x.visitor.id === v.visitorId ? { ...x, visitor: { ...x.visitor, online: true } } : x)));
      }) as never,
      "visitor:offline": ((d: { visitorId: string }) => {
        setVisitors((cur) => cur.filter((x) => x.visitorId !== d.visitorId));
        setItems((cur) => cur.map((x) => (x.visitor.id === d.visitorId ? { ...x, visitor: { ...x.visitor, online: false } } : x)));
      }) as never,
      "visitor:page": ((d: { visitorId: string; currentUrl?: string; currentTitle?: string }) => {
        setVisitors((cur) =>
          cur.map((x) => (x.visitorId === d.visitorId ? { ...x, url: d.currentUrl ?? x.url, title: d.currentTitle ?? x.title } : x)),
        );
      }) as never,
      "operators:presence": ((p: OperatorPresence[]) => setPresence(p)) as never,
    },
    !!boot,
  );

  // پس از اتصال مجدد، فهرست و گفتگوی باز همگام می‌شوند
  const wasConnected = useRef(false);
  useEffect(() => {
    if (socket.connected && wasConnected.current) {
      void loadList();
      if (selectedRef.current) void openConversation(selectedRef.current);
      void mutateCounts();
    }
    if (socket.connected) wasConnected.current = true;
  }, [socket.connected, loadList, openConversation, mutateCounts]);

  // شمارنده‌ی خوانده‌نشده در عنوان برگه
  useEffect(() => {
    const n = (counts?.queue ?? 0) + (counts?.unreadMine ?? 0) + (counts?.offline ?? 0);
    const base = "میز کار چت آنلاین";
    document.title = n ? `(${n.toLocaleString("fa-IR")}) ${base}` : base;
  }, [counts]);

  // ── اقدامات ──
  const setMyStatus = async (s: OperatorStatus) => {
    setStatusBusy(true);
    try {
      await axios.post("/api/admin/livechat/me/status", { status: s });
      setStatus(s);
    } finally {
      setStatusBusy(false);
    }
  };

  const send = async (text: string, isInternal: boolean) => {
    if (!detail) return;
    const id = detail.conversation.id;
    const clientMessageId = newClientId();
    const local: ChatMessage = {
      id: `local-${clientMessageId}`,
      conversationId: id,
      senderType: "OPERATOR",
      type: "TEXT",
      body: text,
      payload: null,
      isInternal,
      clientMessageId,
      operator: me ? { id: me.id, displayName: me.displayName, title: me.title, avatarUrl: me.avatarUrl } : null,
      attachment: null,
      seenAt: null,
      createdAt: new Date().toISOString(),
      local: "sending",
    };
    setMessages((cur) => [...cur, local]);
    try {
      const res = await axios.post<ChatMessage>(`/api/admin/livechat/conversations/${id}/messages`, { text, isInternal, clientMessageId });
      setMessages((cur) => {
        const rest = cur.filter((x) => x.id !== local.id);
        return rest.some((x) => x.id === res.data.id) ? rest : [...rest, res.data];
      });
    } catch (e) {
      const msg = axios.isAxiosError(e) ? (e.response?.data as { message?: string })?.message : undefined;
      setMessages((cur) => cur.map((x) => (x.id === local.id ? { ...x, local: "failed", localError: msg } : x)));
    }
  };

  const upload = async (file: File) => {
    if (!detail) return;
    const id = detail.conversation.id;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("clientMessageId", newClientId());
    try {
      const res = await axios.post<ChatMessage>(`/api/admin/livechat/conversations/${id}/upload`, fd);
      setMessages((cur) => (cur.some((x) => x.id === res.data.id) ? cur : [...cur, res.data]));
    } catch (e) {
      window.alert(axios.isAxiosError(e) ? ((e.response?.data as { message?: string })?.message ?? "ارسال فایل ناموفق بود") : "ارسال فایل ناموفق بود");
    }
  };

  const loadOlder = async () => {
    if (!detail || !hasMore || !messages.length) return;
    const res = await axios.get<{ messages: ChatMessage[]; hasMore: boolean }>(
      `/api/admin/livechat/conversations/${detail.conversation.id}/messages`,
      { params: { before: messages[0].createdAt } },
    );
    setMessages((cur) => [...res.data.messages, ...cur]);
    setHasMore(res.data.hasMore);
  };

  const startChat = async (v: OnlineVisitor) => {
    const text = window.prompt(`پیام آغاز گفتگو با ${visitorLabel(v)}:`, "سلام 👋 می‌توانم کمکتان کنم؟");
    if (!text?.trim()) return;
    try {
      const res = await axios.post<{ conversationId: string }>(`/api/admin/livechat/visitors/${v.visitorId}/start`, { text });
      setView("mine");
      void openConversation(res.data.conversationId);
    } catch (e) {
      window.alert(axios.isAxiosError(e) ? ((e.response?.data as { message?: string })?.message ?? "خطا") : "خطا");
    }
  };

  if (!boot || !me) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--color-gold-500)" }} />
      </div>
    );
  }

  const statusMeta = OPERATOR_STATUS_META[status ?? "OFFLINE"];
  const showList = !selectedId;

  return (
    <div className="-m-4 flex h-[calc(100dvh-8.5rem)] flex-col sm:-m-6 lg:h-[100dvh]" dir="rtl">
      {/* نوار بالا */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
        <MessagesSquare className="h-5 w-5" style={{ color: "var(--color-emerald)" }} />
        <h1 className="text-[14px] font-black text-gray-900">میز کار چت آنلاین</h1>
        {!socket.connected && (
          <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            <WifiOff className="h-3.5 w-3.5" /> {socket.authError ?? "در حال اتصال…"}
          </span>
        )}
        <div className="mr-auto flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
            {(["ONLINE", "AWAY", "OFFLINE"] as OperatorStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                disabled={statusBusy}
                onClick={() => setMyStatus(s)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-bold ${status === s ? "bg-gray-900 text-white" : "bg-white text-gray-600"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OPERATOR_STATUS_META[s].color }} />
                {OPERATOR_STATUS_META[s].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSoundOn((v) => {
                try {
                  window.localStorage.setItem(SOUND_KEY, v ? "off" : "on");
                } catch {
                  // ignore
                }
                return !v;
              });
            }}
            title={soundOn ? "بی‌صدا" : "صدای اعلان"}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            {soundOn ? <Bell className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
          </button>
          {canManage && (
            <Link href="/livechat/settings" title="تنظیمات چت" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
              <Settings className="h-4.5 w-4.5" />
            </Link>
          )}
        </div>
      </div>
      {status === "OFFLINE" && (
        <div className="bg-gray-100 px-3 py-1.5 text-[11.5px] text-gray-600">
          وضعیت شما «آفلاین» است و گفتگوی جدیدی به شما تخصیص داده نمی‌شود؛ برای دریافت گفتگو «آنلاین» شوید.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* فهرست */}
        <aside
          className={`w-full shrink-0 border-l bg-white lg:block lg:w-[320px] ${showList ? "block" : "hidden"}`}
          style={{ borderColor: "var(--color-border)" }}
        >
          <ConversationList
            view={view}
            onView={setView}
            counts={counts}
            canViewAll={canViewAll}
            items={items}
            loading={loadingList}
            selectedId={selectedId}
            onSelect={(id) => void openConversation(id)}
            search={search}
            onSearch={setSearch}
            typing={typing}
            onlineVisitorsCount={visitors.length}
            hasMore={!!nextCursor}
            onLoadMore={() => void loadList(nextCursor)}
            customBody={
              view === "visitors" ? (
                <OnlineVisitors visitors={visitors} onOpen={(id) => void openConversation(id)} onStart={startChat} />
              ) : undefined
            }
          />
        </aside>

        {/* گفتگو */}
        <main className={`min-w-0 flex-1 ${showList ? "hidden lg:block" : "block"}`}>
          {detail && selectedId === detail.conversation.id ? (
            <ChatView
              key={detail.conversation.id}
              detail={detail}
              messages={messages}
              meId={me.id}
              canViewAll={canViewAll}
              canned={boot.canned}
              departments={boot.departments}
              operators={presence}
              visitorTyping={typing[detail.conversation.id] ?? null}
              hasMore={hasMore}
              onLoadOlder={loadOlder}
              onSend={(t, n) => void send(t, n)}
              onUpload={(f) => void upload(f)}
              onTyping={(t) => socket.emit("op:typing", { conversationId: detail.conversation.id, typing: t })}
              onClaim={async () => {
                await axios.post(`/api/admin/livechat/conversations/${detail.conversation.id}/claim`);
                setView("mine");
              }}
              onClose={async () => {
                await axios.post(`/api/admin/livechat/conversations/${detail.conversation.id}/close`);
              }}
              onTransfer={async (target) => {
                await axios.post(`/api/admin/livechat/conversations/${detail.conversation.id}/transfer`, target);
              }}
              onBack={() => {
                setSelectedId(null);
                setDetail(null);
              }}
              onToggleInfo={() => setShowInfo((v) => !v)}
              onUseCanned={(id) => void axios.post(`/api/admin/livechat/canned/${id}/use`).then(() => mutateBoot())}
            />
          ) : selectedId ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <MessagesSquare className="h-12 w-12 opacity-40" />
              <p className="text-[13px] font-bold">یک گفتگو را از فهرست انتخاب کنید</p>
              <p className="text-[11.5px]">
                {statusMeta.label} · {presence.filter((p) => p.connected && p.status === "ONLINE").length.toLocaleString("fa-IR")} کارشناس آنلاین
              </p>
            </div>
          )}
        </main>

        {/* مشخصات بازدیدکننده */}
        {detail && showInfo && selectedId === detail.conversation.id && (
          <aside
            className="fixed inset-y-0 left-0 z-50 w-[300px] max-w-[90vw] shadow-2xl xl:static xl:z-auto xl:shrink-0 xl:border-r xl:shadow-none"
            style={{ borderColor: "var(--color-border)" }}
          >
            <VisitorPanel
              detail={detail}
              onClose={() => setShowInfo(false)}
              onOpenConversation={(id) => void openConversation(id)}
              onVisitorChange={(v: VisitorProfile) => setDetail((d) => (d ? { ...d, visitor: v } : d))}
              onTagsChange={async (tags) => {
                await axios.patch(`/api/admin/livechat/conversations/${detail.conversation.id}`, { tags });
                setDetail((d) => (d ? { ...d, conversation: { ...d.conversation, tags } } : d));
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
