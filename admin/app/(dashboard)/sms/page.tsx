// admin/app/(dashboard)/sms/page.tsx
//
// مرکز پیامک: سامانه‌های ارسال (قاصدک / sms.ir)، متن پیامک هر رویداد و گزارش ارسال‌ها.
"use client";
import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, KeyRound, MessageSquareText, RefreshCw, RotateCcw, Send, Server, Wallet } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  DateRange,
  Empty,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Tabs,
  api,
  cardStyle,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type Tab = "providers" | "templates" | "logs";

interface ProviderField {
  key: string;
  label: string;
  secret: boolean;
  hint: string;
  configured: boolean;
}
interface ProviderRow {
  code: string;
  name: string;
  providerActive: boolean;
  linkActive: boolean;
  effectiveActive: boolean;
  priority: number;
  isFallback: boolean;
  fields: ProviderField[];
  ready: boolean;
}
interface ProvidersResp {
  serviceActive: boolean;
  liveSendAllowed: boolean;
  environment: string;
  providers: ProviderRow[];
}
interface TemplateRow {
  id: string;
  key: string;
  title: string;
  category: string;
  categoryLabel: string;
  body: string;
  isActive: boolean;
  providerCode: string | null;
  sendMode: "TEXT" | "PATTERN";
  smsirTemplateId: string | null;
  ghasedakTemplateName: string | null;
  variables: { name: string; label: string; sample: string }[];
  sensitive: boolean;
  defaultBody: string | null;
  preview: string;
  updatedAt: string;
}
interface LogRow {
  id: string;
  phone: string;
  templateKey: string | null;
  providerCode: string | null;
  sendMode: string;
  text: string;
  status: string;
  providerMessageId: string | null;
  cost: string | null;
  errorMessage: string | null;
  referenceType: string | null;
  createdAt: string;
}
interface LogsResp {
  total: number;
  page: number;
  totalPages: number;
  summary: { byStatus: Record<string, number>; byProvider: { providerCode: string | null; count: number; cost: string }[] };
  items: LogRow[];
}

const PROVIDER_FA: Record<string, string> = { GHASEDAK: "قاصدک", SMSIR: "sms.ir", MOCK: "شبیه‌ساز (لاگ)" };

const LOG_STATUS: Record<string, { label: string; cls: string }> = {
  SENT: { label: "ارسال‌شده", cls: "bg-green-50 text-green-700" },
  FAILED: { label: "ناموفق", cls: "bg-red-50 text-red-600" },
  DRY_RUN: { label: "آزمایشی (غیرعملیاتی)", cls: "bg-blue-50 text-blue-700" },
  SKIPPED: { label: "ارسال نشد", cls: "bg-gray-100 text-gray-500" },
};

