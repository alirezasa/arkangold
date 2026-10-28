"use client";
// admin/app/(dashboard)/livechat/triggers/page.tsx — پیام‌های خودکار (پیشگام) ویجت چت
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Megaphone, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { PageHeader } from "@/app/components/finance/ui";
import { cardStyle, fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle } from "@/app/components/agents/ui";

interface Trigger {
  id: string;
  name: string;
  message: string;
  urlContains: string | null;
  delaySeconds: number;
  audience: "ALL" | "USER" | "GUEST";
  onlyWhenOnline: boolean;
  openWidget: boolean;
  isActive: boolean;
  sortOrder: number;
}

const AUDIENCE: Record<string, string> = { ALL: "همه", USER: "کاربران واردشده", GUEST: "مهمان‌ها" };
const blank: Omit<Trigger, "id"> = {
  name: "",
  message: "",
  urlContains: "",
  delaySeconds: 20,
  audience: "ALL",
  onlyWhenOnline: true,
  openWidget: false,
  isActive: true,
  sortOrder: 0,
};

export default function LivechatTriggersPage() {
  const { data, mutate } = useSWR<Trigger[]>("/api/admin/livechat/triggers", fetcher);
  const [draft, setDraft] = useState<(Omit<Trigger, "id"> & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const { id, ...rest } = draft;
    const body = { ...rest, urlContains: rest.urlContains?.trim() || null, delaySeconds: Number(rest.delaySeconds), sortOrder: Number(rest.sortOrder) };
    try {
      if (id) await axios.patch(`/api/admin/livechat/triggers/${id}`, body);
      else await axios.post("/api/admin/livechat/triggers", body);
      await mutate();
      setDraft(null);
    } catch (e) {
      setError(getErrorMessage(e, "ذخیره ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={Megaphone}
        title="پیام‌های خودکار"
        subtitle="پیامی که پس از چند ثانیه ماندن در یک صفحه (مثلاً صفحه‌ی خرید شمش) کنار دکمه‌ی چت ظاهر می‌شود یا پنجره‌ی چت را باز می‌کند. هر پیام در هر نشست مرورگر یک‌بار نمایش داده می‌شود و اگر بازدیدکننده پاسخ دهد، گفتگو با همین پیام آغاز می‌شود."
        actions={
          <button type="button" onClick={() => setDraft({ ...blank })} className={primaryBtn} style={primaryBtnStyle}>
            <Plus className="h-4 w-4" /> پیام خودکار جدید
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          {!data ? (
            <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-gray-400" />
          ) : data.length === 0 ? (
            <p className="rounded-2xl py-10 text-center text-[12px] text-gray-400" style={cardStyle}>
              هنوز پیام خودکاری تعریف نشده است. مثال: «۲۰ ثانیه در صفحه‌ی /dashboard/gold-ingot ← سوالی درباره‌ی خرید شمش دارید؟»
            </p>
          ) : (
            data.map((t) => (
              <div key={t.id} className={`flex items-start gap-2 rounded-2xl p-3 ${t.isActive ? "" : "opacity-50"}`} style={cardStyle}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-gray-800">{t.name}</p>
                  <p className="mt-1 rounded-xl bg-gray-50 px-3 py-2 text-[12px] text-gray-700">{t.message}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1 text-[10.5px] text-gray-500">
                    <span className="rounded bg-gray-100 px-1.5">صفحه: {t.urlContains ? <span dir="ltr">{t.urlContains}</span> : "همه"}</span>
                    <span className="rounded bg-gray-100 px-1.5">پس از {t.delaySeconds.toLocaleString("fa-IR")} ثانیه</span>
                    <span className="rounded bg-gray-100 px-1.5">{AUDIENCE[t.audience]}</span>
                    {t.onlyWhenOnline && <span className="rounded bg-emerald-50 px-1.5 text-emerald-700">فقط با کارشناس آنلاین</span>}
                    {t.openWidget && <span className="rounded bg-amber-50 px-1.5 text-amber-700">باز کردن پنجره</span>}
                  </p>
                </div>
                <button type="button" onClick={() => setDraft({ ...t, urlContains: t.urlContains ?? "" })} className="rounded p-1.5 hover:bg-gray-100" aria-label="ویرایش">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("حذف شود؟")) return;
                    await axios.delete(`/api/admin/livechat/triggers/${t.id}`);
                    await mutate();
                  }}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
        {draft && (
          <div className="space-y-3 rounded-2xl p-4 lg:sticky lg:top-4 lg:self-start" style={cardStyle}>
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-black">{draft.id ? "ویرایش پیام خودکار" : "پیام خودکار جدید"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="بستن">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <label className="block text-[12px] font-bold text-gray-600">
              نام (برای شما)
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-[12px] font-bold text-gray-600">
              متن پیام
              <textarea rows={3} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-[12px] font-bold text-gray-600">
              بخشی از مسیر صفحه (خالی = همه‌ی صفحات)
              <input dir="ltr" value={draft.urlContains ?? ""} onChange={(e) => setDraft({ ...draft, urlContains: e.target.value })} className={inputCls} placeholder="/dashboard/gold-ingot" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[12px] font-bold text-gray-600">
                تأخیر (ثانیه)
                <input type="number" dir="ltr" min={0} max={3600} value={draft.delaySeconds} onChange={(e) => setDraft({ ...draft, delaySeconds: Number(e.target.value) })} className={inputCls} />
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                مخاطب
                <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Trigger["audience"] })} className={inputCls}>
                  {Object.entries(AUDIENCE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
              <input type="checkbox" checked={draft.onlyWhenOnline} onChange={(e) => setDraft({ ...draft, onlyWhenOnline: e.target.checked })} /> فقط وقتی کارشناس آنلاین است
            </label>
            <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
              <input type="checkbox" checked={draft.openWidget} onChange={(e) => setDraft({ ...draft, openWidget: e.target.checked })} /> پنجره‌ی چت خودکار باز شود (به‌جای حباب کوچک)
            </label>
            <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> فعال
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{error}</p>}
            <button type="button" onClick={save} disabled={busy || draft.name.trim().length < 2 || !draft.message.trim()} className={primaryBtn + " w-full"} style={primaryBtnStyle}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
