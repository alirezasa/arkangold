// admin/app/(dashboard)/agents/contracts/page.tsx
//
// قراردادهای الکترونیک نمایندگان و قالب‌های قرارداد.
"use client";
import { useState } from "react";
import useSWR from "swr";
import { FileSignature, Plus } from "lucide-react";
import { ContractsTable, type ContractListItem } from "@/app/components/agents/ContractViews";
import {
  ActionButton,
  Alert,
  Empty,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  Tabs,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type Tab = "contracts" | "templates";
interface Template {
  id: string;
  title: string;
  body: string;
  description: string | null;
  isActive: boolean;
  version: number;
  contractCount: number;
  updatedAt: string;
}

const STATUS_FILTERS = [
  { key: "", label: "همه" },
  { key: "ISSUED", label: "در انتظار امضا" },
  { key: "SIGNED", label: "امضاشده" },
  { key: "DRAFT", label: "پیش‌نویس" },
  { key: "EXPIRED", label: "منقضی" },
  { key: "CANCELLED", label: "ابطال‌شده" },
];

export default function AgentContractsPage() {
  const [tab, setTab] = useState<Tab>("contracts");
  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={FileSignature}
        title="قراردادهای نمایندگان"
        subtitle="صدور قرارداد از روی قالب با اطلاعات نماینده، ارسال برای امضا در پرتال نمایندگی و امضای الکترونیک با کد یکبارمصرف پیامکی به موبایل نماینده. برای صدور قرارداد جدید، از صفحه‌ی هر نماینده (تب قراردادها) اقدام کنید."
      />
      <Tabs<Tab>
        tabs={[
          { key: "contracts", label: "قراردادها" },
          { key: "templates", label: "قالب‌های قرارداد" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "contracts" ? <ContractsTab /> : <TemplatesTab />}
    </div>
  );
}

function ContractsTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (status) qs.set("status", status);
  const { data, isLoading } = useSWR<{ items: ContractListItem[]; statusCounts: Record<string, number>; page: number; totalPages: number }>(
    `/api/admin/agent-contracts?${qs.toString()}`,
    fetcher,
  );
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setStatus(f.key);
              setPage(1);
            }}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border ${status === f.key ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600"}`}
            style={status === f.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {f.label}
            {f.key && data?.statusCounts?.[f.key] ? ` (${data.statusCounts[f.key].toLocaleString("fa-IR")})` : ""}
          </button>
        ))}
      </div>
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? <Spinner /> : data.items.length === 0 ? <Empty text="قراردادی یافت نشد" /> : <ContractsTable items={data.items} showAgent />}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}

function TemplatesTab() {
  const { data, isLoading, mutate } = useSWR<{ items: Template[]; variables: { name: string; label: string }[] }>("/api/admin/agent-contracts/templates", fetcher);
  const [edit, setEdit] = useState<Template | "new" | null>(null);
  const can = usePerm();
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-3">
      {can("agent.contract.manage") && (
        <ActionButton onClick={() => setEdit("new")}>
          <Plus className="w-4 h-4" /> قالب جدید
        </ActionButton>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.items.map((t) => (
          <div key={t.id} className="rounded-2xl p-4 space-y-2" style={cardStyle}>
            <div className="flex items-center justify-between">
              <p className="font-black">{t.title}</p>
              <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${t.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {t.isActive ? "فعال" : "غیرفعال"}
              </span>
            </div>
            {t.description && <p className="text-[12px] text-gray-500">{t.description}</p>}
            <p className="text-[11px] text-gray-400">
              نسخه {t.version.toLocaleString("fa-IR")} — {t.contractCount.toLocaleString("fa-IR")} قرارداد — به‌روزرسانی {faDateTime(t.updatedAt)}
            </p>
            {can("agent.contract.manage") && (
              <button type="button" onClick={() => setEdit(t)} className="text-[12px] font-bold text-emerald-700">
                ویرایش متن
              </button>
            )}
          </div>
        ))}
      </div>
      {edit && (
        <TemplateModal
          tpl={edit === "new" ? null : edit}
          variables={data.variables}
          onClose={() => {
            setEdit(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({ tpl, variables, onClose }: { tpl: Template | null; variables: { name: string; label: string }[]; onClose: () => void }) {
  const [title, setTitle] = useState(tpl?.title ?? "");
  const [description, setDescription] = useState(tpl?.description ?? "");
  const [body, setBody] = useState(tpl?.body ?? "");
  const [isActive, setIsActive] = useState(tpl?.isActive ?? true);
  const act = useAction();
  const save = async () => {
    const payload = { title, description: description || null, body, isActive };
    const ok = await act.run(() => (tpl ? api.patch(`/api/admin/agent-contracts/templates/${tpl.id}`, payload) : api.post("/api/admin/agent-contracts/templates", payload)));
    if (ok) onClose();
  };
  return (
    <Modal title={tpl ? "ویرایش قالب قرارداد" : "قالب قرارداد جدید"} onClose={onClose} wide>
      <div className="space-y-3">
        <Alert kind="info" text="ویرایش قالب، قراردادهای صادرشده را تغییر نمی‌دهد؛ هر قرارداد متن خود را در لحظه‌ی صدور قفل می‌کند." />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="عنوان">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="توضیح داخلی">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="متن قرارداد" hint="متغیرها هنگام صدور با اطلاعات نماینده و شرکت جایگزین می‌شوند">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className={`${inputCls} leading-7 text-[13px]`} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <button key={v.name} type="button" onClick={() => setBody((b) => `${b}{${v.name}}`)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold">
              {v.label} <span dir="ltr">{`{${v.name}}`}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] font-bold">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> فعال (قابل انتخاب هنگام صدور قرارداد)
        </label>
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} onClick={() => void save()}>
          ذخیره قالب
        </ActionButton>
      </div>
    </Modal>
  );
}
