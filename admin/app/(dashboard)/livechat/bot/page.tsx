"use client";
// admin/app/(dashboard)/livechat/bot/page.tsx — ویرایشگر منوی ربات (پاسخ‌های آماده‌ی درختی)
import { useMemo, useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronLeft,
  CornerDownLeft,
  Eye,
  EyeOff,
  Headset,
  Link2,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/app/components/finance/ui";
import { cardStyle, fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle, secondaryBtn } from "@/app/components/agents/ui";

type Action = "MENU" | "ANSWER" | "HANDOFF" | "LINK" | "MAIN_MENU" | "CLOSE";

interface BotNode {
  id: string;
  parentId: string | null;
  label: string;
  action: Action;
  replyText: string | null;
  url: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  keywords: string[];
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  audience: "ALL" | "USER" | "GUEST";
  hits: number;
}

const ACTIONS: Record<Action, { label: string; hint: string; icon: typeof Bot; color: string }> = {
  ANSWER: { label: "پاسخ", hint: "متن پاسخ نمایش داده می‌شود (زیرگزینه‌ها هم در ادامه می‌آیند)", icon: MessageSquareText, color: "#0f766e" },
  MENU: { label: "زیرمنو", hint: "زیرگزینه‌ها با یک پرسش نمایش داده می‌شوند", icon: ChevronLeft, color: "#4338ca" },
  HANDOFF: { label: "اتصال به کارشناس", hint: "گفتگو به صف کارشناسان (دپارتمان انتخابی) می‌رود", icon: Headset, color: "#b45309" },
  LINK: { label: "پیوند", hint: "صفحه‌ای از اپ (/...) یا نشانی https باز می‌شود", icon: Link2, color: "#0369a1" },
  MAIN_MENU: { label: "منوی اصلی", hint: "بازگشت به منوی آغازین", icon: CornerDownLeft, color: "#6b7280" },
  CLOSE: { label: "پایان گفتگو", hint: "گفتگو بسته می‌شود", icon: X, color: "#b91c1c" },
};

const AUDIENCE: Record<string, string> = { ALL: "همه", USER: "فقط کاربران واردشده", GUEST: "فقط مهمان‌ها" };

type Draft = Omit<BotNode, "id" | "department" | "hits" | "sortOrder"> & { id?: string; keywordsText: string };

function emptyDraft(parentId: string | null): Draft {
  return { parentId, label: "", action: "ANSWER", replyText: "", url: "", departmentId: null, keywords: [], keywordsText: "", icon: "", isActive: true, audience: "ALL" };
}

function Editor({
  draft,
  setDraft,
  nodes,
  departments,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  nodes: BotNode[];
  departments: { id: string; name: string }[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  // والد نمی‌تواند خود گره یا نوادگانش باشد
  const blocked = useMemo(() => {
    const set = new Set<string>();
    if (!draft.id) return set;
    const walk = (id: string) => {
      set.add(id);
      nodes.filter((n) => n.parentId === id).forEach((n) => walk(n.id));
    };
    walk(draft.id);
    return set;
  }, [draft.id, nodes]);

  const pathOf = (n: BotNode): string => {
    const parent = nodes.find((x) => x.id === n.parentId);
    return parent ? `${pathOf(parent)} ← ${n.label}` : n.label;
  };

  return (
    <div className="space-y-3 rounded-2xl p-4" style={cardStyle}>
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-black text-gray-900">{draft.id ? "ویرایش گزینه" : "گزینه‌ی جدید"}</h2>
        <button type="button" onClick={onCancel} aria-label="بستن">
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>
      <div className="grid grid-cols-[64px_1fr] gap-2">
        <label className="block text-[12px] font-bold text-gray-600">
          آیکون
          <input value={draft.icon ?? ""} maxLength={8} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} className={inputCls + " text-center"} placeholder="📦" />
        </label>
        <label className="block text-[12px] font-bold text-gray-600">
          متن دکمه
          <input value={draft.label} maxLength={120} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={inputCls} placeholder="مثلاً: تحویل فیزیکی شمش طلا" />
        </label>
      </div>
      <label className="block text-[12px] font-bold text-gray-600">
        محل در منو
        <select value={draft.parentId ?? ""} onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })} className={inputCls}>
          <option value="">منوی اصلی</option>
          {nodes
            .filter((n) => !blocked.has(n.id))
            .map((n) => (
              <option key={n.id} value={n.id}>
                زیر «{pathOf(n)}»
              </option>
            ))}
        </select>
      </label>
      <div>
        <p className="mb-1 text-[12px] font-bold text-gray-600">عملکرد</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(Object.keys(ACTIONS) as Action[]).map((a) => {
            const meta = ACTIONS[a];
            const active = draft.action === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setDraft({ ...draft, action: a })}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11.5px] font-bold ${active ? "text-white" : "bg-white text-gray-600"}`}
                style={active ? { backgroundColor: meta.color, borderColor: meta.color } : { borderColor: "var(--color-border)" }}
              >
                <meta.icon className="h-3.5 w-3.5" /> {meta.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10.5px] text-gray-400">{ACTIONS[draft.action].hint}</p>
      </div>
      {draft.action !== "MAIN_MENU" && (
        <label className="block text-[12px] font-bold text-gray-600">
          {draft.action === "MENU" ? "پرسش بالای زیرمنو" : "متن پاسخ ربات"}
          <textarea rows={5} value={draft.replyText ?? ""} onChange={(e) => setDraft({ ...draft, replyText: e.target.value })} className={inputCls} />
          <span className="mt-1 block text-[10.5px] font-normal leading-5 text-gray-400">
            متغیرها: {"{{name}}"} نام بازدیدکننده، {"{{gold_price}}"} قیمت لحظه‌ای هر گرم طلا (تومان)، {"{{working_hours}}"} ساعات کاری. نشانی‌های https قابل کلیک می‌شوند.
          </span>
        </label>
      )}
      {draft.action === "LINK" && (
        <label className="block text-[12px] font-bold text-gray-600">
          نشانی
          <input dir="ltr" value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value })} className={inputCls} placeholder="/dashboard/wallet یا https://arkan.gold/..." />
        </label>
      )}
      {draft.action === "HANDOFF" && (
        <label className="block text-[12px] font-bold text-gray-600">
          دپارتمان مقصد
          <select value={draft.departmentId ?? ""} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value || null })} className={inputCls}>
            <option value="">همه‌ی کارشناسان</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-[12px] font-bold text-gray-600">
        کلمات کلیدی (حالت هوشمند)
        <input value={draft.keywordsText} onChange={(e) => setDraft({ ...draft, keywordsText: e.target.value })} className={inputCls} placeholder="با ویرگول جدا کنید: تحویل فیزیکی، دریافت شمش" />
        <span className="mt-1 block text-[10.5px] font-normal text-gray-400">اگر بازدیدکننده به‌جای انتخاب دکمه همین‌ها را بنویسد، همین گزینه اجرا می‌شود.</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px] font-bold text-gray-600">
          نمایش برای
          <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Draft["audience"] })} className={inputCls}>
            {Object.entries(AUDIENCE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-6 flex items-center gap-2 text-[12px] font-bold text-gray-600">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> فعال
        </label>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={saving || !draft.label.trim()} className={primaryBtn + " flex-1"} style={primaryBtnStyle}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtn}>
          انصراف
        </button>
      </div>
    </div>
  );
}

export default function LivechatBotPage() {
  const { data: nodes, mutate } = useSWR<BotNode[]>("/api/admin/livechat/bot-nodes", fetcher);
  const { data: departments } = useSWR<{ id: string; name: string; isActive: boolean }[]>("/api/admin/livechat/departments", fetcher);
  const { data: settings } = useSWR<{ bot: { greeting: string } }>("/api/admin/livechat/settings", fetcher);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const childrenOf = (parentId: string | null) =>
    (nodes ?? []).filter((n) => n.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);

  const edit = (n: BotNode) => {
    setError(null);
    setDraft({ ...n, keywordsText: n.keywords.join("، "), replyText: n.replyText ?? "", url: n.url ?? "", icon: n.icon ?? "" });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const body = {
      parentId: draft.parentId,
      label: draft.label.trim(),
      action: draft.action,
      replyText: draft.replyText || null,
      url: draft.action === "LINK" ? draft.url || null : null,
      departmentId: draft.action === "HANDOFF" ? draft.departmentId : null,
      keywords: draft.keywordsText.split(/[,،\n]/).map((k) => k.trim()).filter(Boolean),
      icon: draft.icon || null,
      audience: draft.audience,
      isActive: draft.isActive,
    };
    try {
      if (draft.id) await axios.patch(`/api/admin/livechat/bot-nodes/${draft.id}`, body);
      else await axios.post("/api/admin/livechat/bot-nodes", body);
      await mutate();
      setDraft(null);
    } catch (e) {
      setError(getErrorMessage(e, "ذخیره ناموفق بود"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: BotNode) => {
    const kids = (nodes ?? []).filter((x) => x.parentId === n.id).length;
    if (!window.confirm(kids ? `«${n.label}» و ${kids} زیرگزینه‌ی آن حذف شود؟` : `«${n.label}» حذف شود؟`)) return;
    await axios.delete(`/api/admin/livechat/bot-nodes/${n.id}`);
    await mutate();
  };

  const move = async (n: BotNode, dir: -1 | 1) => {
    const siblings = childrenOf(n.parentId);
    const i = siblings.findIndex((x) => x.id === n.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await axios.post("/api/admin/livechat/bot-nodes/reorder", { ids });
    await mutate();
  };

  const toggle = async (n: BotNode) => {
    await axios.patch(`/api/admin/livechat/bot-nodes/${n.id}`, { isActive: !n.isActive });
    await mutate();
  };

  const renderNode = (n: BotNode, depth: number, index: number, total: number): React.ReactNode => {
    const kids = childrenOf(n.id);
    const meta = ACTIONS[n.action];
    const isCollapsed = collapsed[n.id];
    return (
      <div key={n.id}>
        <div
          className={`group flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 ${n.isActive ? "" : "opacity-50"}`}
          style={{ borderColor: "var(--color-border)", marginRight: depth * 22 }}
        >
          <button
            type="button"
            onClick={() => setCollapsed((c) => ({ ...c, [n.id]: !c[n.id] }))}
            className={`rounded p-0.5 text-gray-400 ${kids.length ? "" : "invisible"}`}
            aria-label="باز/بسته"
          >
            {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="text-base">{n.icon}</span>
          <button type="button" onClick={() => edit(n)} className="min-w-0 flex-1 text-right">
            <span className="block truncate text-[13px] font-bold text-gray-800">{n.label}</span>
            {n.replyText && <span className="block truncate text-[11px] text-gray-400">{n.replyText}</span>}
          </button>
          <span className="hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:flex" style={{ color: meta.color, backgroundColor: `${meta.color}14` }}>
            <meta.icon className="h-3 w-3" /> {meta.label}
            {n.department && ` · ${n.department.name}`}
          </span>
          {n.audience !== "ALL" && <span className="hidden rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 sm:inline">{AUDIENCE[n.audience]}</span>}
          <span className="w-10 text-center text-[10.5px] text-gray-400" title="تعداد انتخاب">
            {n.hits.toLocaleString("fa-IR")}
          </span>
          <div className="flex items-center opacity-60 group-hover:opacity-100">
            <button type="button" disabled={index === 0} onClick={() => move(n, -1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" aria-label="بالا">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" disabled={index === total - 1} onClick={() => move(n, 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" aria-label="پایین">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setDraft(emptyDraft(n.id))} className="rounded p-1 hover:bg-gray-100" title="افزودن زیرگزینه">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => edit(n)} className="rounded p-1 hover:bg-gray-100" title="ویرایش">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => toggle(n)} className="rounded p-1 hover:bg-gray-100" title={n.isActive ? "غیرفعال کردن" : "فعال کردن"}>
              {n.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => remove(n)} className="rounded p-1 text-red-500 hover:bg-red-50" title="حذف">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!isCollapsed && kids.length > 0 && (
          <div className="mt-1.5 space-y-1.5">{kids.map((k, i) => renderNode(k, depth + 1, i, kids.length))}</div>
        )}
      </div>
    );
  };

  const roots = childrenOf(null);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={Bot}
        title="منوی ربات و پاسخ‌های آماده"
        subtitle="گزینه‌هایی که بازدیدکننده پیش از گفتگو با کارشناس می‌بیند. هر گزینه می‌تواند پاسخ بدهد، زیرمنو باز کند، صفحه‌ای را باز کند یا گفتگو را به دپارتمان مشخصی وصل کند."
        actions={
          <button type="button" onClick={() => setDraft(emptyDraft(null))} className={primaryBtn} style={primaryBtnStyle}>
            <Plus className="h-4 w-4" /> گزینه‌ی منوی اصلی
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-1.5 rounded-2xl p-4" style={cardStyle}>
          <div className="mb-3 rounded-xl bg-indigo-50 px-3 py-2 text-[12.5px] font-bold text-indigo-900">
            🤖 {settings?.bot.greeting ?? "…"}
            <span className="mr-2 text-[10.5px] font-normal text-indigo-500">(پرسش آغازین — در تنظیمات چت قابل تغییر است)</span>
          </div>
          {!nodes ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : roots.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-gray-400">هنوز گزینه‌ای تعریف نشده است</p>
          ) : (
            roots.map((n, i) => renderNode(n, 0, i, roots.length))
          )}
          <p className="pt-2 text-[11px] text-gray-400">
            زیر هر پاسخ، دکمه‌های «بازگشت»، «منوی اصلی» و «گفتگو با کارشناس» به‌طور خودکار اضافه می‌شوند (قابل تنظیم در تنظیمات چت). ستون عدد، تعداد انتخاب هر گزینه است.
          </p>
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          {draft ? (
            <Editor
              draft={draft}
              setDraft={setDraft}
              nodes={nodes ?? []}
              departments={(departments ?? []).filter((d) => d.isActive)}
              onSave={save}
              onCancel={() => setDraft(null)}
              saving={saving}
              error={error}
            />
          ) : (
            <div className="rounded-2xl p-4 text-[12px] leading-6 text-gray-500" style={cardStyle}>
              برای ویرایش روی یک گزینه کلیک کنید یا با دکمه‌ی + زیرگزینه بسازید.
              <ul className="mt-2 list-disc space-y-1 pr-4">
                {(Object.keys(ACTIONS) as Action[]).map((a) => (
                  <li key={a}>
                    <b>{ACTIONS[a].label}:</b> {ACTIONS[a].hint}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
