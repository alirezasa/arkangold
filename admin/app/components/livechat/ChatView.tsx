"use client";
// admin/app/components/livechat/ChatView.tsx — گفتگوی انتخاب‌شده در میز کار
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  Download,
  EyeOff,
  FileText,
  Hand,
  Loader2,
  MessageSquareQuote,
  Paperclip,
  PanelLeft,
  Send,
  Star,
  StickyNote,
  Repeat2,
  X,
  XCircle,
} from "lucide-react";
import type { CannedResponse, ChatMessage, ConversationDetail, OperatorPresence } from "./types";
import { STATUS_META } from "./types";
import { visitorLabel } from "./ConversationList";

const timeFmt = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long" });
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?»)\]])/g;

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="underline break-all" dir="ltr">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

async function fetchBlob(messageId: string) {
  const res = await axios.get(`/api/admin/livechat/attachments/${messageId}`, { responseType: "blob" });
  return res.data as Blob;
}

function Attachment({ m }: { m: ChatMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = !!m.attachment?.isImage && !m.local;
  useEffect(() => {
    if (!isImage) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchBlob(m.id)
      .then((b) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, m.id]);
  const download = async () => {
    const b = await fetchBlob(m.id);
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = m.attachment?.name ?? "file";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(u), 5000);
  };
  if (isImage && url) {
    return (
      <button type="button" onClick={() => window.open(url, "_blank", "noopener")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- تصویر خصوصی از blob */}
        <img src={url} alt={m.attachment?.name ?? ""} className="max-h-60 max-w-full rounded-xl" />
      </button>
    );
  }
  return (
    <button type="button" onClick={download} disabled={!!m.local} className="flex items-center gap-2 text-right">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/5">
        {m.local ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      </span>
      <span className="text-[12px] font-bold" dir="auto">
        {m.attachment?.name ?? "فایل"}
      </span>
      {!m.local && <Download className="h-3.5 w-3.5 opacity-60" />}
    </button>
  );
}

function MessageItem({ m, prev }: { m: ChatMessage; prev?: ChatMessage }) {
  const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
  const day = newDay ? (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-white px-3 py-0.5 text-[10.5px] font-bold text-gray-500 shadow-sm">
        {dayFmt.format(new Date(m.createdAt))}
      </span>
    </div>
  ) : null;

  if (m.type === "EVENT") {
    return (
      <>
        {day}
        <div className="my-2 flex justify-center">
          <span className="rounded-full bg-gray-200/70 px-3 py-1 text-[11px] font-bold text-gray-600">
            {m.body} · {timeFmt.format(new Date(m.createdAt))}
          </span>
        </div>
      </>
    );
  }

  const fromVisitor = m.senderType === "VISITOR";
  const isBot = m.senderType === "BOT";
  const note = m.isInternal;
  const options = m.payload?.options ?? [];
  let bubble = "bg-white text-gray-800";
  if (note) bubble = "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
  else if (isBot) bubble = "bg-indigo-50 text-indigo-950";
  else if (!fromVisitor) bubble = "text-white";

  return (
    <>
      {day}
      <div className={`mt-2 flex ${fromVisitor ? "justify-start" : "justify-end"}`}>
        <div className={`flex max-w-[78%] flex-col ${fromVisitor ? "items-start" : "items-end"}`}>
          <span className="mb-0.5 flex items-center gap-1 px-1 text-[10.5px] font-bold text-gray-500">
            {note && <EyeOff className="h-3 w-3" />}
            {isBot && <Bot className="h-3 w-3" />}
            {note ? `یادداشت داخلی · ${m.operator?.displayName ?? ""}` : isBot ? (m.payload?.smart ? "ربات (حالت هوشمند)" : "ربات") : fromVisitor ? "" : m.operator?.displayName}
          </span>
          <div
            className={`rounded-2xl px-3 py-2 text-[13px] leading-6 shadow-sm ${bubble} ${m.local === "failed" ? "opacity-60" : ""}`}
            style={!fromVisitor && !isBot && !note ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {m.type === "FILE" ? (
              <Attachment m={m} />
            ) : m.type === "FORM" ? (
              <div>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-[11px] font-bold opacity-70">
                  فرم {m.payload?.form === "offline" ? "تماس آفلاین" : "پیش از گفتگو"} ({m.payload?.fields?.map((f) => f.label).join("، ")}) —{" "}
                  {m.payload?.submitted ? "تکمیل شد ✓" : "در انتظار تکمیل"}
                </p>
              </div>
            ) : m.type === "RATING" ? (
              <div>
                <p>{m.body}</p>
                {m.payload?.rated ? (
                  <p className="mt-1 flex items-center gap-1 font-bold">
                    {Array.from({ length: m.payload.rated }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                    {m.payload.comment && <span className="mr-1 font-normal">«{m.payload.comment}»</span>}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] opacity-70">هنوز امتیازی ثبت نشده</p>
                )}
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words" dir="auto">
                <RichText text={m.body} />
              </p>
            )}
            {options.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {options.map((o) => (
                  <span key={o.id} className="rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-[10.5px] font-bold text-indigo-700">
                    {o.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-gray-400">
            {m.local === "failed" ? (
              <span className="flex items-center gap-1 font-bold text-red-500">
                <AlertCircle className="h-3 w-3" /> {m.localError ?? "ارسال نشد"}
              </span>
            ) : m.local ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                {timeFmt.format(new Date(m.createdAt))}
                {!fromVisitor && !note && !isBot && (m.seenAt ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" /> : <Check className="h-3.5 w-3.5" />)}
              </>
            )}
          </span>
        </div>
      </div>
    </>
  );
}

interface Props {
  detail: ConversationDetail;
  messages: ChatMessage[];
  meId: string;
  canViewAll: boolean;
  canned: CannedResponse[];
  departments: { id: string; name: string }[];
  operators: OperatorPresence[];
  visitorTyping: string | null;
  hasMore: boolean;
  onLoadOlder: () => Promise<void>;
  onSend: (text: string, isInternal: boolean) => void;
  onUpload: (file: File) => void;
  onTyping: (typing: boolean) => void;
  onClaim: () => Promise<void>;
  onClose: () => Promise<void>;
  onTransfer: (target: { operatorId?: string; departmentId?: string; note?: string }) => Promise<void>;
  onBack: () => void;
  onToggleInfo: () => void;
  onUseCanned: (id: string) => void;
}

export default function ChatView({
  detail,
  messages,
  meId,
  canViewAll,
  canned,
  departments,
  operators,
  visitorTyping,
  hasMore,
  onLoadOlder,
  onSend,
  onUpload,
  onTyping,
  onClaim,
  onClose,
  onTransfer,
  onBack,
  onToggleInfo,
  onUseCanned,
}: Props) {
  const c = detail.conversation;
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferNote, setTransferNote] = useState("");
  const [cannedOpen, setCannedOpen] = useState(false);
  const [cannedIndex, setCannedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingSent = useRef(false);
  const typingTimer = useRef<number | null>(null);
  const atBottom = useRef(true);

  const mine = c.operator?.id === meId;
  const unassigned = !c.operator && c.status !== "CLOSED";
  const readOnly = !mine && !unassigned && !canViewAll && c.status !== "CLOSED";

  // پاسخ‌های سریع: «/» در ابتدای متن یا دکمه‌ی پاسخ‌های سریع
  const slash = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const cannedMatches = useMemo(() => {
    const q = slash ?? "";
    return canned
      .filter((r) => !q || r.shortcut.toLowerCase().includes(q) || r.title.includes(q) || r.body.includes(q))
      .slice(0, 8);
  }, [canned, slash]);
  const showCanned = (slash !== null || cannedOpen) && cannedMatches.length > 0;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, visitorTyping]);

  const stopTyping = () => {
    if (typingSent.current) onTyping(false);
    typingSent.current = false;
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
  };

  const applyCanned = (r: CannedResponse) => {
    const name = detail.visitor.name ?? "";
    setText(r.body.replace(/\{\{\s*name\s*\}\}/g, name || "کاربر گرامی"));
    setCannedOpen(false);
    setCannedIndex(0);
    onUseCanned(r.id);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body, note);
    setText("");
    stopTyping();
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? (e.response?.data as { message?: string } | undefined)?.message : null;
      setError(msg ?? "انجام نشد");
    } finally {
      setBusy(null);
    }
  };

  const meta = STATUS_META[c.status];
  const onlineOperators = operators.filter((o) => o.id !== c.operator?.id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* سرتیتر گفتگو */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
        <button type="button" onClick={onBack} className="rounded-lg p-1.5 hover:bg-gray-100 lg:hidden" aria-label="بازگشت">
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[14px] font-black text-gray-900">{visitorLabel(c.visitor, c.number)}</h2>
            <span className="rounded-md px-1.5 text-[10px] font-bold" style={{ background: meta.bg, color: meta.color }}>
              {c.isOffline && c.status === "WAITING" ? "پیام آفلاین" : meta.label}
            </span>
            <span className="text-[10.5px] text-gray-400" dir="ltr">
              #{c.number}
            </span>
          </div>
          <p className="truncate text-[11px] text-gray-500">
            {c.visitor.online ? "🟢 آنلاین" : "⚪ آفلاین"}
            {c.operator && ` · کارشناس: ${c.operator.displayName}`}
            {c.department && ` · ${c.department.name}`}
            {c.visitor.currentTitle && c.visitor.online && ` · در صفحه‌ی «${c.visitor.currentTitle}»`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(unassigned || (canViewAll && !mine && c.status !== "CLOSED")) && (
            <button
              type="button"
              onClick={() => act("claim", onClaim)}
              disabled={!!busy}
              className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {busy === "claim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}
              {unassigned ? "پذیرش گفتگو" : "ورود به گفتگو"}
            </button>
          )}
          {c.status !== "CLOSED" && (mine || canViewAll || unassigned) && (
            <>
              <button
                type="button"
                onClick={() => setTransferOpen((v) => !v)}
                className="flex items-center gap-1 rounded-xl border bg-white px-3 py-1.5 text-[12px] font-bold text-gray-700"
                style={{ borderColor: "var(--color-border)" }}
              >
                <Repeat2 className="h-4 w-4" /> انتقال
              </button>
              <button
                type="button"
                onClick={() => window.confirm("گفتگو بسته شود؟") && act("close", onClose)}
                disabled={!!busy}
                className="flex items-center gap-1 rounded-xl border border-red-100 bg-white px-3 py-1.5 text-[12px] font-bold text-red-600 disabled:opacity-50"
              >
                {busy === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                بستن
              </button>
            </>
          )}
          <button type="button" onClick={onToggleInfo} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="اطلاعات بازدیدکننده">
            <PanelLeft className="h-5 w-5" />
          </button>
        </div>
      </div>

      {transferOpen && (
        <div className="border-b bg-gray-50 px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-black text-gray-700">انتقال گفتگو به</p>
            <button type="button" onClick={() => setTransferOpen(false)} aria-label="بستن">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <input
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value)}
            placeholder="یادداشت برای کارشناس مقصد (اختیاری)"
            className="mb-2 w-full rounded-lg border bg-white px-3 py-1.5 text-[12px] outline-none"
            style={{ borderColor: "var(--color-border)" }}
          />
          <div className="flex flex-wrap gap-1.5">
            {onlineOperators.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={!!busy}
                onClick={() =>
                  act("transfer", async () => {
                    await onTransfer({ operatorId: o.id, note: transferNote || undefined });
                    setTransferOpen(false);
                    setTransferNote("");
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-[11.5px] font-bold text-gray-700 disabled:opacity-50"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: o.connected && o.status === "ONLINE" ? "#22c55e" : o.connected ? "#f59e0b" : "#d1d5db" }} />
                {o.displayName}
                <span className="text-[10px] font-normal text-gray-400">({o.activeChats.toLocaleString("fa-IR")})</span>
              </button>
            ))}
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={!!busy}
                onClick={() =>
                  act("transfer", async () => {
                    await onTransfer({ departmentId: d.id, note: transferNote || undefined });
                    setTransferOpen(false);
                    setTransferNote("");
                  })
                }
                className="rounded-lg border border-dashed bg-white px-2.5 py-1 text-[11.5px] font-bold text-gray-700 disabled:opacity-50"
                style={{ borderColor: "var(--color-border)" }}
              >
                صف «{d.name}»
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* پیام‌ها */}
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 30 && hasMore) {
            const h = el.scrollHeight;
            void onLoadOlder().then(() =>
              requestAnimationFrame(() => {
                if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - h;
              }),
            );
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        style={{ backgroundColor: "var(--color-bg-page)" }}
      >
        {messages.map((m, i) => (
          <MessageItem key={m.id} m={m} prev={messages[i - 1]} />
        ))}
        {visitorTyping !== null && (
          <div className="mt-2 flex justify-start">
            <div className="max-w-[78%] rounded-2xl border border-dashed border-gray-300 bg-white/70 px-3 py-2 text-[12.5px] text-gray-500">
              <span className="mb-0.5 block text-[10px] font-bold text-emerald-700">در حال نوشتن…</span>
              {visitorTyping || "…"}
            </div>
          </div>
        )}
      </div>

      {/* نوشتن پاسخ */}
      {readOnly ? (
        <p className="border-t bg-white px-4 py-3 text-center text-[12px] text-gray-500" style={{ borderColor: "var(--color-border)" }}>
          این گفتگو به کارشناس دیگری سپرده شده است.
        </p>
      ) : (
        <div className={`relative border-t ${note ? "bg-amber-50" : "bg-white"}`} style={{ borderColor: "var(--color-border)" }}>
          {showCanned && (
            <div className="absolute bottom-full right-2 left-2 mb-1 max-h-72 overflow-y-auto rounded-2xl border bg-white shadow-xl" style={{ borderColor: "var(--color-border)" }}>
              <p className="border-b px-3 py-1.5 text-[10.5px] font-bold text-gray-400" style={{ borderColor: "var(--color-border)" }}>
                پاسخ‌های سریع — با ↑↓ انتخاب و Enter درج کنید
              </p>
              {cannedMatches.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyCanned(r);
                  }}
                  className={`block w-full px-3 py-2 text-right ${i === cannedIndex ? "bg-amber-50" : "hover:bg-gray-50"}`}
                >
                  <span className="flex items-center gap-2 text-[12px] font-black text-gray-800">
                    <span className="rounded bg-gray-100 px-1.5 font-mono text-[10.5px] text-gray-500" dir="ltr">
                      /{r.shortcut}
                    </span>
                    {r.title}
                    {r.operatorId && <span className="text-[10px] font-normal text-gray-400">شخصی</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-gray-500">{r.body}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-3 pt-2 text-[11px]">
            <button
              type="button"
              onClick={() => setNote(false)}
              className={`rounded-lg px-2 py-0.5 font-bold ${!note ? "bg-gray-900 text-white" : "text-gray-500"}`}
            >
              پاسخ
            </button>
            <button
              type="button"
              onClick={() => setNote(true)}
              className={`flex items-center gap-1 rounded-lg px-2 py-0.5 font-bold ${note ? "bg-amber-500 text-white" : "text-gray-500"}`}
            >
              <StickyNote className="h-3 w-3" /> یادداشت داخلی
            </button>
            {c.status === "CLOSED" && !note && (
              <span className="text-gray-400">ارسال پاسخ، گفتگو را دوباره باز می‌کند</span>
            )}
          </div>
          <div className="flex items-end gap-1 p-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={5000}
              placeholder={note ? "یادداشت فقط برای کارشناسان دیده می‌شود…" : "پاسخ خود را بنویسید… (/ برای پاسخ‌های سریع)"}
              onChange={(e) => {
                setText(e.target.value);
                setCannedIndex(0);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                if (!note) {
                  if (!typingSent.current) {
                    typingSent.current = true;
                    onTyping(true);
                  }
                  if (typingTimer.current) window.clearTimeout(typingTimer.current);
                  typingTimer.current = window.setTimeout(stopTyping, 3000);
                }
              }}
              onBlur={stopTyping}
              onKeyDown={(e) => {
                if (showCanned) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCannedIndex((i) => (i + 1) % cannedMatches.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCannedIndex((i) => (i - 1 + cannedMatches.length) % cannedMatches.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    applyCanned(cannedMatches[cannedIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    setCannedOpen(false);
                    if (slash !== null) setText("");
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] leading-6 outline-none"
            />
            <button type="button" onClick={() => setCannedOpen((v) => !v)} title="پاسخ‌های سریع" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
              <MessageSquareQuote className="h-5 w-5" />
            </button>
            {!note && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} title="ارسال فایل" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) onUpload(f);
                  }}
                />
              </>
            )}
            <button
              type="button"
              onClick={send}
              disabled={!text.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40"
              style={{ backgroundColor: note ? "#f59e0b" : "var(--color-emerald)" }}
              aria-label="ارسال"
            >
              <Send className="h-4.5 w-4.5 -scale-x-100" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
