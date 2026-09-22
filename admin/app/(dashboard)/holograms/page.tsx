// admin/app/(dashboard)/holograms/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  AlertCircle,
  X,
  ScanLine,
  Plus,
  Ban,
  Unlock,
  Printer,
  Settings2,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

// ─────────────────────────── انواع پاسخ API ───────────────────────────

interface HologramCodeItem {
  id: string;
  code: string;
  status: "UNASSIGNED" | "ASSIGNED" | "TRANSFER_PENDING" | "REVOKED";
  batch: { id: string; batchNumber: string };
  product: { id: string; name: string } | null;
  variant: { id: string; weightGrams: string } | null;
  weightGrams: string | null;
  purityKarat: "K18" | "K24" | null;
  factorySerialNumber: string | null;
  ownerships: { fullName: string; nationalCode: string; ownershipStartAt: string }[];
  createdAt: string;
}

interface HologramBatchItem {
  id: string;
  batchNumber: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  createdByAdmin: { id: string; fullName: string };
  _count: { codes: number };
}

interface TransferRequestItem {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  transferType: "INITIAL_PURCHASE" | "GIFT_TRANSFER" | "SALE_TRANSFER";
  recipientPhoneNumber: string;
  requestedAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  hologramCode: { id: string; code: string };
  initiatedByUser: { id: string; phone: string } | null;
  initiatedByAdmin: { id: string; fullName: string } | null;
  recipientUser: { id: string; phone: string } | null;
}

interface InquiryLogItem {
  id: string;
  code: string;
  ipAddress: string;
  channel: "PUBLIC_WEB" | "APP_PANEL" | "API_DIRECT";
  result: "VALID_ASSIGNED" | "VALID_UNASSIGNED" | "INVALID_CODE";
  user: { id: string; phone: string } | null;
  createdAt: string;
}

interface RateLimitBlockItem {
  ipAddress: string;
  blockedAt: string;
  blockedUntil: string;
  reason: string | null;
  failedAttemptsCount: number;
  unblockedAt: string | null;
  unblockedByAdmin: { id: string; fullName: string } | null;
}

interface SecuritySettings {
  rateLimitPerMinute: number;
  invalidAttemptsThreshold: number;
  invalidAttemptsWindowMinutes: number;
  blockDurationMinutes: number;
}

interface Paged<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const CODE_STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  UNASSIGNED: { label: "تخصیص‌نیافته", bg: "#f3f4f6", color: "#4b5563" },
  ASSIGNED: { label: "تخصیص‌یافته", bg: "#dcfce7", color: "#16a34a" },
  TRANSFER_PENDING: { label: "در انتظار تأیید انتقال", bg: "#fef3c7", color: "#b45309" },
  REVOKED: { label: "باطل‌شده", bg: "#fee2e2", color: "#dc2626" },
};

const TRANSFER_STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: "در انتظار تأیید گیرنده", bg: "#fef3c7", color: "#b45309" },
  CONFIRMED: { label: "تأییدشده", bg: "#dcfce7", color: "#16a34a" },
  REJECTED: { label: "ردشده", bg: "#fee2e2", color: "#dc2626" },
  EXPIRED: { label: "منقضی‌شده", bg: "#f3f4f6", color: "#6b7280" },
  CANCELLED: { label: "لغوشده", bg: "#f3f4f6", color: "#6b7280" },
};

const RESULT_META: Record<string, { label: string; bg: string; color: string }> = {
  VALID_ASSIGNED: { label: "معتبر - تخصیص‌یافته", bg: "#dcfce7", color: "#16a34a" },
  VALID_UNASSIGNED: { label: "معتبر - تخصیص‌نیافته", bg: "#f3f4f6", color: "#4b5563" },
  INVALID_CODE: { label: "نامعتبر", bg: "#fee2e2", color: "#dc2626" },
};

