// admin/app/(dashboard)/bank-accounts/page.tsx
//
// کارت‌های بانکی کاربران: ثبت کارت در اپ فقط با شماره کارت است و مالکیت (تطبیق کارت با کد ملی)
// و شبا خودکار استعلام می‌شود. اگر وب‌سرویس در دسترس نبوده، کارت «در انتظار استعلام» است و
// کارشناس از همین صفحه استعلام مجدد می‌گیرد یا پس از بررسی، دستی تأیید/رد می‌کند.
"use client";
import { Suspense, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, ScanSearch, Search, XCircle } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
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
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type Status = "VERIFIED" | "PENDING_INQUIRY" | "REJECTED";

interface Row {
  id: string;
  userId: string;
  bankName: string;
  cardNumber: string;
  sheba: string | null;
  accountNumber: string | null;
  ownerName: string | null;
  depositStatus: string | null;
  depositStatusLabel: string | null;
  cardOwnerMatched: boolean | null;
  status: Status;
  statusMessage: string | null;
  isDefault: boolean;
  inquiryProvider: string | null;
  inquiryTrackId: string | null;
  lastInquiryAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  user: { id: string; phone: string; fullName: string | null; nationalCode: string | null };
}

interface ListResp {
  data: Row[];
  counts: Partial<Record<Status, number>>;
  page: number;
  totalPages: number;
  total: number;
}

const BANK_ACCOUNT_STATUS: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: "تأیید شده", cls: "bg-green-50 text-green-700" },
  PENDING_INQUIRY: { label: "در انتظار استعلام", cls: "bg-amber-50 text-amber-700" },
  REJECTED: { label: "رد شده", cls: "bg-red-50 text-red-600" },
};

const card = (c: string) => c.replace(/(\d{4})(?=\d)/g, "$1-");
const iban = (s: string) => s.replace(/(.{4})(?=.)/g, "$1 ");

export default function BankAccountsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BankAccountsView />
    </Suspense>
  );
}

