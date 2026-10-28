"use client";
// admin/app/components/livechat/ConversationList.tsx — فهرست گفتگوهای میز کار
import { Bot, Globe, Inbox, Loader2, MailWarning, MessageSquare, Search, UserRound, Users } from "lucide-react";
import type { ConversationSummary, Counts } from "./types";
import { STATUS_META } from "./types";

export type ConsoleView = "queue" | "mine" | "open" | "bot" | "offline" | "closed" | "visitors";

const rel = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });
export function relTime(iso: string | null) {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "همین حالا";
  if (abs < 3600) return rel.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rel.format(Math.round(diff / 3600), "hour");
  return new Date(iso).toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
}

export function visitorLabel(v: { name: string | null; phone: string | null }, number?: number) {
  return v.name || v.phone || (number ? `بازدیدکننده #${number.toLocaleString("fa-IR")}` : "بازدیدکننده");
}

interface Props {
  view: ConsoleView;
  onView: (v: ConsoleView) => void;
  counts: Counts | undefined;
  canViewAll: boolean;
  items: ConversationSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  typing: Record<string, string | null>;
  onlineVisitorsCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  /** محتوای جایگزین فهرست (مثلاً بازدیدکنندگان آنلاین) */
  customBody?: React.ReactNode;
}

export default function ConversationList({
  view,
  onView,
  counts,
  canViewAll,
  items,
  loading,
  selectedId,
  onSelect,
  search,
  onSearch,
  typing,
  onlineVisitorsCount,
  hasMore,
  onLoadMore,
  customBody,
}: Props) {
  const tabs: { key: ConsoleView; label: string; icon: typeof Inbox; count?: number; alert?: boolean }[] = [
    { key: "queue", label: "صف انتظار", icon: Inbox, count: counts?.queue, alert: !!counts?.queue },
    { key: "mine", label: "گفتگوهای من", icon: MessageSquare, count: counts?.unreadMine || counts?.mine, alert: !!counts?.unreadMine },
    ...(canViewAll ? [{ key: "open" as const, label: "همه‌ی گفتگوها", icon: Users, count: counts?.open }] : []),
    { key: "offline", label: "پیام آفلاین", icon: MailWarning, count: counts?.offline, alert: !!counts?.offline },
    ...(canViewAll ? [{ key: "bot" as const, label: "با ربات", icon: Bot, count: counts?.bot }] : []),
    { key: "closed", label: "بسته‌شده", icon: UserRound },
    { key: "visitors", label: "آنلاین‌ها", icon: Globe, count: onlineVisitorsCount },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-4 gap-1 border-b p-2" style={{ borderColor: "var(--color-border)" }}>
        {tabs.map((t) => {
          const active = view === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onView(t.key)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-bold transition ${
                active ? "text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
              style={active ? { backgroundColor: "var(--color-emerald)" } : undefined}
            >
              <t.icon className="h-4 w-4" />
              <span className="truncate">{t.label}</span>
              {!!t.count && (
                <span
                  className={`absolute -top-0.5 left-1 min-w-4 rounded-full px-1 text-[9.5px] leading-4 ${
                    t.alert ? "bg-red-500 text-white" : active ? "bg-white/25 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {t.count.toLocaleString("fa-IR")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {view !== "visitors" && (
        <div className="relative p-2">
          <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="جستجو: نام، موبایل، شماره گفتگو، متن…"
            className="w-full rounded-xl border bg-white py-2 pl-3 pr-8 text-[12px] outline-none focus:border-gray-400"
            style={{ borderColor: "var(--color-border)" }}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {customBody ? (
          customBody
        ) : loading && !items.length ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : !items.length ? (
          <p className="py-10 text-center text-[12px] text-gray-400">گفتگویی نیست</p>
        ) : (
          items.map((c) => {
            const meta = STATUS_META[c.status];
            const preview = typing[c.id];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`flex w-full gap-2.5 border-b px-3 py-2.5 text-right transition ${
                  selectedId === c.id ? "bg-amber-50" : "hover:bg-gray-50"
                }`}
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-black text-gray-600">
                  {visitorLabel(c.visitor).charAt(0)}
                  <span
                    className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: c.visitor.online ? "#22c55e" : "#d1d5db" }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-black text-gray-900">{visitorLabel(c.visitor, c.number)}</span>
                    {c.visitor.isUser && (
                      <span className="rounded bg-blue-50 px-1 text-[9.5px] font-bold text-blue-600">کاربر</span>
                    )}
                    <span className="mr-auto shrink-0 text-[10px] text-gray-400">
                      {relTime(view === "queue" || view === "offline" ? c.queuedAt : c.lastMessageAt)}
                    </span>
                  </span>
                  <span className={`mt-0.5 block truncate text-[11.5px] ${preview ? "font-bold text-emerald-700" : "text-gray-500"}`}>
                    {preview ? `در حال نوشتن: ${preview}` : (c.lastMessagePreview ?? c.subject ?? "—")}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="rounded-md px-1.5 text-[9.5px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                      {c.isOffline && c.status === "WAITING" ? "پیام آفلاین" : meta.label}
                    </span>
                    {c.department && (
                      <span className="rounded-md bg-gray-100 px-1.5 text-[9.5px] font-bold text-gray-600">{c.department.name}</span>
                    )}
                    {c.operator && view !== "mine" && (
                      <span className="rounded-md bg-gray-100 px-1.5 text-[9.5px] text-gray-600">{c.operator.displayName}</span>
                    )}
                    {c.tags.slice(0, 2).map((t) => (
                      <span key={t} className="rounded-md bg-amber-100 px-1.5 text-[9.5px] text-amber-800">
                        {t}
                      </span>
                    ))}
                    {c.unreadByOperator > 0 && (
                      <span className="mr-auto min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[10px] font-black text-white">
                        {c.unreadByOperator.toLocaleString("fa-IR")}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })
        )}
        {!customBody && hasMore && (
          <button type="button" onClick={onLoadMore} className="w-full py-3 text-[12px] font-bold text-gray-500 hover:bg-gray-50">
            موارد بیشتر
          </button>
        )}
      </div>
    </div>
  );
}
