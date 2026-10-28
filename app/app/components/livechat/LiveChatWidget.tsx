"use client";
// app/app/components/livechat/LiveChatWidget.tsx
//
// ویجت چت آنلاین آرکان گلد (جایگزین گفتینو): دکمه‌ی شناور، پنجره‌ی گفتگو با منوی پاسخ‌های آماده‌ی
// ربات، گفتگوی بلادرنگ با کارشناس، حالت آفلاین، ارسال فایل، امتیازدهی و پیام‌های خودکار.
// همه‌ی متن‌ها، رنگ‌ها، جای دکمه و رفتارها از «پنل ← چت آنلاین ← تنظیمات» می‌آیند.
// باز کردن از هر جای اپ: window.dispatchEvent(new Event("arkan-livechat:open")) یا ?chat=open
//
// حالت جاسازی (embed): همین ویجت داخل iframe صفحه‌ی /embed/livechat روی سایت‌های دیگر
// (arkan.gold، مجله) نمایش داده می‌شود؛ جای iframe را اسکریپت public/livechat-embed.js در صفحه‌ی
// میزبان تعیین می‌کند و ویجت اندازه/وضعیت خود را با postMessage به آن اعلام می‌کند.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Loader2, LogOut, MessageCircle, Paperclip, Send, Smile, Volume2, VolumeX, X } from "lucide-react";
import LiveChatMessages, { RichText } from "./LiveChatMessages";
import { useLivechat, type PageInfo } from "./useLivechat";
import type { BotOption, ChatMessage, ChatTrigger } from "./types";

const OPEN_EVENT = "arkan-livechat:open";
const CLOSE_EVENT = "arkan-livechat:close";
/** فاصله‌ی داخلی دکمه در iframe تا سایه و نشان خوانده‌نشده بریده نشود */
const EMBED_PAD = 12;
const OPEN_KEY = "arkan_livechat_open";
const SOUND_KEY = "arkan_livechat_sound";
const TRIGGER_KEY = "arkan_livechat_triggers";
const AUTH_PREFIXES = ["/login", "/register", "/forgot-password"];
const EMOJIS = ["🙂", "😊", "😂", "😍", "🙏", "👍", "👌", "👏", "🌹", "❤️", "🤔", "😔", "😢", "😡", "✅", "❌", "⭐", "💰", "🪙", "📦", "🚚", "📞", "⏰", "🎉"];

function sessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // در دسترس نیست
  }
}

export interface HostPage extends PageInfo {
  pathname: string;
  search: string;
}

export interface EmbedBridge {
  /** صفحه‌ی سایت میزبان (تا رسیدن پیام میزبان null) */
  host: HostPage | null;
  /** پیام به اسکریپت میزبان */
  post: (msg: Record<string, unknown>) => void;
}

export default function LiveChatWidget({ embed }: { embed?: EmbedBridge }) {
  const appPath = usePathname() ?? "";
  // ویجت سراسری layout در صفحه‌ی جاسازی رندر نمی‌شود (آن صفحه نسخه‌ی خودش را دارد)
  if (!embed && appPath.startsWith("/embed")) return null;
  return <Widget embed={embed} appPath={appPath} />;
}