function BankAccountsView() {
  const can = usePerm();
  // ورود از صفحه‌ی کاربر با ?userId= → همه‌ی کارت‌های همان کاربر (شناسه به‌جای موبایل در URL)
  const userId = useSearchParams().get("userId") ?? "";
  const [status, setStatus] = useState<"" | Status>(userId ? "" : "PENDING_INQUIRY");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) params.set("status", status);
  if (userId) params.set("userId", userId);
  if (q) params.set("search", q);
  const { data, isLoading, mutate } = useSWR<ListResp>(`/api/admin/bank-accounts?${params}`, fetcher);

  const tabs: { key: "" | Status; label: string }[] = [
    { key: "PENDING_INQUIRY", label: `در انتظار استعلام (${(data?.counts.PENDING_INQUIRY ?? 0).toLocaleString("fa-IR")})` },
    { key: "VERIFIED", label: `تأیید شده (${(data?.counts.VERIFIED ?? 0).toLocaleString("fa-IR")})` },
    { key: "REJECTED", label: `رد شده (${(data?.counts.REJECTED ?? 0).toLocaleString("fa-IR")})` },
    { key: "", label: "همه" },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={CreditCard}
        title="کارت‌های بانکی کاربران"
        subtitle="مالکیت کارت و شبا خودکار استعلام می‌شود؛ کارت‌هایی که هنگام ثبت، وب‌سرویس در دسترس نبوده این‌جا بررسی می‌شوند"
        actions={
          <Link href="/integrations" className="text-[12px] font-bold text-gray-500 hover:text-gray-700">
            تنظیم وب‌سرویس‌ها ←
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={tabs}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
            setPage(1);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="کارت، شبا، موبایل، کد ملی یا نام"
            className={`${inputCls} w-64`}
          />
          <button type="submit" className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-500" aria-label="جستجو">
            <Search className="w-4 h-4" />
          </button>
        </form>
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <Empty text="کارتی با این فیلتر یافت نشد" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>کارت</th>
                <th>بانک / شبا</th>
                <th>صاحب حساب</th>
                <th>وضعیت</th>
                <th>آخرین استعلام</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/users/${r.user.id}`} className="font-bold text-gray-800 hover:underline">
                      {r.user.fullName || "—"}
                    </Link>
                    <div className="text-[10px] text-gray-400" dir="ltr">
                      {r.user.phone} · {r.user.nationalCode ?? "—"}
                    </div>
                  </td>
                  <td dir="ltr" className="font-bold whitespace-nowrap">
                    {card(r.cardNumber)}
                  </td>
                  <td>
                    <div className="font-bold">{r.bankName}</div>
                    <div className="text-[10px] text-gray-400" dir="ltr">
                      {r.sheba ? iban(r.sheba) : "شبا ندارد"}
                    </div>
                  </td>
                  <td>
                    {r.ownerName ?? "—"}
                    {r.depositStatusLabel && (
                      <div className={`text-[10px] ${r.depositStatus === "02" ? "text-green-600" : "text-amber-600"}`}>
                        {r.depositStatusLabel}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge map={BANK_ACCOUNT_STATUS} value={r.status} />
                    {r.status !== "VERIFIED" && r.statusMessage && (
                      <div className="text-[10px] text-gray-400 max-w-56 truncate" title={r.statusMessage}>
                        {r.statusMessage}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-gray-500">{r.lastInquiryAt ? faDateTime(r.lastInquiryAt) : "—"}</td>
                  <td>
                    <button
                      onClick={() => setSelected(r)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      بررسی
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>

      {selected && (
        <ReviewModal
          row={selected}
          canManage={can("bank_account.manage")}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            setSelected((s) => (s ? { ...s, ...updated } : s));
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function ReviewModal({
  row,
  canManage,
  onClose,
  onChanged,
}: {
  row: Row;
  canManage: boolean;
  onClose: () => void;
  onChanged: (updated: Partial<Row>) => void;
}) {
  const inquire = useAction();
  const approve = useAction();
  const reject = useAction();
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [form, setForm] = useState({ sheba: row.sheba ?? "", accountNumber: row.accountNumber ?? "", ownerName: row.ownerName ?? "" });
  const [reason, setReason] = useState("");

  const runInquiry = () =>
    inquire.run(async () => {
      const res = await api.post(`/api/admin/bank-accounts/${row.id}/inquire`);
      onChanged(res.data.account);
      return res;
    });

  const runApprove = () =>
    approve.run(async () => {
      const res = await api.post(`/api/admin/bank-accounts/${row.id}/approve`, {
        sheba: form.sheba.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        ownerName: form.ownerName.trim() || undefined,
      });
      onChanged(res.data.account);
      setMode(null);
      return res;
    });

  const runReject = () =>
    reject.run(async () => {
      const res = await api.post(`/api/admin/bank-accounts/${row.id}/reject`, { reason: reason.trim() });
      onChanged(res.data.account);
      setMode(null);
      return res;
    });

  const fields: [string, React.ReactNode][] = [
    ["کاربر", `${row.user.fullName ?? "—"} (${row.user.phone})`],
    ["کد ملی", row.user.nationalCode ?? "—"],
    ["شماره کارت", <span key="c" dir="ltr">{card(row.cardNumber)}</span>],
    ["بانک", row.bankName],
    ["شبا", row.sheba ? <span key="s" dir="ltr">{iban(row.sheba)}</span> : "—"],
    ["شماره حساب", row.accountNumber ?? "—"],
    ["صاحب حساب", row.ownerName ?? "—"],
    ["وضعیت حساب (بانک)", row.depositStatusLabel ?? "—"],
    [
      "تطبیق کارت با کد ملی",
      row.cardOwnerMatched == null ? "استعلام نشده" : row.cardOwnerMatched ? "✓ متعلق به کاربر" : "✗ متعلق به کاربر نیست",
    ],
    ["Provider / کد پیگیری", `${row.inquiryProvider ?? "—"} / ${row.inquiryTrackId ?? "—"}`],
    ["ثبت", faDateTime(row.createdAt)],
    ["آخرین استعلام", row.lastInquiryAt ? faDateTime(row.lastInquiryAt) : "—"],
  ];

  return (
    <Modal title="بررسی کارت بانکی" onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <Badge map={BANK_ACCOUNT_STATUS} value={row.status} />
        {row.isDefault && <span className="badge bg-yellow-50 text-yellow-700">پیش‌فرض</span>}
      </div>
      {row.statusMessage && row.status !== "VERIFIED" && <Alert kind={row.status === "REJECTED" ? "error" : "warn"} text={row.statusMessage} />}

      <dl className="grid sm:grid-cols-2 gap-2 text-[12px]">
        {fields.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-gray-50">
            <dt className="text-gray-400 font-bold">{k}</dt>
            <dd className="font-bold text-gray-800 truncate">{v}</dd>
          </div>
        ))}
      </dl>

      {[inquire, approve, reject].map((a, i) => (
        <div key={i} className="space-y-2">
          {a.error && <Alert kind="error" text={a.error} />}
          {a.success && <Alert kind="success" text={a.success} />}
        </div>
      ))}

      {canManage ? (
        <>
          {mode === "approve" && (
            <div className="space-y-3 p-4 rounded-2xl border border-green-100 bg-green-50/40">
              <p className="text-[12px] font-bold text-gray-600">
                تأیید دستی فقط پس از اطمینان از تعلق کارت به کد ملی کاربر (مثلاً با مدارک) انجام شود.
              </p>
              <Field label="شماره شبا (الزامی اگر خالی است)">
                <input dir="ltr" className={inputCls} value={form.sheba} onChange={(e) => setForm({ ...form, sheba: e.target.value })} placeholder="IR..." />
              </Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="شماره حساب">
                  <input dir="ltr" className={inputCls} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
                </Field>
                <Field label="صاحب حساب">
                  <input className={inputCls} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                </Field>
              </div>
              <ActionButton onClick={runApprove} busy={approve.busy}>
                ثبت تأیید دستی
              </ActionButton>
            </div>
          )}
          {mode === "reject" && (
            <div className="space-y-3 p-4 rounded-2xl border border-red-100 bg-red-50/40">
              <Field label="دلیل رد (برای کاربر پیامک و نمایش داده می‌شود)">
                <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <ActionButton variant="danger" onClick={runReject} busy={reject.busy} disabled={reason.trim().length < 3}>
                رد کارت
              </ActionButton>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionButton onClick={runInquiry} busy={inquire.busy}>
              <ScanSearch className="w-4 h-4" /> استعلام مجدد (کارت + شبا)
            </ActionButton>
            {row.status !== "VERIFIED" && (
              <ActionButton variant="secondary" onClick={() => setMode(mode === "approve" ? null : "approve")}>
                <CheckCircle2 className="w-4 h-4" /> تأیید دستی
              </ActionButton>
            )}
            {row.status !== "REJECTED" && (
              <ActionButton variant="danger" onClick={() => setMode(mode === "reject" ? null : "reject")}>
                <XCircle className="w-4 h-4" /> رد
              </ActionButton>
            )}
          </div>
        </>
      ) : (
        <Alert kind="info" text="برای استعلام و تأیید/رد کارت، دسترسی «bank_account.manage» لازم است." />
      )}
    </Modal>
  );
}
