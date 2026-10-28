"use client";
// admin/app/(dashboard)/livechat/team/page.tsx — کارشناسان چت و دپارتمان‌ها
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Building2, Loader2, Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";
import { PageHeader } from "@/app/components/finance/ui";
import { cardStyle, fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle } from "@/app/components/agents/ui";
import { OPERATOR_STATUS_META, type OperatorStatus } from "@/app/components/livechat/types";
import { relTime } from "@/app/components/livechat/ConversationList";

interface Department {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  operatorsCount: number;
  conversationsCount: number;
}

interface Operator {
  id: string;
  fullName: string;
  username: string;
  displayName: string;
  title: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  maxConcurrentChats: number;
  acceptsAutoAssign: boolean;
  lastSeenAt: string | null;
  departments: { id: string; name: string }[];
  connected: boolean;
  status: OperatorStatus;
  activeChats: number;
}

export default function LivechatTeamPage() {
  const { data: departments, mutate: mutateDeps } = useSWR<Department[]>("/api/admin/livechat/departments", fetcher);
  const { data: operators, mutate: mutateOps } = useSWR<Operator[]>("/api/admin/livechat/operators", fetcher, { refreshInterval: 30_000 });
  const [dep, setDep] = useState<Partial<Department> | null>(null);
  const [op, setOp] = useState<(Operator & { departmentIds: string[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveDep = async () => {
    if (!dep) return;
    setBusy(true);
    setError(null);
    const body = { name: dep.name, description: dep.description || null, isActive: dep.isActive ?? true, sortOrder: dep.sortOrder ?? 0 };
    try {
      if (dep.id) await axios.patch(`/api/admin/livechat/departments/${dep.id}`, body);
      else await axios.post("/api/admin/livechat/departments", body);
      await mutateDeps();
      setDep(null);
    } catch (e) {
      setError(getErrorMessage(e, "ذخیره ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const saveOp = async () => {
    if (!op) return;
    setBusy(true);
    setError(null);
    try {
      await axios.patch(`/api/admin/livechat/operators/${op.id}`, {
        displayName: op.displayName,
        title: op.title || null,
        avatarUrl: op.avatarUrl || null,
        maxConcurrentChats: Number(op.maxConcurrentChats),
        acceptsAutoAssign: op.acceptsAutoAssign,
        isActive: op.isActive,
        departmentIds: op.departmentIds,
      });
      await Promise.all([mutateOps(), mutateDeps()]);
      setOp(null);
    } catch (e) {
      setError(getErrorMessage(e, "ذخیره ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={Users}
        title="کارشناسان و دپارتمان‌ها"
        subtitle="هر ادمینی که دسترسی «میز کار چت آنلاین» دارد کارشناس چت است. نام نمایشی، سمت و تصویر کارشناس به بازدیدکننده نشان داده می‌شود. گفتگوی هر دپارتمان فقط به اعضای همان دپارتمان تخصیص می‌یابد (دپارتمان بدون عضو = همه‌ی کارشناسان)."
      />
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-[12.5px] font-bold text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl p-4" style={cardStyle}>
          <h2 className="mb-3 flex items-center gap-1.5 text-[14px] font-black">
            <Users className="h-4 w-4" /> کارشناسان
          </h2>
          {!operators ? (
            <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-gray-400" />
          ) : operators.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-gray-400">ادمینی با دسترسی چت آنلاین وجود ندارد؛ از «نقش‌ها و دسترسی‌ها» دسترسی livechat.view را بدهید.</p>
          ) : (
            <div className="space-y-2">
              {operators.map((o) => {
                const status = o.connected ? o.status : "OFFLINE";
                return (
                  <div key={o.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${o.isActive ? "" : "opacity-50"}`} style={{ borderColor: "var(--color-border)" }}>
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-[14px] font-black text-gray-600">
                      {o.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- آواتار از نشانی تنظیم‌شده
                        <img src={o.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        o.displayName.charAt(0)
                      )}
                      <span className="absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-white" style={{ backgroundColor: OPERATOR_STATUS_META[status].color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-gray-800">
                        {o.displayName} {o.title && <span className="text-[11px] font-normal text-gray-400">· {o.title}</span>}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {o.fullName} ({o.username}) · {OPERATOR_STATUS_META[status].label}
                        {!o.connected && o.lastSeenAt && ` · آخرین حضور ${relTime(o.lastSeenAt)}`}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-1 text-[10.5px]">
                        <span className="rounded bg-gray-100 px-1.5 text-gray-600">
                          {o.activeChats.toLocaleString("fa-IR")}/{o.maxConcurrentChats.toLocaleString("fa-IR")} گفتگو
                        </span>
                        {!o.acceptsAutoAssign && <span className="rounded bg-amber-50 px-1.5 text-amber-700">بدون تخصیص خودکار</span>}
                        {o.departments.map((d) => (
                          <span key={d.id} className="rounded bg-indigo-50 px-1.5 text-indigo-700">
                            {d.name}
                          </span>
                        ))}
                      </p>
                    </div>
                    <button type="button" onClick={() => setOp({ ...o, departmentIds: o.departments.map((d) => d.id) })} className="rounded p-1.5 hover:bg-gray-100" aria-label="ویرایش">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="space-y-5">
          {op && (
            <section className="space-y-3 rounded-2xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-black">ویرایش کارشناس</h2>
                <button type="button" onClick={() => setOp(null)} aria-label="بستن">
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <label className="block text-[12px] font-bold text-gray-600">
                نام نمایشی برای بازدیدکننده
                <input value={op.displayName} onChange={(e) => setOp({ ...op, displayName: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                سمت (اختیاری)
                <input value={op.title ?? ""} onChange={(e) => setOp({ ...op, title: e.target.value })} className={inputCls} placeholder="کارشناس مالی" />
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                نشانی تصویر (اختیاری)
                <input dir="ltr" value={op.avatarUrl ?? ""} onChange={(e) => setOp({ ...op, avatarUrl: e.target.value })} className={inputCls} placeholder="/brand/operators/sara.png" />
                <span className="mt-1 block text-[10.5px] font-normal text-gray-400">
                  تصویر باید روی همان دامنه‌ی اپ یا API باشد (سیاست امنیتی محتوای اپ تصویر دامنه‌های دیگر را نمایش نمی‌دهد).
                </span>
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                بیشینه‌ی گفتگوی هم‌زمان
                <input type="number" min={1} max={50} dir="ltr" value={op.maxConcurrentChats} onChange={(e) => setOp({ ...op, maxConcurrentChats: Number(e.target.value) })} className={inputCls} />
              </label>
              <div>
                <p className="mb-1 text-[12px] font-bold text-gray-600">دپارتمان‌ها</p>
                <div className="flex flex-wrap gap-1.5">
                  {(departments ?? []).map((d) => {
                    const on = op.departmentIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setOp({ ...op, departmentIds: on ? op.departmentIds.filter((x) => x !== d.id) : [...op.departmentIds, d.id] })}
                        className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-bold ${on ? "text-white" : "bg-white text-gray-600"}`}
                        style={on ? { backgroundColor: "var(--color-emerald)", borderColor: "var(--color-emerald)" } : { borderColor: "var(--color-border)" }}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
                <input type="checkbox" checked={op.acceptsAutoAssign} onChange={(e) => setOp({ ...op, acceptsAutoAssign: e.target.checked })} /> دریافت تخصیص خودکار
              </label>
              <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
                <input type="checkbox" checked={op.isActive} onChange={(e) => setOp({ ...op, isActive: e.target.checked })} /> کارشناس فعال
              </label>
              <button type="button" onClick={saveOp} disabled={busy} className={primaryBtn + " w-full"} style={primaryBtnStyle}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره
              </button>
            </section>
          )}

          <section className="rounded-2xl p-4" style={cardStyle}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[14px] font-black">
                <Building2 className="h-4 w-4" /> دپارتمان‌ها
              </h2>
              <button type="button" onClick={() => setDep({ name: "", isActive: true })} className="flex items-center gap-1 text-[12px] font-bold" style={{ color: "var(--color-emerald)" }}>
                <Plus className="h-4 w-4" /> افزودن
              </button>
            </div>
            {dep && (
              <div className="mb-3 space-y-2 rounded-xl bg-gray-50 p-3">
                <input value={dep.name ?? ""} onChange={(e) => setDep({ ...dep, name: e.target.value })} placeholder="نام دپارتمان" className={inputCls + " mt-0!"} />
                <input value={dep.description ?? ""} onChange={(e) => setDep({ ...dep, description: e.target.value })} placeholder="توضیح (اختیاری)" className={inputCls + " mt-0!"} />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-600">
                    <input type="checkbox" checked={dep.isActive ?? true} onChange={(e) => setDep({ ...dep, isActive: e.target.checked })} /> فعال
                  </label>
                  <input type="number" dir="ltr" value={dep.sortOrder ?? 0} onChange={(e) => setDep({ ...dep, sortOrder: Number(e.target.value) })} className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-[12px]" title="ترتیب" />
                  <button type="button" onClick={saveDep} disabled={busy || (dep.name ?? "").trim().length < 2} className="mr-auto rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={primaryBtnStyle}>
                    ذخیره
                  </button>
                  <button type="button" onClick={() => setDep(null)} className="text-[12px] text-gray-500">
                    انصراف
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              {(departments ?? []).map((d) => (
                <div key={d.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${d.isActive ? "" : "opacity-50"}`} style={{ borderColor: "var(--color-border)" }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-black text-gray-800">{d.name}</p>
                    <p className="text-[10.5px] text-gray-400">
                      {d.operatorsCount.toLocaleString("fa-IR")} کارشناس · {d.conversationsCount.toLocaleString("fa-IR")} گفتگو
                      {d.description && ` · ${d.description}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setDep(d)} className="rounded p-1 hover:bg-gray-100" aria-label="ویرایش">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`دپارتمان «${d.name}» حذف شود؟ گفتگوهای آن بدون دپارتمان می‌مانند.`)) return;
                      try {
                        await axios.delete(`/api/admin/livechat/departments/${d.id}`);
                        await mutateDeps();
                      } catch (e) {
                        setError(getErrorMessage(e, "حذف ناموفق بود"));
                      }
                    }}
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    aria-label="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