function Widget({ embed, appPath }: { embed?: EmbedBridge; appPath: string }) {
  const host = embed?.host ?? null;
  const pathname = embed ? (host?.pathname ?? "/") : appPath;
  const router = useRouter();
  const pageInfo = useCallback((): PageInfo => {
    if (embed) return host ?? { url: "", title: "", referrer: "" };
    return { url: window.location.href, title: document.title, referrer: document.referrer };
  }, [embed, host]);
  // وضعیت باز بودن در همین برگه حفظ می‌شود؛ ?chat=open (پیوند پیامک پاسخ) پنجره را باز می‌کند
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      (sessionGet(OPEN_KEY) === "1" || new URLSearchParams(window.location.search).get("chat") === "open"),
  );
  const [muted, setMuted] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(SOUND_KEY) === "off";
    } catch {
      return false;
    }
  });
  const openRemote = useCallback(() => {
    setOpen(true);
    sessionSet(OPEN_KEY, "1");
  }, []);
  // کارشناس گفتگو را آغاز کرد ← پنجره باز می‌شود
  const api = useLivechat(embed ? `${pathname}${host?.search ?? ""}` : pathname, open, muted, openRemote, pageInfo);
  const { session, messages, conversation, availability, connected, operatorTyping, unread, banned } = api;

  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [trigger, setTrigger] = useState<ChatTrigger | null>(null);
  const [bubble, setBubble] = useState<ChatTrigger | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const settings = session?.settings;
  const w = settings?.widget;
  const primary = w?.primaryColor ?? "#330509";
  const accent = w?.accentColor ?? "#c5a059";

  // ── باز/بسته کردن ──
  const setOpenPersist = useCallback((v: boolean) => {
    setOpen(v);
    sessionSet(OPEN_KEY, v ? "1" : "0");
    if (v) setBubble(null);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpenPersist(true);
    const onClose = () => setOpenPersist(false);
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener(CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener(CLOSE_EVENT, onClose);
    };
  }, [setOpenPersist]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPersist(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpenPersist]);

  // ── پیام‌های خودکار (پیشگام) ──
  const active = !!conversation && conversation.status !== "CLOSED";
  useEffect(() => {
    if (!session || active || open || banned) return;
    let shown: string[] = [];
    try {
      shown = JSON.parse(sessionGet(TRIGGER_KEY) ?? "[]") as string[];
    } catch {
      shown = [];
    }
    const t = session.triggers.find(
      (x) =>
        !shown.includes(x.id) &&
        (!x.urlContains || pathname.includes(x.urlContains)) &&
        (!x.onlyWhenOnline || availability?.online),
    );
    if (!t) return;
    const timer = window.setTimeout(() => {
      sessionSet(TRIGGER_KEY, JSON.stringify([...shown, t.id]));
      setTrigger(t);
      if (t.openWidget) setOpenPersist(true);
      else setBubble(t);
    }, Math.max(0, t.delaySeconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [session, active, open, banned, pathname, availability?.online, setOpenPersist]);

  // ── فهرست پیام‌ها ──
  const lastClosedIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "EVENT" && messages[i].payload?.event === "closed") return i;
    }
    return -1;
  }, [messages]);

  // منوی آغازین (مجازی، ذخیره نمی‌شود) وقتی گفتگوی فعالی نیست
  const showStartMenu = !!session && !active;
  const virtual: ChatMessage[] = useMemo(() => {
    if (!session || !showStartMenu) return [];
    const now = messages[messages.length - 1]?.createdAt ?? api.loadedAt;
    const base = {
      conversationId: "",
      isInternal: false,
      clientMessageId: null,
      operator: null,
      attachment: null,
      seenAt: null,
      createdAt: now,
    } as const;
    const list: ChatMessage[] = [];
    if (trigger) list.push({ ...base, id: "virtual-trigger", senderType: "BOT", type: "TEXT", body: trigger.message, payload: null });
    if (messages.length === 0 && session.settings.widget.welcomeMessage) {
      list.push({ ...base, id: "virtual-welcome", senderType: "BOT", type: "TEXT", body: session.settings.widget.welcomeMessage, payload: null });
    }
    if (session.settings.bot.enabled) {
      list.push({
        ...base,
        id: "virtual-menu",
        senderType: "BOT",
        type: "OPTIONS",
        body: session.menu.greeting,
        payload: { options: session.menu.options },
      });
    }
    return list;
  }, [session, showStartMenu, trigger, messages, api.loadedAt]);

  const allMessages = useMemo(() => [...messages, ...virtual], [messages, virtual]);

  // فقط دکمه‌های آخرین پیام ربات قابل انتخاب‌اند (پس از بستن گفتگو، فقط منوی آغازین)
  const activeOptionsId = useMemo(() => {
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const m = allMessages[i];
      if (m.senderType === "VISITOR" && !m.local) return null;
      if (m.payload?.options?.length) return i > lastClosedIndex || m.id.startsWith("virtual") ? m.id : null;
    }
    return null;
  }, [allMessages, lastClosedIndex]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    if (open) scrollToBottom(false);
  }, [open, scrollToBottom]);
  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [allMessages.length, operatorTyping, atBottom, scrollToBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 40 && api.hasMore && !api.loadingOlder) {
      const prevHeight = el.scrollHeight;
      void api.loadOlder().then(() => {
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight;
        });
      });
    }
  };

  // ── ارسال ──
  const triggerId = !active ? trigger?.id ?? null : null;
  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (body.length > (settings?.maxMessageLength ?? 2000)) return;
    setText("");
    setShowEmoji(false);
    void api.sendText(body, triggerId);
    setTrigger(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onOption = (o: BotOption) => {
    if (o.kind === "link" && o.url) {
      if (o.url.startsWith("/")) {
        // روی سایت میزبان، صفحه‌های اپ در برگه‌ی جدید باز می‌شوند
        if (embed) window.open(`${window.location.origin}${o.url}`, "_blank", "noopener");
        else {
          router.push(o.url);
          if (window.innerWidth < 640) setOpenPersist(false);
        }
      }
      return;
    }
    void api.selectOption(o, triggerId);
    setTrigger(null);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void api.upload(f);
  };

  const toggleMute = () => {
    setMuted((m) => {
      try {
        window.localStorage.setItem(SOUND_KEY, m ? "on" : "off");
      } catch {
        // ignore
      }
      return !m;
    });
  };

  // ── نمایش ──
  const hidden =
    !session ||
    !settings?.enabled ||
    !w ||
    w.hiddenPaths.some((p) => pathname.startsWith(p)) ||
    (!!availability?.hidden && !active && !open);

  // حالت جاسازی: اعلام وضعیت و اندازه‌ی دکمه به صفحه‌ی میزبان تا iframe را همان‌قدر نگه دارد
  const [launcherEl, setLauncherEl] = useState<HTMLDivElement | null>(null);
  const post = embed?.post;
  const layoutBase = useMemo(
    () =>
      w
        ? { side: w.position === "right" ? "right" : "left", offsetX: w.offsetX, offsetBottom: w.offsetBottom, showOnMobile: w.showOnMobile, pad: EMBED_PAD }
        : null,
    [w],
  );
  useEffect(() => {
    if (!post) return;
    if (hidden || !layoutBase) return post({ type: "layout", state: "hidden" });
    if (open) return post({ type: "layout", state: "open", ...layoutBase });
    if (!launcherEl) return;
    const report = () => {
      const r = launcherEl.getBoundingClientRect();
      post({ type: "layout", state: "closed", width: Math.ceil(r.width), height: Math.ceil(r.height), ...layoutBase });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(launcherEl);
    return () => ro.disconnect();
  }, [post, hidden, open, launcherEl, layoutBase]);

  if (hidden || !session || !settings || !w) return null;

  const inDashboard = pathname.startsWith("/dashboard");
  const onAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
  const side = w.position === "right" ? "right" : "left";
  const online = !!availability?.online;
  const operator = conversation?.status === "OPEN" ? conversation.operator : null;
  const status = operator
    ? `${operator.displayName}${operator.title ? ` · ${operator.title}` : ""}`
    : online
      ? w.subtitle
      : w.offlineSubtitle;

  const vars = { "--lc-x": `${w.offsetX}px`, "--lc-b": `${w.offsetBottom}px` } as React.CSSProperties;

  return (
    <>
      {/* دکمه‌ی شناور */}
      {!open && (
        <div
          ref={setLauncherEl}
          className={`fixed z-9990 flex flex-col gap-2 ${
            embed
              ? `bottom-0 p-3 ${side === "left" ? "left-0 items-start" : "right-0 items-end"}`
              : `${side === "left" ? "left-(--lc-x) items-start" : "right-(--lc-x) items-end"} ${w.showOnMobile ? "" : "max-sm:hidden"}`
          } ${
            embed
              ? ""
              : inDashboard
              ? "bottom-[calc(var(--lc-b)+4.5rem+env(safe-area-inset-bottom))] lg:bottom-(--lc-b)"
              : onAuthPage
                ? "top-[calc(0.75rem+env(safe-area-inset-top))] lg:top-auto lg:bottom-(--lc-b)"
                : "bottom-[calc(var(--lc-b)+env(safe-area-inset-bottom))]"
          }`}
          style={vars}
          dir="rtl"
        >
          {bubble && (
            <div className="relative max-w-[260px] rounded-2xl rounded-bl-md bg-white p-3 pe-7 text-[12.5px] leading-6 text-gray-700 shadow-xl ring-1 ring-black/5">
              <button
                type="button"
                aria-label="بستن"
                onClick={() => setBubble(null)}
                className="absolute left-1.5 top-1.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setOpenPersist(true)} className="text-right">
                <RichText text={bubble.message} />
              </button>
            </div>
          )}
          <button
            type="button"
            aria-label={w.launcherText}
            title={w.launcherText}
            onClick={() => setOpenPersist(true)}
            className="group relative flex h-12 items-center justify-center gap-2 rounded-full px-3.5 text-white shadow-lg ring-2 ring-white/80 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4"
            style={{ backgroundColor: primary, boxShadow: `0 10px 25px -8px ${primary}99`, minWidth: "3rem" }}
          >
            <MessageCircle className="h-5 w-5" />
            {w.showLauncherText && (
              <span className={`text-[13px] font-bold ${embed ? "" : "max-sm:hidden"}`}>{w.launcherText}</span>
            )}
            {unread > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black">
                {unread > 9 ? "۹+" : unread.toLocaleString("fa-IR")}
              </span>
            ) : (
              online && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                  style={{ backgroundColor: "#22c55e" }}
                />
              )
            )}
          </button>
        </div>
      )}

      {/* پنجره‌ی گفتگو */}
      {open && (
        <section
          role="dialog"
          aria-label={w.title}
          dir="rtl"
          className={`fixed z-9991 flex flex-col overflow-hidden bg-[#f6f5f1] ${
            embed
              ? "inset-0"
              : `shadow-2xl max-sm:inset-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)] sm:bottom-(--lc-b) sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[380px] sm:rounded-3xl sm:ring-1 sm:ring-black/10 ${
                  side === "left" ? "sm:left-(--lc-x)" : "sm:right-(--lc-x)"
                }`
          }`}
          style={vars}
        >
          {/* سرتیتر */}
          <header className="relative shrink-0 px-4 pb-4 pt-3 text-white" style={{ backgroundColor: primary }}>
            <div className="flex items-center gap-3">
              <div className="relative">
                {operator?.avatarUrl && w.showOperatorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- آواتار اپراتور
                  <img src={operator.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white/30" />
                ) : (
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-black"
                    style={{ backgroundColor: accent, color: primary }}
                  >
                    {operator ? operator.displayName.charAt(0) : <MessageCircle className="h-5 w-5" />}
                  </span>
                )}
                <span
                  className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2"
                  style={{ borderColor: primary, backgroundColor: online || operator ? "#22c55e" : "#9ca3af" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[14.5px] font-black">{w.title}</h2>
                <p className="truncate text-[11.5px] opacity-80">
                  {!connected && session ? "در حال اتصال…" : status}
                </p>
              </div>
              <button type="button" onClick={toggleMute} aria-label={muted ? "روشن کردن صدا" : "بی‌صدا"} className="rounded-full p-2 hover:bg-white/10">
                {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
              </button>
              {active && w.allowVisitorEndChat && (
                <button type="button" onClick={() => setConfirmEnd(true)} aria-label="پایان گفتگو" title="پایان گفتگو" className="rounded-full p-2 hover:bg-white/10">
                  <LogOut className="h-4.5 w-4.5" />
                </button>
              )}
              <button type="button" onClick={() => setOpenPersist(false)} aria-label="بستن چت" className="rounded-full p-2 hover:bg-white/10">
                <ChevronDown className={`h-5 w-5 ${embed ? "hidden" : "max-sm:hidden"}`} />
                <X className={`h-5 w-5 ${embed ? "" : "sm:hidden"}`} />
              </button>
            </div>
            {!online && !operator && availability && (
              <p className="mt-2 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] leading-5">
                ساعات پاسخ‌گویی: {availability.workingHoursText}
              </p>
            )}
          </header>

          {confirmEnd && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-900">
              <span className="flex-1 font-bold">گفتگو پایان یابد؟</span>
              <button
                type="button"
                onClick={() => {
                  setConfirmEnd(false);
                  void api.endChat().catch(() => undefined);
                }}
                className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white"
              >
                بله
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="rounded-lg px-3 py-1 font-bold">
                خیر
              </button>
            </div>
          )}

          {/* پیام‌ها */}
          <div
            ref={listRef}
            onScroll={onScroll}
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
            aria-live="polite"
          >
            {api.loadingOlder && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}
            <LiveChatMessages
              api={api}
              messages={allMessages}
              primary={primary}
              accent={accent}
              showAvatar={w.showOperatorAvatar}
              ratingThanks={settings.rating.thanksText}
              activeOptionsId={activeOptionsId}
              onOption={onOption}
            />
            {operatorTyping && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                <span className="flex gap-0.5 rounded-2xl bg-white px-3 py-2 shadow-sm">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
                {operatorTyping} در حال نوشتن…
              </div>
            )}
          </div>

          {/* نوشتن پیام */}
          {banned ? (
            <p className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 text-center text-[12px] font-bold text-gray-500">
              امکان ارسال پیام برای شما وجود ندارد.
            </p>
          ) : (
            <div className="relative shrink-0 border-t border-gray-200 bg-white">
              {showEmoji && (
                <div className="absolute bottom-full right-2 mb-2 grid grid-cols-8 gap-1 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/5">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded-lg p-1 text-lg hover:bg-gray-100"
                      onClick={() => {
                        setText((t) => t + e);
                        inputRef.current?.focus();
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1 p-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={text}
                  maxLength={settings.maxMessageLength}
                  placeholder={w.composerPlaceholder}
                  onChange={(e) => {
                    setText(e.target.value);
                    api.typing(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  className="max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] leading-6 outline-none"
                  aria-label="متن پیام"
                />
                <button type="button" onClick={() => setShowEmoji((v) => !v)} aria-label="شکلک" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                  <Smile className="h-5 w-5" />
                </button>
                {w.allowFileUpload && (
                  <>
                    <button type="button" onClick={() => fileRef.current?.click()} aria-label="ارسال فایل" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={onFile} />
                  </>
                )}
                <button
                  type="button"
                  onClick={send}
                  disabled={!text.trim()}
                  aria-label="ارسال"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40"
                  style={{ backgroundColor: primary }}
                >
                  <Send className="h-4.5 w-4.5 -scale-x-100" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