export default function SmsCenterPage() {
  const [tab, setTab] = useState<Tab>("templates");
  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={MessageSquareText}
        title="مرکز پیامک"
        subtitle="سامانه‌های ارسال پیامک (قاصدک و sms.ir)، متن پیامک هر مرحله از سفارش، واریز/برداشت، کدهای ورود و قرارداد نمایندگان، و گزارش همه‌ی ارسال‌ها."
      />
      <Tabs<Tab>
        tabs={[
          { key: "templates", label: "متن پیامک رویدادها" },
          { key: "providers", label: "سامانه‌های ارسال" },
          { key: "logs", label: "گزارش ارسال" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "providers" && <ProvidersTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

// ═══════════════════════════ سامانه‌ها ═══════════════════════════

function ProvidersTab() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<ProvidersResp>("/api/admin/sms/providers", fetcher);
  const [credTarget, setCredTarget] = useState<ProviderRow | null>(null);
  const [testTarget, setTestTarget] = useState<ProviderRow | null>(null);
  const act = useAction();

  if (isLoading || !data) return <Spinner />;

  const update = (code: string, body: Record<string, unknown>) =>
    act.run(() => api.patch(`/api/admin/sms/providers/${code}`, body)).then(() => mutate());

  return (
    <div className="space-y-4">
      {data.liveSendAllowed ? (
        <Alert kind="success" text="محیط عملیاتی (production): پیامک‌ها از سامانه‌ی فعال واقعاً ارسال می‌شوند." />
      ) : (
        <Alert
          kind="warn"
          text={`محیط فعلی «${data.environment}» عملیاتی نیست؛ قاصدک و sms.ir هیچ درخواستی ارسال نمی‌کنند و پیامک‌ها فقط به‌صورت «آزمایشی» در گزارش ثبت می‌شوند.`}
        />
      )}
      {!data.serviceActive && <Alert kind="error" text="سرویس SMS در بخش یکپارچه‌سازی‌ها غیرفعال است؛ هیچ پیامکی ارسال نمی‌شود." />}
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}

      <p className="text-[12px] text-gray-500">
        پیامک‌ها از سامانه‌ی فعال با کمترین عدد اولویت ارسال می‌شوند؛ اگر آن سامانه دچار خطای فنی (قطعی، تأخیر، خطای سرور) شود،
        خودکار از سامانه‌ی فعال بعدی ارسال می‌شود. برای هر رویداد می‌توانید در تب «متن پیامک رویدادها» سامانه‌ی اختصاصی تعیین کنید.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {data.providers.map((p) => (
          <div key={p.code} className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-gray-400" />
                <span className="font-black text-[14px]">{p.name}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${p.effectiveActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
              >
                {p.effectiveActive ? "فعال" : "غیرفعال"}
              </span>
            </div>

            {p.fields.length > 0 && (
              <ul className="space-y-1 text-[12px]">
                {p.fields.map((f) => (
                  <li key={f.key} className="flex items-center gap-1.5">
                    {f.configured ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className={f.configured ? "text-gray-700" : "text-amber-700"}>
                      {f.label} {f.configured ? "" : "— ثبت نشده"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-gray-500">اولویت:</span>
              <input
                type="number"
                min={1}
                max={99}
                defaultValue={p.priority}
                disabled={!can("sms.manage")}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== p.priority) void update(p.code, { priority: v });
                }}
                className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-center"
              />
            </div>

            {p.code !== "MOCK" && <AccountInfo code={p.code} />}

            <div className="flex flex-wrap gap-2 pt-1">
              {can("sms.manage") && (
                <ActionButton
                  variant={p.effectiveActive ? "danger" : "primary"}
                  busy={act.busy}
                  onClick={() => void update(p.code, { isActive: !p.effectiveActive })}
                >
                  {p.effectiveActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                </ActionButton>
              )}
              {p.fields.length > 0 && can("integrations.credentials.manage") && (
                <ActionButton variant="secondary" onClick={() => setCredTarget(p)}>
                  <KeyRound className="w-4 h-4" /> تنظیمات اتصال
                </ActionButton>
              )}
              {can("sms.manage") && (
                <ActionButton variant="secondary" onClick={() => setTestTarget(p)}>
                  <Send className="w-4 h-4" /> ارسال آزمایشی
                </ActionButton>
              )}
            </div>
          </div>
        ))}
      </div>

      {credTarget && (
        <CredentialsModal
          provider={credTarget}
          onClose={() => {
            setCredTarget(null);
            void mutate();
          }}
        />
      )}
      {testTarget && <ProviderTestModal provider={testTarget} onClose={() => setTestTarget(null)} />}
    </div>
  );
}

function AccountInfo({ code }: { code: string }) {
  const [state, setState] = useState<{ loading: boolean; text: string; error: boolean }>({ loading: false, text: "", error: false });
  const load = async () => {
    setState({ loading: true, text: "", error: false });
    try {
      const r = await api.get(`/api/admin/sms/providers/${code}/account`);
      const d = r.data as { credit: number | null; creditUnit: string; lines?: string[] };
      setState({
        loading: false,
        error: false,
        text: `اعتبار: ${d.credit == null ? "—" : faNum(d.credit, 2)} ${d.creditUnit}${d.lines?.length ? ` — خطوط: ${d.lines.join("، ")}` : ""}`,
      });
    } catch (e) {
      setState({ loading: false, error: true, text: getErrorMessage(e, "استعلام اعتبار ناموفق بود") });
    }
  };
  return (
    <div className="text-[12px]">
      <button type="button" onClick={load} className="flex items-center gap-1 text-emerald-700 font-bold" disabled={state.loading}>
        {state.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />} استعلام اعتبار حساب
      </button>
      {state.text && <p className={`mt-1 ${state.error ? "text-red-600" : "text-gray-600"}`}>{state.text}</p>}
    </div>
  );
}

function CredentialsModal({ provider, onClose }: { provider: ProviderRow; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const act = useAction();
  const save = async () => {
    for (const f of provider.fields) {
      const v = values[f.key]?.trim();
      if (!v) continue;
      const ok = await act.run(() => api.post(`/api/admin/sms/providers/${provider.code}/credentials`, { key: f.key, value: v }));
      if (!ok) return;
    }
    onClose();
  };
  return (
    <Modal title={`تنظیمات اتصال ${provider.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[12px] text-gray-500">مقادیر رمزنگاری‌شده ذخیره می‌شوند و پس از ذخیره قابل مشاهده نیستند. برای تغییر، مقدار جدید را وارد کنید.</p>
        {provider.fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.configured ? " (ثبت‌شده)" : ""}`} hint={f.hint}>
            <input
              type={f.secret ? "password" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              className={`${inputCls} text-left`}
              dir="ltr"
              autoComplete="off"
              placeholder={f.configured ? "بدون تغییر" : ""}
            />
          </Field>
        ))}
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} onClick={save}>
          ذخیره
        </ActionButton>
      </div>
    </Modal>
  );
}

function ProviderTestModal({ provider, onClose }: { provider: ProviderRow; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("پیامک آزمایشی مرکز پیامک آرکان گلد");
  const act = useAction();
  return (
    <Modal title={`ارسال آزمایشی از ${provider.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="شماره موبایل گیرنده">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} text-left`} dir="ltr" placeholder="09121234567" />
        </Field>
        <Field label="متن">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={inputCls} />
        </Field>
        {act.error && <Alert kind="error" text={act.error} />}
        {act.success && <Alert kind="success" text={act.success} />}
        <ActionButton busy={act.busy} onClick={() => void act.run(() => api.post(`/api/admin/sms/providers/${provider.code}/test`, { phone, text }))}>
          <Send className="w-4 h-4" /> ارسال
        </ActionButton>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ قالب‌ها ═══════════════════════════

function TemplatesTab() {
  const { data, isLoading, mutate } = useSWR<TemplateRow[]>("/api/admin/sms/templates", fetcher);
  const [edit, setEdit] = useState<TemplateRow | null>(null);
  const can = usePerm();
  if (isLoading || !data) return <Spinner />;

  const groups = data.reduce<Record<string, TemplateRow[]>>((acc, t) => {
    (acc[t.categoryLabel] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([label, rows]) => (
        <div key={label} className="rounded-2xl p-4 space-y-3" style={cardStyle}>
          <h2 className="font-black text-[14px] text-gray-800">{label}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((t) => (
              <div key={t.key} className="rounded-xl border border-gray-100 p-3 space-y-2 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-[13px]">{t.title}</p>
                    <p className="text-[10px] text-gray-400" dir="ltr">
                      {t.key}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${t.isActive || t.sensitive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {t.isActive || t.sensitive ? "فعال" : "غیرفعال"}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-gray-50 text-gray-600">
                      {t.providerCode ? PROVIDER_FA[t.providerCode] ?? t.providerCode : "اولویت پیش‌فرض"}
                    </span>
                    {t.sendMode === "PATTERN" && <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700">قالب سامانه</span>}
                  </div>
                </div>
                <p className="text-[12px] text-gray-600 whitespace-pre-line leading-6 bg-gray-50 rounded-lg p-2">{t.preview}</p>
                {can("sms.manage") && (
                  <button type="button" onClick={() => setEdit(t)} className="text-[12px] font-bold text-emerald-700">
                    ویرایش متن و تنظیمات
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {edit && (
        <TemplateModal
          tpl={edit}
          onClose={() => {
            setEdit(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({ tpl, onClose }: { tpl: TemplateRow; onClose: () => void }) {
  const [body, setBody] = useState(tpl.body);
  const [isActive, setIsActive] = useState(tpl.isActive);
  const [providerCode, setProviderCode] = useState(tpl.providerCode ?? "");
  const [sendMode, setSendMode] = useState<"TEXT" | "PATTERN">(tpl.sendMode);
  const [smsirTemplateId, setSmsirTemplateId] = useState(tpl.smsirTemplateId ?? "");
  const [ghasedakTemplateName, setGhasedakTemplateName] = useState(tpl.ghasedakTemplateName ?? "");
  const [testPhone, setTestPhone] = useState("");
  const act = useAction();

  const insertVar = (name: string) => setBody((b) => `${b}{${name}}`);
  const preview = tpl.variables.reduce(
    (acc, v) => acc.split(`{${v.name}}`).join(v.sample),
    body.split("{brand}").join("آرکان گلد"),
  );
  const patternParams = [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((n) => n !== "brand");

  const save = () =>
    act.run(() =>
      api.patch(`/api/admin/sms/templates/${tpl.key}`, {
        body,
        isActive,
        providerCode: providerCode || null,
        sendMode,
        smsirTemplateId: smsirTemplateId || null,
        ghasedakTemplateName: ghasedakTemplateName || null,
      }),
    );

  return (
    <Modal title={tpl.title} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="متن پیامک" hint={`${body.length.toLocaleString("fa-IR")} کاراکتر — با کلیک روی هر متغیر، آن را به انتهای متن اضافه کنید`}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={`${inputCls} leading-7`} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[{ name: "brand", label: "نام تجاری", sample: "" }, ...tpl.variables.filter((v) => v.name !== "brand")].map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => insertVar(v.name)}
              className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold"
            >
              {v.label} <span dir="ltr">{`{${v.name}}`}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-gray-50 p-3 text-[12px] whitespace-pre-line leading-6">
          <p className="font-bold text-gray-500 mb-1">پیش‌نمایش با داده‌ی نمونه:</p>
          {preview}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="سامانه‌ی ارسال">
            <select value={providerCode} onChange={(e) => setProviderCode(e.target.value)} className={inputCls}>
              <option value="">طبق اولویت سامانه‌ها</option>
              <option value="GHASEDAK">قاصدک</option>
              <option value="SMSIR">sms.ir</option>
              <option value="MOCK">شبیه‌ساز (فقط لاگ)</option>
            </select>
          </Field>
          <Field label="نحوه‌ی ارسال">
            <select value={sendMode} onChange={(e) => setSendMode(e.target.value as "TEXT" | "PATTERN")} className={inputCls}>
              <option value="TEXT">متن آزاد از خط اختصاصی</option>
              <option value="PATTERN">قالب تأییدشده‌ی سامانه (Verify / OTP)</option>
            </select>
          </Field>
          <Field label="وضعیت">
            <select
              value={isActive || tpl.sensitive ? "1" : "0"}
              disabled={tpl.sensitive}
              onChange={(e) => setIsActive(e.target.value === "1")}
              className={inputCls}
            >
              <option value="1">فعال — ارسال شود</option>
              <option value="0">غیرفعال — ارسال نشود</option>
            </select>
          </Field>
        </div>

        {sendMode === "PATTERN" && (
          <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 space-y-3">
            <p className="text-[12px] text-purple-900">
              در حالت قالب، متن در پنل سامانه تعریف و تأیید می‌شود و فقط مقدار پارامترها ارسال می‌شود (سریع‌تر و بدون فیلتر مخابرات؛ مناسب کدهای یکبارمصرف).
              نام پارامترها در قالب سامانه باید دقیقاً این‌ها باشد:{" "}
              <span dir="ltr" className="font-bold">
                {patternParams.join(" , ") || "—"}
              </span>
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="شناسه‌ی قالب در sms.ir (عددی)">
                <input value={smsirTemplateId} onChange={(e) => setSmsirTemplateId(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
              </Field>
              <Field label="نام قالب در قاصدک (templateName)">
                <input value={ghasedakTemplateName} onChange={(e) => setGhasedakTemplateName(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
              </Field>
            </div>
          </div>
        )}

        {act.error && <Alert kind="error" text={act.error} />}
        {act.success && <Alert kind="success" text={act.success} />}

        <div className="flex flex-wrap items-end gap-2">
          <ActionButton busy={act.busy} onClick={() => void save()}>
            ذخیره
          </ActionButton>
          {tpl.defaultBody && tpl.defaultBody !== body && (
            <ActionButton variant="secondary" onClick={() => setBody(tpl.defaultBody ?? body)}>
              <RotateCcw className="w-4 h-4" /> متن پیش‌فرض
            </ActionButton>
          )}
          <div className="flex items-end gap-2 mr-auto">
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="موبایل برای تست"
              className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm w-40 text-left"
              dir="ltr"
            />
            <ActionButton
              variant="secondary"
              busy={act.busy}
              onClick={() => void act.run(() => api.post(`/api/admin/sms/templates/${tpl.key}/test`, { phone: testPhone }))}
            >
              <Send className="w-4 h-4" /> ارسال نمونه (پس از ذخیره)
            </ActionButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ گزارش ═══════════════════════════

function LogsTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [phone, setPhone] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (status) qs.set("status", status);
  if (providerCode) qs.set("providerCode", providerCode);
  if (phone) qs.set("phone", phone);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useSWR<LogsResp>(`/api/admin/sms/logs?${qs.toString()}`, fetcher);
  const { data: templates } = useSWR<TemplateRow[]>("/api/admin/sms/templates", fetcher);
  const titleOf = (key: string | null) => (key ? templates?.find((t) => t.key === key)?.title ?? key : "متن آزاد");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <DateRange from={from} to={to} onFrom={(v) => { setFrom(v); setPage(1); }} onTo={(v) => { setTo(v); setPage(1); }}>
          <label className="text-[12px] font-bold text-gray-600">
            وضعیت
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="">همه</option>
              {Object.entries(LOG_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-bold text-gray-600">
            سامانه
            <select value={providerCode} onChange={(e) => { setProviderCode(e.target.value); setPage(1); }} className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="">همه</option>
              {Object.entries(PROVIDER_FA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-bold text-gray-600">
            موبایل
            <input value={phone} onChange={(e) => { setPhone(e.target.value); setPage(1); }} className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white w-36 text-left" dir="ltr" />
          </label>
        </DateRange>
        {data && (
          <div className="flex flex-wrap gap-2 text-[12px]">
            {Object.entries(data.summary.byStatus).map(([k, n]) => (
              <span key={k} className={`px-2.5 py-1 rounded-lg font-bold ${LOG_STATUS[k]?.cls ?? ""}`}>
                {LOG_STATUS[k]?.label ?? k}: {faNum(n, 0)}
              </span>
            ))}
            {data.summary.byProvider.map((p) => (
              <span key={p.providerCode ?? "-"} className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 font-bold">
                {p.providerCode ? PROVIDER_FA[p.providerCode] ?? p.providerCode : "بدون سامانه"}: {faNum(p.count, 0)} پیامک — هزینه {faNum(p.cost, 0)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty text="پیامکی یافت نشد" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>زمان</th>
                <th>گیرنده</th>
                <th>رویداد</th>
                <th>سامانه</th>
                <th>وضعیت</th>
                <th>متن</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{faDateTime(l.createdAt)}</td>
                  <td dir="ltr" className="text-left">{l.phone}</td>
                  <td className="whitespace-nowrap">{titleOf(l.templateKey)}</td>
                  <td>{l.providerCode ? PROVIDER_FA[l.providerCode] ?? l.providerCode : "—"}</td>
                  <td>
                    <Badge map={LOG_STATUS} value={l.status} />
                    {l.errorMessage && <p className="text-[10px] text-red-600 mt-1 max-w-[220px]">{l.errorMessage}</p>}
                  </td>
                  <td className="max-w-[360px] text-[11px] text-gray-600 whitespace-pre-line">{l.text}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}
