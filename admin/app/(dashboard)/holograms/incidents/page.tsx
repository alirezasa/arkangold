// admin/app/(dashboard)/holograms/incidents/page.tsx
//
// گزارش مدیریتی سرقت/مفقودی شمش: آمار، ردپای استعلام شمش‌های گزارش‌شده (چه کسی، از کجا،
// از کدام کانال)، و رسیدگی به گزارش‌ها (تأیید، رد، اعلام بازیابی، ثبت گزارش توسط کارشناس).
"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { AlertCircle, ArrowRight, Loader2, Plus, Siren, X } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

type IncidentType = "THEFT" | "LOSS";
type IncidentStatus = "OPEN" | "CONFIRMED" | "RECOVERED" | "REJECTED" | "CANCELLED";

const TYPE_FA: Record<IncidentType, string> = { THEFT: "سرقت", LOSS: "مفقودی" };
const STATUS_META: Record<IncidentStatus, { label: string; bg: string; color: string }> = {
  OPEN: { label: "در انتظار بررسی", bg: "#fef3c7", color: "#b45309" },
  CONFIRMED: { label: "تأییدشده (فعال)", bg: "#fee2e2", color: "#b91c1c" },
  RECOVERED: { label: "بازیابی‌شده", bg: "#dcfce7", color: "#15803d" },
  REJECTED: { label: "ردشده", bg: "#f3f4f6", color: "#4b5563" },
  CANCELLED: { label: "لغو توسط مالک", bg: "#f3f4f6", color: "#6b7280" },
};
const CHANNEL_FA: Record<string, string> = {
  PUBLIC_WEB: "سایت عمومی",
  APP_PANEL: "پنل کاربر",
  API_DIRECT: "API",
  ADMIN_PANEL: "پنل مدیریت",
  AGENT_PORTAL: "پنل نماینده",
};

interface InquiryLog {
  id: string;
  code: string;
  ipAddress: string;
  userAgent: string | null;
  channel: string;
  createdAt: string;
  user: { id: string; phone: string } | null;
  adminUser: { id: string; fullName: string; agent: { id: string; code: string; name: string } | null } | null;
  incidentReport: { id: string; reportNumber: string; type: IncidentType } | null;
}

interface IncidentItem {
  id: string;
  reportNumber: string;
  type: IncidentType;
  status: IncidentStatus;
  description: string;
  incidentAt: string | null;
  incidentLocation: string | null;
  policeReportNumber: string | null;
  contactPhone: string | null;
  ownerFullName: string | null;
  ownerNationalCode: string | null;
  adminNote: string | null;
  closeReason: string | null;
  reviewedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  hologramCode: {
    id: string;
    code: string;
    status: string;
    weightGrams: string | null;
    purityKarat: "K18" | "K24" | null;
    factorySerialNumber: string | null;
    batch: { batchNumber: string };
    product: { id: string; name: string } | null;
    agent: { id: string; code: string; name: string } | null;
  };
  reportedByUser: { id: string; phone: string } | null;
  reportedByAdmin: { id: string; fullName: string } | null;
  reviewedByAdmin: { id: string; fullName: string } | null;
  _count?: { inquiryLogs: number };
}

interface IncidentDetail extends IncidentItem {
  inquiryLogs: InquiryLog[];
  currentOwner: {
    fullName: string;
    nationalCode: string;
    ownershipStartAt: string;
    ownerUser: { id: string; phone: string };
  } | null;
  history: { id: string; reportNumber: string; type: IncidentType; status: IncidentStatus; createdAt: string }[];
}

interface Summary {
  activeTheft: number;
  activeLoss: number;
  awaitingReview: number;
  confirmed: number;
  recovered: number;
  rejected: number;
  cancelled: number;
  total: number;
  flaggedInquiries30d: number;
  recentFlaggedInquiries: InquiryLog[];
}

interface Paged<T> {
  data: T[];
  page: number;
  total: number;
  totalPages: number;
}