const TABS = [
  { key: "codes", label: "کدها" },
  { key: "batches", label: "دسته‌ها" },
  { key: "transfers", label: "درخواست‌های انتقال" },
  { key: "logs", label: "لاگ استعلام‌ها" },
  { key: "security", label: "امنیت" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
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

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

// ─────────────────────────── تخصیص کد به سفارش ───────────────────────────

function AssignModal({ code, onClose, onDone }: { code: string; onClose: () => void; onDone: () => void }) {
  const [shopOrderItemId, setShopOrderItemId] = useState("");
  const [factorySerialNumber, setFactorySerialNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!shopOrderItemId.trim()) return setError("شناسه آیتم سفارش را وارد کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/admin/holograms/codes/${code}/assign`, {
        shopOrderItemId: shopOrderItemId.trim(),
        factorySerialNumber: factorySerialNumber.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تخصیص کد"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`تخصیص کد ${code}`} onClose={onClose}>
      {error && <ErrorBox message={error} />}
      <p className="text-[11px] text-gray-400 -mt-2">
        شناسه آیتم سفارش را از صفحه «سفارشات فروشگاه» کپی کنید (زیر هر ردیف کالا).
      </p>
      <input
        placeholder="شناسه آیتم سفارش (shopOrderItemId)"
        value={shopOrderItemId}
        onChange={(e) => setShopOrderItemId(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
        dir="ltr"
      />
      <input
        placeholder="شماره سریال کارخانه (اختیاری)"
        value={factorySerialNumber}
        onChange={(e) => setFactorySerialNumber(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
        dir="ltr"
      />
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "تخصیص کد"}
      </button>
    </Modal>
  );
}

function RevokeModal({ code, onClose, onDone }: { code: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/admin/holograms/codes/${code}/revoke`, { reason: reason.trim() || undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ابطال کد"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`ابطال کد ${code}`} onClose={onClose}>
      {error && <ErrorBox message={error} />}
      <textarea
        placeholder="دلیل ابطال (اختیاری)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm resize-none"
      />
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "#dc2626" }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ابطال کد"}
      </button>
    </Modal>
  );
}

function CodesTab() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) qs.set("status", status);
  if (search.trim()) qs.set("search", search.trim());

  const { data, isLoading, mutate } = useSWR<Paged<HologramCodeItem>>(
    `/api/admin/holograms/codes?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          placeholder="جستجو: کد، سریال کارخانه، نام یا کدملی مالک"
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
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(CODE_STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data?.length ? (
        <p className="text-[12px] text-gray-400 text-center py-10">کدی یافت نشد</p>
      ) : (
        <div className="space-y-2">
          {data.data.map((c) => {
            const meta = CODE_STATUS_META[c.status];
            const owner = c.ownerships[0];
            return (
              <div
                key={c.id}
                className="rounded-2xl p-4"
                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span dir="ltr" className="text-[15px] font-black text-gray-900">
                    {c.code}
                  </span>
                  <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-1">دسته: {c.batch.batchNumber}</p>
                {(c.product || c.variant) && (
                  <p className="text-[12px] text-gray-600 mb-1">
                    {c.product?.name} {c.weightGrams ? `— ${Number(c.weightGrams).toLocaleString("fa-IR")} گرم` : ""}{" "}
                    {c.purityKarat ? `— عیار ${c.purityKarat === "K18" ? "۱۸" : "۲۴"}` : ""}
                  </p>
                )}
                {owner && (
                  <p className="text-[12px] text-gray-600 mb-2">
                    مالک: {owner.fullName} — {owner.nationalCode}
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  {c.status === "UNASSIGNED" && (
                    <>
                      <button
                        onClick={() => setAssignTarget(c.code)}
                        className="px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                        style={{ backgroundColor: "var(--color-emerald)" }}
                      >
                        تخصیص به سفارش
                      </button>
                      <button
                        onClick={() => setRevokeTarget(c.code)}
                        className="flex items-center gap-1 px-4 py-2 rounded-xl text-[12px] font-bold border-2 border-red-100 text-red-600"
                      >
                        <Ban className="w-3.5 h-3.5" /> ابطال
                      </button>
                    </>
                  )}
                  {c.status === "TRANSFER_PENDING" && (
                    <button
                      onClick={() => setRevokeTarget(c.code)}
                      className="flex items-center gap-1 px-4 py-2 rounded-xl text-[12px] font-bold border-2 border-red-100 text-red-600"
                    >
                      <Ban className="w-3.5 h-3.5" /> ابطال
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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

      {assignTarget && (
        <AssignModal code={assignTarget} onClose={() => setAssignTarget(null)} onDone={() => mutate()} />
      )}
      {revokeTarget && (
        <RevokeModal code={revokeTarget} onClose={() => setRevokeTarget(null)} onDone={() => mutate()} />
      )}
    </div>
  );
}

// ─────────────────────────── دسته‌های هولوگرام ───────────────────────────

function CreateBatchModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState("100");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCodes, setCreatedCodes] = useState<string[] | null>(null);

  const submit = async () => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) return setError("تعداد نامعتبر است");
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("/api/admin/holograms/batches", { quantity: q, notes: notes.trim() || undefined });
      setCreatedCodes(res.data.codes as string[]);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ساخت دسته"));
    } finally {
      setLoading(false);
    }
  };

  if (createdCodes) {
    return (
      <Modal title="دسته با موفقیت ساخته شد" onClose={onClose}>
        <p className="text-[12px] text-gray-500">{createdCodes.length.toLocaleString("fa-IR")} کد تولید شد:</p>
        <textarea
          readOnly
          value={createdCodes.join("\n")}
          rows={10}
          dir="ltr"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-xs font-mono"
        />
        <button
          onClick={() => window.print()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Printer className="w-4 h-4" /> چاپ لیست کدها
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="ساخت دسته جدید کد هولوگرام" onClose={onClose}>
      {error && <ErrorBox message={error} />}
      <input
        type="number"
        min={1}
        max={10000}
        placeholder="تعداد"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
        dir="ltr"
      />
      <input
        placeholder="یادداشت (اختیاری)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
      />
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ساخت دسته"}
      </button>
    </Modal>
  );
}

function BatchPrintModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { data, isLoading } = useSWR<{ batchNumber: string; quantity: number; codes: string[] }>(
    `/api/admin/holograms/batches/${batchId}/print`,
    fetcher,
  );

  return (
    <Modal title={data ? `کدهای دسته ${data.batchNumber}` : "در حال بارگذاری..."} onClose={onClose}>
      {isLoading || !data ? (
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      ) : (
        <>
          <textarea
            readOnly
            value={data.codes.join("\n")}
            rows={12}
            dir="ltr"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-xs font-mono"
          />
          <button
            onClick={() => window.print()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Printer className="w-4 h-4" /> چاپ
          </button>
        </>
      )}
    </Modal>
  );
}

function BatchesTab() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [printTarget, setPrintTarget] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<Paged<HologramBatchItem>>(
    `/api/admin/holograms/batches?page=${page}&limit=20`,
    fetcher,
  );

  return (
    <div>
      <button
        onClick={() => setShowCreate(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-black text-white mb-3"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        <Plus className="w-4 h-4" /> دسته جدید
      </button>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data?.length ? (
        <p className="text-[12px] text-gray-400 text-center py-10">دسته‌ای ثبت نشده است</p>
      ) : (
        <div className="space-y-2">
          {data.data.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl p-4 flex items-center justify-between"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <div>
                <p className="font-black text-gray-900 text-[13px]" dir="ltr">
                  {b.batchNumber}
                </p>
                <p className="text-[11px] text-gray-400">
                  {b._count.codes.toLocaleString("fa-IR")} کد — {b.createdByAdmin.fullName} —{" "}
                  {new Date(b.createdAt).toLocaleDateString("fa-IR")}
                </p>
                {b.notes && <p className="text-[11px] text-gray-400">{b.notes}</p>}
              </div>
              <button
                onClick={() => setPrintTarget(b.id)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold border-2 border-gray-200 text-gray-700"
              >
                <Printer className="w-3.5 h-3.5" /> چاپ
              </button>
            </div>
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
        <CreateBatchModal onClose={() => setShowCreate(false)} onDone={() => mutate()} />
      )}
      {printTarget && <BatchPrintModal batchId={printTarget} onClose={() => setPrintTarget(null)} />}
    </div>
  );
}

// ─────────────────────────── درخواست‌های انتقال ───────────────────────────

function TransfersTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) qs.set("status", status);

  const { data, isLoading } = useSWR<Paged<TransferRequestItem>>(
    `/api/admin/holograms/transfer-requests?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm mb-3"
      >
        <option value="">همه وضعیت‌ها</option>
        {Object.entries(TRANSFER_STATUS_META).map(([key, meta]) => (
          <option key={key} value={key}>
            {meta.label}
          </option>
        ))}
      </select>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data?.length ? (
        <p className="text-[12px] text-gray-400 text-center py-10">درخواستی یافت نشد</p>
      ) : (
        <div className="space-y-2">
          {data.data.map((t) => {
            const meta = TRANSFER_STATUS_META[t.status];
            return (
              <div
                key={t.id}
                className="rounded-2xl p-4"
                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span dir="ltr" className="text-[13px] font-black text-gray-900">
                    {t.hologramCode.code}
                  </span>
                  <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500">
                  آغازکننده: {t.initiatedByAdmin ? `ادمین ${t.initiatedByAdmin.fullName}` : t.initiatedByUser?.phone}
                </p>
                <p className="text-[12px] text-gray-500" dir="ltr">
                  گیرنده: {t.recipientPhoneNumber}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  درخواست: {new Date(t.requestedAt).toLocaleDateString("fa-IR")} — مهلت:{" "}
                  {new Date(t.expiresAt).toLocaleDateString("fa-IR")}
                </p>
              </div>
            );
          })}
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
    </div>
  );
}

// ─────────────────────────── لاگ استعلام‌ها ───────────────────────────

function LogsTab() {
  const [ipAddress, setIpAddress] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (ipAddress.trim()) qs.set("ipAddress", ipAddress.trim());
  if (result) qs.set("result", result);

  const { data, isLoading } = useSWR<Paged<InquiryLogItem>>(
    `/api/admin/holograms/inquiry-logs?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          placeholder="فیلتر بر اساس IP"
          value={ipAddress}
          onChange={(e) => {
            setIpAddress(e.target.value);
            setPage(1);
          }}
          dir="ltr"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
        />
        <select
          value={result}
          onChange={(e) => {
            setResult(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
        >
          <option value="">همه نتایج</option>
          {Object.entries(RESULT_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data?.length ? (
        <p className="text-[12px] text-gray-400 text-center py-10">لاگی یافت نشد</p>
      ) : (
        <div className="space-y-1.5">
          {data.data.map((log) => {
            const meta = RESULT_META[log.result];
            return (
              <div
                key={log.id}
                className="rounded-xl p-3 flex items-center justify-between text-[12px]"
                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <div>
                  <span dir="ltr" className="font-bold text-gray-800">
                    {log.code}
                  </span>
                  <span className="text-gray-400 mx-2" dir="ltr">
                    {log.ipAddress}
                  </span>
                  <span className="text-gray-400">{log.channel}</span>
                  {log.user && <span className="text-gray-400 mx-1" dir="ltr">({log.user.phone})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    {new Date(log.createdAt).toLocaleString("fa-IR")}
                  </span>
                  <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
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
    </div>
  );
}

// ─────────────────────────── امنیت ───────────────────────────

function SecuritySettingsForm() {
  const { data, mutate } = useSWR<SecuritySettings>("/api/admin/holograms/security-settings", fetcher);
  const [form, setForm] = useState<SecuritySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = form ?? data;
  if (!current) return <Loader2 className="w-5 h-5 animate-spin text-gray-300" />;

  const set = (patch: Partial<SecuritySettings>) => setForm({ ...current, ...patch });

  const submit = async () => {
    if (!form) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      await axios.put("/api/admin/holograms/security-settings", form);
      await mutate();
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره تنظیمات"));
    } finally {
      setLoading(false);
    }
  };

  const fields: { key: keyof SecuritySettings; label: string }[] = [
    { key: "rateLimitPerMinute", label: "سقف استعلام در دقیقه (به ازای هر IP)" },
    { key: "invalidAttemptsThreshold", label: "آستانه استعلام نامعتبر برای مسدودسازی" },
    { key: "invalidAttemptsWindowMinutes", label: "بازه شمارش استعلام نامعتبر (دقیقه)" },
    { key: "blockDurationMinutes", label: "مدت مسدودیت (دقیقه)" },
  ];

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {error && <ErrorBox message={error} />}
      {saved && <p className="text-[12px] text-emerald-600 font-bold">تنظیمات ذخیره شد</p>}
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-[12px] text-gray-500 mb-1">{f.label}</label>
          <input
            type="number"
            min={1}
            value={current[f.key]}
            onChange={(e) => set({ [f.key]: Number(e.target.value) } as Partial<SecuritySettings>)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
            dir="ltr"
          />
        </div>
      ))}
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ذخیره تنظیمات"}
      </button>
    </div>
  );
}

function SecurityTab() {
  const { data, isLoading, mutate } = useSWR<Paged<RateLimitBlockItem>>(
    "/api/admin/holograms/rate-limit-blocks?page=1&limit=50",
    fetcher,
  );
  const [busyIp, setBusyIp] = useState<string | null>(null);

  const unblock = async (ip: string) => {
    setBusyIp(ip);
    try {
      await axios.post(`/api/admin/holograms/rate-limit-blocks/${encodeURIComponent(ip)}/unblock`);
      mutate();
    } finally {
      setBusyIp(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 font-black text-gray-800 text-[13px] mb-2">
          <Settings2 className="w-4 h-4" /> تنظیمات محدودیت نرخ و مسدودسازی
        </h3>
        <SecuritySettingsForm />
      </div>

      <div>
        <h3 className="font-black text-gray-800 text-[13px] mb-2">IPهای مسدودشده</h3>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        ) : !data?.data?.length ? (
          <p className="text-[12px] text-gray-400">در حال حاضر IP مسدودی وجود ندارد</p>
        ) : (
          <div className="space-y-2">
            {data.data.map((b) => (
              <div
                key={b.ipAddress}
                className="rounded-xl p-3 flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <div>
                  <span dir="ltr" className="font-bold text-gray-800 text-[13px]">
                    {b.ipAddress}
                  </span>
                  <p className="text-[11px] text-gray-400">
                    {b.reason} — تا {new Date(b.blockedUntil).toLocaleString("fa-IR")}
                  </p>
                </div>
                <button
                  onClick={() => unblock(b.ipAddress)}
                  disabled={busyIp === b.ipAddress}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold border-2 border-gray-200 text-gray-700 disabled:opacity-60"
                >
                  {busyIp === b.ipAddress ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" /> رفع مسدودیت
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── صفحه اصلی ───────────────────────────

export default function HologramsPage() {
  const [tab, setTab] = useState<TabKey>("codes");

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <ScanLine className="w-5 h-5 text-gray-700" />
        <h1 className="text-lg font-black text-gray-900">اصالت‌سنجی هولوگرام</h1>
      </div>
      <p className="text-[12px] text-gray-400 mb-4">
        مدیریت کدهای هولوگرام، تخصیص به سفارش، انتقال مالکیت و امنیت استعلام عمومی
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap"
            style={
              tab === t.key
                ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                : { backgroundColor: "var(--color-surface)", color: "#6b7280", border: "1px solid var(--color-border)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "codes" && <CodesTab />}
      {tab === "batches" && <BatchesTab />}
      {tab === "transfers" && <TransfersTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "security" && <SecurityTab />}
    </div>
  );
}
