"use client";
// admin/app/(dashboard)/livechat/canned/page.tsx — پاسخ‌های سریع اپراتورها (میانبر «/» در میز کار)
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Pencil, Plus, Save, Trash2, X, Zap } from "lucide-react";
import { PageHeader, usePerm } from "@/app/components/finance/ui";
import { cardStyle, fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle } from "@/app/components/agents/ui";
import type { CannedResponse } from "@/app/components/livechat/types";

interface Draft {
  id?: string;
  shortcut: string;
  title: string;
  body: string;
  departmentId: string;
  shared: boolean;
}

export default function LivechatCannedPage() {
  const can = usePerm();
  const canManage = can("livechat.manage");
  const { data, mutate } = useSWR<CannedResponse[]>("/api/admin/livechat/canned", fetcher);
  const { data: departments } = useSWR<{ id: string; name: string }[]>("/api/admin/livechat/departments", fetcher);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const body = {
      shortcut: draft.shortcut,
      title: draft.title,
      body: draft.body,
      departmentId: draft.departmentId || null,
      ...(draft.id ? {} : { shared: draft.shared }),
    };
    try {
      if (draft.id) await axios.patch(`/api/admin/livechat/canned/${draft.id}`, body);
      else await axios.post("/api/admin/livechat/canned", body);
      await mutate();
      setDraft(null);
    } catch (e) {
      setError(getErrorMessage(e, "ذخیره ناموفق بود"));
    } finally {
      setSaving(false);
    }
  };

  const rows = (data ?? []).filter((r) => !filter || r.shortcut.includes(filter) || r.title.includes(filter) || r.body.includes(filter));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={Zap}
        title="پاسخ‌های سریع"
        subtitle="متن‌های آماده برای پاسخ سریع کارشناسان. در میز کار با تایپ «/» و بخشی از میانبر درج می‌شوند؛ {{name}} با نام بازدیدکننده جایگزین می‌شود. پاسخ مشترک برای همه‌ی کارشناسان و پاسخ شخصی فقط برای خود شماست."
        actions={
          <button
            type="button"
            onClick={() => setDraft({ shortcut: "", title: "", body: "", departmentId: "", shared: canManage })}
            className={primaryBtn}
            style={primaryBtnStyle}
          >
            <Plus className="h-4 w-4" /> پاسخ سریع جدید
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="جستجو" className={inputCls + " mt-0!"} />
          {!data ? (
            <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-gray-400" />
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-gray-400">پاسخ سریعی تعریف نشده است</p>
          ) : (
            rows.map((r) => {
              const editable = r.operatorId ? true : canManage;
              return (
                <div key={r.id} className="flex items-start gap-2 rounded-2xl p-3" style={cardStyle}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-black text-gray-800">
                      <span className="rounded bg-gray-100 px-1.5 font-mono text-[11px] text-gray-500" dir="ltr">
                        /{r.shortcut}
                      </span>
                      {r.title}
                      <span className={`rounded px-1.5 text-[10px] font-bold ${r.operatorId ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-700"}`}>
                        {r.operatorId ? "شخصی" : "مشترک"}
                      </span>
                      {r.department && <span className="rounded bg-gray-100 px-1.5 text-[10px] text-gray-500">{r.department.name}</span>}
                      <span className="text-[10px] font-normal text-gray-400">{r.usageCount.toLocaleString("fa-IR")} بار</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-gray-600">{r.body}</p>
                  </div>
                  {editable && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDraft({ id: r.id, shortcut: r.shortcut, title: r.title, body: r.body, departmentId: r.departmentId ?? "", shared: !r.operatorId })}
                        className="rounded p-1.5 hover:bg-gray-100"
                        aria-label="ویرایش"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("حذف شود؟")) return;
                          await axios.delete(`/api/admin/livechat/canned/${r.id}`);
                          await mutate();
                        }}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
        {draft && (
          <div className="space-y-3 rounded-2xl p-4 lg:sticky lg:top-4 lg:self-start" style={cardStyle}>
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-black">{draft.id ? "ویرایش پاسخ سریع" : "پاسخ سریع جدید"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="بستن">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <label className="block text-[12px] font-bold text-gray-600">
              میانبر
              <input dir="ltr" value={draft.shortcut} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} className={inputCls} placeholder="salam" />
            </label>
            <label className="block text-[12px] font-bold text-gray-600">
              عنوان
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-[12px] font-bold text-gray-600">
              متن
              <textarea rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-[12px] font-bold text-gray-600">
              دپارتمان (اختیاری)
              <select value={draft.departmentId} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })} className={inputCls}>
                <option value="">همه</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            {!draft.id && canManage && (
              <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
                <input type="checkbox" checked={draft.shared} onChange={(e) => setDraft({ ...draft, shared: e.target.checked })} /> مشترک برای همه‌ی کارشناسان
              </label>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{error}</p>}
            <button type="button" onClick={save} disabled={saving || !draft.shortcut.trim() || !draft.title.trim() || !draft.body.trim()} className={primaryBtn + " w-full"} style={primaryBtnStyle}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