const card = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" };

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">{title}</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function inquirer(log: InquiryLog) {
  if (log.adminUser?.agent) return `نماینده ${log.adminUser.agent.name} (${log.adminUser.agent.code}) — ${log.adminUser.fullName}`;
  if (log.adminUser) return `کارشناس ${log.adminUser.fullName}`;
  if (log.user) return `کاربر ${log.user.phone}`;
  return "مهمان";
}

function InquiryRows({ logs }: { logs: InquiryLog[] }) {
  if (!logs.length) return <p className="text-[12px] text-gray-400">استعلامی ثبت نشده است</p>;
  return (
    <div className="space-y-1.5">
      {logs.map((l) => (
        <div key={l.id} className="rounded-xl px-3 py-2 text-[12px] flex flex-wrap items-center gap-x-3 gap-y-1" style={card}>
          <span className="text-gray-400">{new Date(l.createdAt).toLocaleString("fa-IR")}</span>
          <span className="font-bold text-gray-800" dir="ltr">{l.code}</span>
          <span className="text-gray-600">{CHANNEL_FA[l.channel] ?? l.channel}</span>
          <span className="text-gray-600">{inquirer(l)}</span>
          <span className="text-gray-400" dir="ltr">{l.ipAddress}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── ثبت گزارش توسط کارشناس ───────────────────────────

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<IncidentType>("THEFT");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [police, setPolice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!/^\d{8}$/.test(code.trim())) return setError("کد هولوگرام باید ۸ رقم باشد");
    if (description.trim().length < 10) return setError("شرح ماجرا دست‌کم ۱۰ کاراکتر");
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("/api/admin/holograms/incidents", {
        code: code.trim(),
        type,
        description: description.trim(),
        incidentLocation: location.trim() || undefined,
        policeReportNumber: police.trim() || undefined,
      });
      onDone((res.data as { id: string }).id);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ثبت گزارش"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="ثبت گزارش سرقت/مفقودی توسط کارشناس" onClose={onClose}>
      {error && <ErrorBox message={error} />}
      <p className="text-[11px] text-gray-400 -mt-2">
        برای شمش‌های خزانه، نزد نماینده یا موارد اعلام‌شده تلفنی/حضوری. گزارش کارشناس مستقیماً «تأییدشده» ثبت می‌شود و
        هر انتقال در جریان برای این شمش لغو می‌شود.
      </p>
      <input
        dir="ltr"
        maxLength={8}
        placeholder="کد ۸ رقمی هولوگرام"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm text-center font-black tracking-[0.2em]"
      />
      <div className="grid grid-cols-2 gap-2">
        {(["THEFT", "LOSS"] as IncidentType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`py-2.5 rounded-xl text-[13px] font-black border-2 ${type === t ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-600"}`}
          >
            {TYPE_FA[t]}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        placeholder="شرح ماجرا"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm resize-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="محل وقوع (اختیاری)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
        />
        <input
          placeholder="شماره گزارش کلانتری (اختیاری)"
          value={police}
          onChange={(e) => setPolice(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
        />
      </div>
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "#dc2626" }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ثبت گزارش"}
      </button>
    </Modal>
  );
}

// ─────────────────────────── پرونده‌ی گزارش ───────────────────────────

function DetailModal({
  id,
  canManage,
  onClose,
  onChanged,
}: {
  id: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, isLoading, mutate } = useSWR<IncidentDetail>(`/api/admin/holograms/incidents/${id}`, fetcher);
  const [action, setAction] = useState<"confirm" | "reject" | "recover" | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!action) return;
    if (action !== "confirm" && text.trim().length < 5) return setError("توضیح دست‌کم ۵ کاراکتر لازم است");
    setLoading(true);
    setError(null);
    try {
      await axios.post(
        `/api/admin/holograms/incidents/${id}/${action}`,
        action === "confirm" ? { note: text.trim() || undefined } : { reason: text.trim() },
      );
      setAction(null);
      setText("");
      await mutate();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ثبت تصمیم"));
    } finally {
      setLoading(false);
    }
  };

  const active = data && (data.status === "OPEN" || data.status === "CONFIRMED");

  return (
    <Modal title={data ? `پرونده‌ی گزارش ${data.reportNumber}` : "در حال بارگذاری..."} onClose={onClose}>
      {isLoading || !data ? (
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge inline-flex items-center gap-1" style={{ background: "#fee2e2", color: "#b91c1c" }}>
              <Siren className="w-3 h-3" /> {TYPE_FA[data.type]}
            </span>
            <span className="badge" style={{ background: STATUS_META[data.status].bg, color: STATUS_META[data.status].color }}>
              {STATUS_META[data.status].label}
            </span>
            <span className="text-[11px] text-gray-400">ثبت: {new Date(data.createdAt).toLocaleString("fa-IR")}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
            <div className="rounded-xl p-3 space-y-1" style={card}>
              <p className="font-black text-gray-800 mb-1">شمش</p>
              <p>
                کد: <b dir="ltr">{data.hologramCode.code}</b> — دسته {data.hologramCode.batch.batchNumber}
              </p>
              {data.hologramCode.product && <p>محصول: {data.hologramCode.product.name}</p>}
              {data.hologramCode.weightGrams && (
                <p>
                  وزن: {Number(data.hologramCode.weightGrams).toLocaleString("fa-IR")} گرم
                  {data.hologramCode.purityKarat ? ` — عیار ${data.hologramCode.purityKarat === "K18" ? "۱۸" : "۲۴"}` : ""}
                </p>
              )}
              {data.hologramCode.factorySerialNumber && <p>سریال کارخانه: {data.hologramCode.factorySerialNumber}</p>}
              {data.hologramCode.agent && (
                <p>
                  نزد نماینده:{" "}
                  <Link href={`/agents/${data.hologramCode.agent.id}`} className="underline font-bold">
                    {data.hologramCode.agent.name}
                  </Link>
                </p>
              )}
            </div>
            <div className="rounded-xl p-3 space-y-1" style={card}>
              <p className="font-black text-gray-800 mb-1">گزارش‌دهنده و مالک</p>
              <p>
                گزارش‌دهنده:{" "}
                {data.reportedByUser ? (
                  <Link href={`/users/${data.reportedByUser.id}`} className="underline" dir="ltr">
                    {data.reportedByUser.phone}
                  </Link>
                ) : data.reportedByAdmin ? (
                  `کارشناس ${data.reportedByAdmin.fullName}`
                ) : (
                  "—"
                )}
              </p>
              {data.ownerFullName && (
                <p>
                  مالک هنگام گزارش: {data.ownerFullName} — <bdi dir="ltr">{data.ownerNationalCode}</bdi>
                </p>
              )}
              {data.currentOwner && (
                <p>
                  مالک فعلی: {data.currentOwner.fullName} (<bdi dir="ltr">{data.currentOwner.ownerUser.phone}</bdi>)
                </p>
              )}
              {data.contactPhone && <p>تلفن تماس: <bdi dir="ltr">{data.contactPhone}</bdi></p>}
            </div>
          </div>

          <div className="rounded-xl p-3 text-[12px] space-y-1" style={card}>
            <p className="font-black text-gray-800">شرح ماجرا</p>
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{data.description}</p>
            {data.incidentAt && <p className="text-gray-500">تاریخ وقوع: {new Date(data.incidentAt).toLocaleDateString("fa-IR")}</p>}
            {data.incidentLocation && <p className="text-gray-500">محل: {data.incidentLocation}</p>}
            {data.policeReportNumber && <p className="text-gray-500">گزارش کلانتری: {data.policeReportNumber}</p>}
            {data.reviewedByAdmin && (
              <p className="text-gray-500">
                آخرین تصمیم: {data.reviewedByAdmin.fullName}
                {data.reviewedAt ? ` — ${new Date(data.reviewedAt).toLocaleString("fa-IR")}` : ""}
              </p>
            )}
            {data.adminNote && <p className="text-gray-500">یادداشت مدیریت: {data.adminNote}</p>}
            {data.closeReason && <p className="text-gray-500">علت بستن: {data.closeReason}</p>}
          </div>

          {canManage && active && (
            <div className="rounded-xl p-3 space-y-2" style={card}>
              <div className="flex flex-wrap gap-2">
                {data.status === "OPEN" && (
                  <button
                    onClick={() => setAction("confirm")}
                    className="px-4 py-2 rounded-xl text-[12px] font-black text-white"
                    style={{ backgroundColor: "#b91c1c" }}
                  >
                    تأیید گزارش
                  </button>
                )}
                <button
                  onClick={() => setAction("recover")}
                  className="px-4 py-2 rounded-xl text-[12px] font-black text-white"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  شمش بازیابی شد
                </button>
                <button
                  onClick={() => setAction("reject")}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold border-2 border-gray-200 text-gray-700"
                >
                  رد گزارش
                </button>
              </div>
              {action && (
                <div className="space-y-2">
                  {error && <ErrorBox message={error} />}
                  <textarea
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      action === "confirm"
                        ? "یادداشت (اختیاری)"
                        : action === "recover"
                          ? "شرح بازیابی (مثلاً تحویل به مالک در تاریخ ...)"
                          : "دلیل رد گزارش"
                    }
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAction(null);
                        setError(null);
                      }}
                      className="flex-1 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600"
                    >
                      انصراف
                    </button>
                    <button
                      onClick={run}
                      disabled={loading}
                      className="flex-[2] py-2 rounded-xl text-[12px] font-black text-white disabled:opacity-60"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "ثبت تصمیم"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[13px] font-black text-gray-800 mb-2">
              استعلام‌های این شمش پس از ثبت گزارش ({data.inquiryLogs.length.toLocaleString("fa-IR")})
            </p>
            <InquiryRows logs={data.inquiryLogs} />
          </div>

          {!!data.history.length && (
            <div className="text-[12px]">
              <p className="font-black text-gray-800 mb-1">سوابق دیگر این شمش</p>
              {data.history.map((h) => (
                <p key={h.id} className="text-gray-500">
                  <span dir="ltr">{h.reportNumber}</span> — {TYPE_FA[h.type]} — {STATUS_META[h.status].label} —{" "}
                  {new Date(h.createdAt).toLocaleDateString("fa-IR")}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────── صفحه ───────────────────────────

export default function HologramIncidentsPage() {
  return (
    <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-gray-300 mx-auto mt-10" />}>
      <IncidentsView />
    </Suspense>
  );
}

function IncidentsView() {
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useAdminMe();
  const canManage = !!me?.permissions.includes("hologram.incident.manage");

  const [status, setStatus] = useState<string>("ACTIVE");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const selectedId = params.get("id");

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (status === "ACTIVE") qs.set("activeOnly", "true");
  else if (status) qs.set("status", status);
  if (type) qs.set("type", type);
  if (search.trim()) qs.set("search", search.trim());

  const { data: summary, mutate: mutateSummary } = useSWR<Summary>("/api/admin/holograms/incidents/summary", fetcher);
  const { data, isLoading, mutate } = useSWR<Paged<IncidentItem>>(
    `/api/admin/holograms/incidents?${qs.toString()}`,
    fetcher,
  );

  const select = (id: string | null) => router.replace(id ? `/holograms/incidents?id=${id}` : "/holograms/incidents");
  const refresh = () => {
    mutate();
    mutateSummary();
  };

  const stats: { label: string; value: number | undefined; tone: string }[] = [
    { label: "سرقت فعال", value: summary?.activeTheft, tone: "#b91c1c" },
    { label: "مفقودی فعال", value: summary?.activeLoss, tone: "#c2410c" },
    { label: "در انتظار بررسی", value: summary?.awaitingReview, tone: "#b45309" },
    { label: "بازیابی‌شده", value: summary?.recovered, tone: "#15803d" },
    { label: "استعلام شمش گزارش‌شده (۳۰ روز)", value: summary?.flaggedInquiries30d, tone: "#1d4ed8" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link href="/holograms" className="text-gray-400 hover:text-gray-700">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <Siren className="w-5 h-5 text-red-600" />
        <h1 className="text-lg font-black text-gray-900">گزارش‌های سرقت و مفقودی شمش</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="mr-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-black text-white"
            style={{ backgroundColor: "#dc2626" }}
          >
            <Plus className="w-4 h-4" /> ثبت گزارش
          </button>
        )}
      </div>
      <p className="text-[12px] text-gray-400 mb-4">
        شمش گزارش‌شده در همه‌ی استعلام‌ها (سایت، پنل کاربر، پنل نمایندگان و مدیریت) با هشدار نمایش داده می‌شود و انتقال،
        تخصیص و فروش آن تا بسته‌شدن گزارش مسدود است.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {stats.map((st) => (
          <div key={st.label} className="rounded-2xl p-3" style={card}>
            <p className="text-[11px] text-gray-500">{st.label}</p>
            <p className="text-[20px] font-black" style={{ color: st.tone }}>
              {st.value === undefined ? "…" : st.value.toLocaleString("fa-IR")}
            </p>
          </div>
        ))}
      </div>

      {!!summary?.recentFlaggedInquiries.length && (
        <div className="mb-5">
          <h3 className="text-[13px] font-black text-gray-800 mb-2">آخرین استعلام‌های شمش‌های گزارش‌شده</h3>
          <InquiryRows logs={summary.recentFlaggedInquiries} />
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          placeholder="جستجو: کد شمش، شماره گزارش، نام/کدملی مالک، موبایل"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
        >
          <option value="ACTIVE">فقط فعال</option>
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
        >
          <option value="">سرقت و مفقودی</option>
          <option value="THEFT">سرقت</option>
          <option value="LOSS">مفقودی</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data?.length ? (
        <p className="text-[12px] text-gray-400 text-center py-10">گزارشی یافت نشد</p>
      ) : (
        <div className="space-y-2">
          {data.data.map((r) => (
            <button key={r.id} onClick={() => select(r.id)} className="w-full text-right rounded-2xl p-4" style={card}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-2 font-black text-gray-900 text-[14px]">
                  <Siren className="w-4 h-4 text-red-600" />
                  {TYPE_FA[r.type]} — <bdi dir="ltr">{r.hologramCode.code}</bdi>
                </span>
                <span className="badge" style={{ background: STATUS_META[r.status].bg, color: STATUS_META[r.status].color }}>
                  {STATUS_META[r.status].label}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                <bdi dir="ltr">{r.reportNumber}</bdi> — {new Date(r.createdAt).toLocaleString("fa-IR")} —{" "}
                {r.reportedByUser ? `مالک ${r.reportedByUser.phone}` : r.reportedByAdmin ? `کارشناس ${r.reportedByAdmin.fullName}` : ""}
              </p>
              {r.ownerFullName && <p className="text-[12px] text-gray-600 mt-1">مالک: {r.ownerFullName}</p>}
              <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">{r.description}</p>
              {!!r._count?.inquiryLogs && (
                <p className="text-[11px] font-bold text-blue-700 mt-1">
                  {r._count.inquiryLogs.toLocaleString("fa-IR")} استعلام پس از گزارش
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از {data.totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onDone={(id) => {
            setShowCreate(false);
            refresh();
            select(id);
          }}
        />
      )}
      {selectedId && (
        <DetailModal id={selectedId} canManage={canManage} onClose={() => select(null)} onChanged={refresh} />
      )}
    </div>
  );
}
