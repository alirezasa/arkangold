// admin/app/(dashboard)/buyback/page.tsx
//
// بازخرید شمش از کاربران (فروش شمش آرکان گلد توسط مالک به آرکان گلد):
// پذیرش و نوبت تحویل ← دریافت شمش ← اصالت‌سنجی (چک‌لیست، وزن، عیار) ← اعلام قیمت نهایی ←
// پذیرش کاربر ← تأیید نهایی مالی ← واریز به حساب پیش‌فرض کاربر (سند خودکار و ورود شمش به خزانه)
// مسیرهای فرعی: رد پیش از تحویل، عودت شمش پس از دریافت (اصالت‌سنجی ناموفق / انصراف کاربر).
"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  PackageCheck,
  RotateCcw,
  ScanLine,
  Search,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import JalaliDateInput from "@/app/components/JalaliDateInput";
import { todayIsoLocal } from "@/app/utils/jalali";
import {
  AccountSelect,
  ActionButton,
  Alert,
  Badge,
  Empty,
  Field,
  Kpi,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  toman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type BStatus =
  | "SUBMITTED"
  | "AWAITING_DELIVERY"
  | "RECEIVED"
  | "INSPECTION_PASSED"
  | "OFFERED"
  | "ACCEPTED"
  | "APPROVED"
  | "PAID"
  | "RETURN_PENDING"
  | "RETURNED"
  | "REJECTED"
  | "CANCELLED";

const B_STATUS: Record<BStatus, { label: string; cls: string }> = {
  SUBMITTED: { label: "درخواست جدید", cls: "bg-sky-50 text-sky-700" },
  AWAITING_DELIVERY: { label: "منتظر تحویل شمش", cls: "bg-amber-50 text-amber-700" },
  RECEIVED: { label: "دریافت‌شده — اصالت‌سنجی", cls: "bg-indigo-50 text-indigo-700" },
  INSPECTION_PASSED: { label: "اصالت تأیید — اعلام قیمت", cls: "bg-violet-50 text-violet-700" },
  OFFERED: { label: "منتظر پاسخ کاربر", cls: "bg-yellow-50 text-yellow-700" },
  ACCEPTED: { label: "منتظر تأیید نهایی", cls: "bg-teal-50 text-teal-700" },
  APPROVED: { label: "صف واریز", cls: "bg-blue-50 text-blue-700" },
  PAID: { label: "واریزشده", cls: "bg-green-50 text-green-700" },
  RETURN_PENDING: { label: "منتظر عودت شمش", cls: "bg-orange-50 text-orange-700" },
  RETURNED: { label: "عودت‌شده", cls: "bg-gray-100 text-gray-600" },
  REJECTED: { label: "ردشده", cls: "bg-red-50 text-red-600" },
  CANCELLED: { label: "لغو کاربر", cls: "bg-gray-100 text-gray-500" },
};

const TABS: { key: string; label: string }[] = [
  { key: "ACTION", label: "نیازمند اقدام" },
  { key: "SUBMITTED", label: "جدید" },
  { key: "AWAITING_DELIVERY", label: "منتظر تحویل" },
  { key: "RECEIVED", label: "اصالت‌سنجی" },
  { key: "INSPECTION_PASSED", label: "اعلام قیمت" },
  { key: "OFFERED", label: "منتظر کاربر" },
  { key: "ACCEPTED", label: "تأیید نهایی" },
  { key: "APPROVED", label: "صف واریز" },
  { key: "RETURN_PENDING", label: "عودت" },
  { key: "PAID", label: "واریزشده" },
  { key: "", label: "همه" },
];

const PAYOUT_FA: Record<string, string> = {
  PAYA: "پایا",
  SATNA: "ساتنا",
  POL: "پل",
  CARD_TO_CARD: "کارت به کارت",
  INTERNAL: "انتقال داخلی بانک",
};

const CHECKLIST: { key: keyof Checklist; label: string }[] = [
  { key: "hologramIntact", label: "هولوگرام سالم و بدون آثار دستکاری است" },
  { key: "serialMatches", label: "کد هولوگرام و سریال کارخانه با سامانه مطابقت دارد" },
  { key: "packagingIntact", label: "بسته‌بندی / کارت اصالت سالم است" },
  { key: "surfaceIntact", label: "ظاهر شمش بدون خراش عمیق، فرورفتگی یا تغییر شکل است" },
  { key: "purityTestPassed", label: "آزمون عیار (XRF / محک) قابل قبول است" },
];

interface Checklist {
  hologramIntact: boolean;
  serialMatches: boolean;
  packagingIntact: boolean;
  surfaceIntact: boolean;
  purityTestPassed: boolean;
  purityTestMethod?: string;
}

interface Row {
  id: string;
  requestNumber: string;
  status: BStatus;
  ownerFullName: string;
  phone: string;
  hologramCode: string;
  productTitle: string | null;
  weightGrams: string;
  purityKarat: string | null;
  deliveryMethod: string;
  estimatedPriceRial: string;
  offerNetRial: string | null;
  appointmentAt: string | null;
  createdAt: string;
}

interface Summary {
  counts: Record<BStatus, number>;
  open: number;
  needsAction: number;
  paid: { count: number; totalRial: string; totalGrams: string };
}

interface Price {
  pricePerGramRial: string;
  weightGrams: string;
  grossRial: string;
  deductionPercent: string;
  deductionRial: string;
  feeRial: string;
  netRial: string;
  priceBasis: "FINENESS" | "KARAT" | "MANUAL";
}

interface Detail {
  id: string;
  requestNumber: string;
  status: BStatus;
  createdAt: string;
  user: { id: string; phone: string; status: string; fullName: string | null; nationalCode: string | null; identityStatus: string | null };
  owner: { fullName: string; nationalCode: string };
  bar: {
    hologramCodeId: string;
    code: string;
    codeStatus: string;
    productTitle: string | null;
    weightGrams: string;
    purityKarat: string | null;
    factorySerialNumber: string | null;
    batchNumber: string;
  };
  activeIncident: { reportNumber: string; type: string; typeLabel: string } | null;
  request: { deliveryMethod: string; deliveryMethodLabel: string; userNote: string | null; estimatedPriceRial: string };
  destination: {
    bankName?: string;
    cardNumber?: string;
    accountNumber?: string;
    sheba?: string | null;
    ownerName?: string | null;
    currentStatus: string;
    isDefault: boolean;
  };
  review: { by: string | null; at: string | null; appointmentAt: string | null; appointmentNote: string | null };
  receipt: { by: string | null; at: string | null; note: string | null };
  inspection: {
    by: string | null;
    at: string | null;
    passed: boolean | null;
    checklist: Checklist | null;
    measuredWeightGrams: string | null;
    measuredFineness: string | null;
    note: string | null;
  };
  offer: {
    by: string | null;
    at: string | null;
    expiresAt: string | null;
    pricePerGramRial: string | null;
    grossRial: string | null;
    deductionRial: string | null;
    feeRial: string | null;
    netRial: string | null;
    note: string | null;
    acceptedAt: string | null;
  };
  approval: { by: string | null; at: string | null; byId: string | null };
  payment: {
    by: string | null;
    at: string | null;
    bankReference: string | null;
    payoutMethod: string | null;
    sourceAccountCode: string | null;
    journalEntryId: string | null;
    requiresDualControl: boolean;
  };
  closing: {
    rejectionReason: string | null;
    cancelledAt: string | null;
    returnReason: string | null;
    returnedAt: string | null;
    returnedBy: string | null;
    returnNote: string | null;
  };
  timeline: { id: string; toLabel: string; actor: string; note: string | null; at: string }[];
}

const karat = (k: string | null) => (k === "K18" ? "۱۸" : k === "K24" ? "۲۴" : "—");

export default function BuybackPage() {
  const [status, setStatus] = useState("ACTION");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (status) qs.set("status", status);
  if (search) qs.set("q", search);
  const { data, isLoading, mutate } = useSWR<{ data: Row[]; page: number; totalPages: number; total: number }>(
    `/api/admin/buyback?${qs.toString()}`,
    fetcher,
  );
  const { data: summary, mutate: mutateSummary } = useSWR<Summary>("/api/admin/buyback/summary", fetcher);
  const rows = data?.data ?? [];

  const refresh = () => {
    void mutate();
    void mutateSummary();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={HandCoins}
        title="بازخرید شمش از کاربران"
        subtitle="مالک شمش آرکان گلد درخواست فروش می‌دهد ← پذیرش و نوبت تحویل ← دریافت شمش ← اصالت‌سنجی ← اعلام قیمت نهایی ← پذیرش کاربر ← تأیید نهایی ← واریز به حساب پیش‌فرض کاربر (سند حسابداری خودکار و ورود شمش به خزانه)."
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi title="نیازمند اقدام" value={summary.needsAction.toLocaleString("fa-IR")} icon={ClipboardCheck} color="#b45309" />
          <Kpi title="درخواست‌های باز" value={summary.open.toLocaleString("fa-IR")} icon={ScanLine} />
          <Kpi title="منتظر پاسخ کاربر" value={(summary.counts.OFFERED ?? 0).toLocaleString("fa-IR")} icon={Send} color="#a16207" />
          <Kpi
            title="بازخرید واریزشده"
            value={`${toman(summary.paid.totalRial)} ت`}
            hint={`${summary.paid.count.toLocaleString("fa-IR")} شمش — ${grams(summary.paid.totalGrams)} گرم`}
            icon={Banknote}
            color="#15803d"
          />
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const count =
            t.key === "ACTION" ? summary?.needsAction : t.key ? summary?.counts[t.key as BStatus] : undefined;
          return (
            <button
              key={t.key || "all"}
              type="button"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-[12px] font-bold ${status === t.key ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600"}`}
              style={status === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
            >
              {t.label}
              {count ? ` (${count.toLocaleString("fa-IR")})` : ""}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <form
          className="mb-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
            setPage(1);
          }}
        >
          <label className="text-[12px] font-bold text-gray-600">
            جستجو
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="شماره درخواست، نام، کد ملی، موبایل، کد هولوگرام"
              className="mt-1 block w-72 max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="rounded-xl border border-gray-200 bg-white px-3 py-2" aria-label="جستجو">
            <Search className="h-4 w-4" />
          </button>
        </form>

        {isLoading || !data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="درخواستی یافت نشد" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>شماره</th>
                <th>مالک</th>
                <th>شمش</th>
                <th>برآورد / قیمت نهایی (تومان)</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td dir="ltr" className="whitespace-nowrap">{r.requestNumber}</td>
                  <td>
                    <p className="font-bold">{r.ownerFullName}</p>
                    <p className="text-[10px] text-gray-400" dir="ltr">{r.phone}</p>
                  </td>
                  <td>
                    <p>{r.productTitle ?? "شمش"} — {grams(r.weightGrams)} گرم، عیار {karat(r.purityKarat)}</p>
                    <p className="font-mono text-[10px] text-gray-400" dir="ltr">{r.hologramCode}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.offerNetRial ? <b>{toman(r.offerNetRial)}</b> : <span className="text-gray-500">≈ {toman(r.estimatedPriceRial)}</span>}
                  </td>
                  <td>
                    <Badge map={B_STATUS} value={r.status} />
                    {r.status === "AWAITING_DELIVERY" && r.appointmentAt && (
                      <p className="mt-0.5 text-[10px] text-gray-400">نوبت: {faDateTime(r.appointmentAt)}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[11px]">{faDateTime(r.createdAt)}</td>
                  <td>
                    <button type="button" onClick={() => setOpenId(r.id)} className="text-[12px] font-bold text-emerald-700">
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

      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}

// ═══════════════════════════ جزئیات و اقدامات ═══════════════════════════

type Mode = "none" | "accept" | "reject" | "receive" | "inspect" | "offer" | "approve" | "pay" | "return" | "returned";

function DetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: d, mutate } = useSWR<Detail>(`/api/admin/buyback/${id}`, fetcher);
  const can = usePerm();
  const act = useAction();
  const [mode, setMode] = useState<Mode>("none");

  const done = () => {
    void mutate();
    onChanged();
    setMode("none");
  };
  const post = (action: string, body: unknown, confirmText?: string) =>
    act.run(() => api.post(`/api/admin/buyback/${id}/${action}`, body), confirmText).then((ok) => ok && done());

  return (
    <Modal title={d ? `بازخرید ${d.requestNumber}` : "بازخرید شمش"} onClose={onClose} wide>
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge map={B_STATUS} value={d.status} />
            <span className="text-gray-500">ثبت: {faDateTime(d.createdAt)}</span>
          </div>
          {d.activeIncident && (
            <Alert
              kind="error"
              text={`برای این شمش گزارش «${d.activeIncident.typeLabel}» (${d.activeIncident.reportNumber}) فعال است؛ تا بسته‌شدن گزارش واریز مجاز نیست.`}
            />
          )}
          {act.error && <Alert kind="error" text={act.error} />}
          {act.success && <Alert kind="success" text={act.success} />}

          <div className="grid gap-3 md:grid-cols-3">
            <Box title="شمش">
              <p className="font-bold">{d.bar.productTitle ?? "شمش طلا"}</p>
              <p className="text-[12px] text-gray-600">
                {grams(d.bar.weightGrams)} گرم — عیار {karat(d.bar.purityKarat)}
              </p>
              <p className="text-[12px] text-gray-500">
                کد <span dir="ltr" className="font-mono font-bold">{d.bar.code}</span> — دسته {d.bar.batchNumber}
              </p>
              {d.bar.factorySerialNumber && (
                <p className="text-[12px] text-gray-500">
                  سریال کارخانه: <span dir="ltr">{d.bar.factorySerialNumber}</span>
                </p>
              )}
            </Box>
            <Box title="مالک / کاربر">
              <p className="font-bold">{d.owner.fullName}</p>
              <p className="text-[12px] text-gray-500">کد ملی مالک: {d.owner.nationalCode}</p>
              <p className="text-[12px] text-gray-500">
                <span dir="ltr">{d.user.phone}</span> — احراز هویت:{" "}
                {d.user.identityStatus === "VERIFIED" ? "تأییدشده" : (d.user.identityStatus ?? "—")}
              </p>
              <Link href={`/users/${d.user.id}`} className="text-[11px] font-bold text-emerald-700">
                پرونده کاربر ←
              </Link>
            </Box>
            <Box title="حساب مقصد واریز">
              <p className="font-bold">{d.destination.bankName ?? "—"}</p>
              <p className="text-[12px] text-gray-600" dir="ltr">{d.destination.sheba ?? d.destination.cardNumber}</p>
              <p className="text-[12px] text-gray-500">صاحب حساب: {d.destination.ownerName ?? "—"}</p>
              <p className={`text-[11px] font-bold ${d.destination.currentStatus === "VERIFIED" ? "text-green-700" : "text-red-600"}`}>
                {d.destination.currentStatus === "VERIFIED" ? "تأییدشده" : "تأییدنشده"}
                {d.destination.isDefault ? " — حساب پیش‌فرض" : " — دیگر پیش‌فرض نیست"}
              </p>
            </Box>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Box title="درخواست کاربر">
              <p className="text-[12px]">نحوه‌ی تحویل: {d.request.deliveryMethodLabel}</p>
              <p className="text-[12px]">برآورد هنگام ثبت: {toman(d.request.estimatedPriceRial)} تومان</p>
              {d.request.userNote && <p className="text-[12px] text-gray-600">توضیح کاربر: {d.request.userNote}</p>}
              {d.review.at && (
                <p className="text-[12px] text-gray-500">
                  پذیرش: {d.review.by} — {faDateTime(d.review.at)}
                  {d.review.appointmentAt ? ` — نوبت ${faDateTime(d.review.appointmentAt)}` : ""}
                  {d.review.appointmentNote ? ` — ${d.review.appointmentNote}` : ""}
                </p>
              )}
              {d.receipt.at && (
                <p className="text-[12px] text-gray-500">
                  دریافت شمش: {d.receipt.by} — {faDateTime(d.receipt.at)}
                  {d.receipt.note ? ` — ${d.receipt.note}` : ""}
                </p>
              )}
            </Box>
            <Box title="اصالت‌سنجی">
              {d.inspection.at ? (
                <>
                  <p className={`text-[12px] font-bold ${d.inspection.passed ? "text-green-700" : "text-red-600"}`}>
                    {d.inspection.passed ? "✓ اصالت تأیید شد" : "✕ اصالت‌سنجی ناموفق"} — {d.inspection.by} — {faDateTime(d.inspection.at)}
                  </p>
                  {d.inspection.measuredWeightGrams && (
                    <p className="text-[12px]">
                      وزن اندازه‌گیری‌شده: {grams(d.inspection.measuredWeightGrams)} گرم
                      {d.inspection.measuredFineness ? ` — عیار ${Number(d.inspection.measuredFineness).toLocaleString("fa-IR")}` : ""}
                    </p>
                  )}
                  {d.inspection.checklist && (
                    <ul className="text-[11px] text-gray-600">
                      {CHECKLIST.map((c) => (
                        <li key={c.key}>
                          {d.inspection.checklist?.[c.key] ? "✓" : "✕"} {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.inspection.note && <p className="text-[12px] text-gray-600">{d.inspection.note}</p>}
                </>
              ) : (
                <p className="text-[12px] text-gray-400">هنوز انجام نشده</p>
              )}
            </Box>
          </div>

          {d.offer.netRial && (
            <Box title="قیمت نهایی">
              <div className="grid gap-1 text-[12px] md:grid-cols-2">
                <p>قیمت هر گرم: {toman(d.offer.pricePerGramRial)} تومان</p>
                <p>ارزش شمش: {toman(d.offer.grossRial)} تومان</p>
                <p>کسر بازخرید: {toman(d.offer.deductionRial)} تومان</p>
                <p>هزینه‌ی کارشناسی: {toman(d.offer.feeRial)} تومان</p>
              </div>
              <p className="text-[16px] font-black">مبلغ قابل واریز: {toman(d.offer.netRial)} تومان</p>
              <p className="text-[11px] text-gray-500">
                اعلام: {d.offer.by} — {faDateTime(d.offer.at)} — مهلت پاسخ کاربر تا {faDateTime(d.offer.expiresAt)}
                {d.offer.acceptedAt ? ` — پذیرش کاربر: ${faDateTime(d.offer.acceptedAt)}` : ""}
              </p>
              {d.approval.at && <p className="text-[11px] text-gray-500">تأیید نهایی: {d.approval.by} — {faDateTime(d.approval.at)}</p>}
              {d.payment.at && (
                <p className="text-[12px] text-green-700">
                  واریز: {faDateTime(d.payment.at)} — {PAYOUT_FA[d.payment.payoutMethod ?? ""] ?? d.payment.payoutMethod} — پیگیری{" "}
                  <span dir="ltr" className="font-bold">{d.payment.bankReference}</span> — از حساب {d.payment.sourceAccountCode} — {d.payment.by}{" "}
                  <Link href="/accounting/journal" className="font-bold text-emerald-700">دفتر روزنامه</Link>
                </p>
              )}
            </Box>
          )}

          {(d.closing.rejectionReason || d.closing.returnReason || d.closing.cancelledAt) && (
            <Box title="رد / لغو / عودت">
              {d.closing.cancelledAt && <p className="text-[12px]">لغو توسط کاربر: {faDateTime(d.closing.cancelledAt)}</p>}
              {d.closing.rejectionReason && <p className="text-[12px] text-red-600">دلیل: {d.closing.rejectionReason}</p>}
              {d.closing.returnReason && <p className="text-[12px] text-orange-700">دلیل عودت: {d.closing.returnReason}</p>}
              {d.closing.returnedAt && (
                <p className="text-[12px]">
                  عودت: {d.closing.returnedBy} — {faDateTime(d.closing.returnedAt)}
                  {d.closing.returnNote ? ` — ${d.closing.returnNote}` : ""}
                </p>
              )}
            </Box>
          )}

          <Box title="تاریخچه">
            <ol className="space-y-1 text-[12px]">
              {d.timeline.map((t) => (
                <li key={t.id}>
                  <b>{t.toLabel}</b> — {t.actor} — {faDateTime(t.at)}
                  {t.note ? <span className="text-gray-500"> — {t.note}</span> : null}
                </li>
              ))}
            </ol>
          </Box>

          {/* ── اقدامات ── */}
          {mode === "none" && (
            <div className="flex flex-wrap gap-2">
              {(d.status === "SUBMITTED" || d.status === "AWAITING_DELIVERY") && can("buyback.process") && (
                <>
                  <ActionButton onClick={() => setMode("accept")}>
                    <Send className="h-4 w-4" /> {d.status === "SUBMITTED" ? "پذیرش و تعیین نوبت تحویل" : "ویرایش نوبت تحویل"}
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => setMode("receive")}>
                    <PackageCheck className="h-4 w-4" /> ثبت دریافت شمش
                  </ActionButton>
                  <ActionButton variant="danger" onClick={() => setMode("reject")}>
                    <XCircle className="h-4 w-4" /> رد درخواست
                  </ActionButton>
                </>
              )}
              {(d.status === "RECEIVED" || d.status === "INSPECTION_PASSED") && can("buyback.process") && (
                <ActionButton variant={d.status === "RECEIVED" ? "primary" : "secondary"} onClick={() => setMode("inspect")}>
                  <ScanLine className="h-4 w-4" /> {d.status === "RECEIVED" ? "ثبت نتیجه‌ی اصالت‌سنجی" : "اصلاح نتیجه‌ی اصالت‌سنجی"}
                </ActionButton>
              )}
              {(d.status === "INSPECTION_PASSED" || d.status === "OFFERED") && can("buyback.process") && (
                <ActionButton variant={d.status === "INSPECTION_PASSED" ? "primary" : "secondary"} onClick={() => setMode("offer")}>
                  <HandCoins className="h-4 w-4" /> {d.status === "OFFERED" ? "اعلام قیمت جدید" : "اعلام قیمت نهایی"}
                </ActionButton>
              )}
              {d.status === "ACCEPTED" && can("buyback.approve") && (
                <ActionButton onClick={() => setMode("approve")}>
                  <CheckCircle2 className="h-4 w-4" /> تأیید نهایی و انتقال به صف واریز
                </ActionButton>
              )}
              {d.status === "APPROVED" && can("buyback.pay") && (
                <ActionButton onClick={() => setMode("pay")}>
                  <Banknote className="h-4 w-4" /> ثبت واریز به حساب کاربر
                </ActionButton>
              )}
              {["RECEIVED", "INSPECTION_PASSED", "OFFERED", "ACCEPTED", "APPROVED"].includes(d.status) && can("buyback.process") && (
                <ActionButton variant="danger" onClick={() => setMode("return")}>
                  <Undo2 className="h-4 w-4" /> توقف و عودت شمش
                </ActionButton>
              )}
              {d.status === "RETURN_PENDING" && can("buyback.process") && (
                <ActionButton onClick={() => setMode("returned")}>
                  <RotateCcw className="h-4 w-4" /> ثبت تحویل شمش به مالک
                </ActionButton>
              )}
            </div>
          )}

          {mode === "accept" && (
            <AcceptForm busy={act.busy} onCancel={() => setMode("none")} onSubmit={(b) => void post("accept", b)} />
          )}
          {(mode === "reject" || mode === "return") && (
            <ReasonForm
              busy={act.busy}
              placeholder={mode === "reject" ? "دلیل رد (برای کاربر پیامک می‌شود)" : "دلیل توقف و عودت شمش (برای کاربر پیامک می‌شود)"}
              submitLabel={mode === "reject" ? "رد درخواست و آزادسازی شمش" : "انتقال به مرحله‌ی عودت"}
              onCancel={() => setMode("none")}
              onSubmit={(reason) => void post(mode, { reason })}
            />
          )}
          {(mode === "receive" || mode === "returned" || mode === "approve") && (
            <NoteForm
              busy={act.busy}
              hint={
                mode === "receive"
                  ? "شمش به‌صورت فیزیکی تحویل گرفته شد (کارت ملی تحویل‌دهنده کنترل شود). شماره رسید/توضیحات:"
                  : mode === "returned"
                    ? "شمش به مالک تحویل داده شد (رسید تحویل گرفته شود). توضیحات:"
                    : "با تأیید نهایی، حساب مقصد با حساب پیش‌فرض تأییدشده‌ی فعلی کاربر کنترل و درخواست به صف واریز منتقل می‌شود."
              }
              submitLabel={mode === "receive" ? "ثبت دریافت شمش" : mode === "returned" ? "ثبت عودت شمش" : "تأیید نهایی"}
              onCancel={() => setMode("none")}
              onSubmit={(note) => void post(mode === "returned" ? "returned" : mode, { note: note || undefined })}
            />
          )}
          {mode === "inspect" && (
            <InspectForm
              busy={act.busy}
              declaredWeight={d.bar.weightGrams}
              onCancel={() => setMode("none")}
              onSubmit={(b) => void post("inspect", b)}
            />
          )}
          {mode === "offer" && (
            <OfferForm id={d.id} busy={act.busy} onCancel={() => setMode("none")} onSubmit={(b) => void post("offer", b)} />
          )}
          {mode === "pay" && (
            <PayForm
              busy={act.busy}
              netRial={d.offer.netRial}
              dualControl={d.payment.requiresDualControl}
              onCancel={() => setMode("none")}
              onSubmit={(b) => void post("pay", b, `واریز ${toman(d.offer.netRial)} تومان به حساب ${d.destination.bankName} ثبت شود؟`)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl border border-gray-100 p-3">
      <p className="text-[11px] font-black text-gray-500">{title}</p>
      {children}
    </div>
  );
}

function FormShell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">{children}</div>;
}

function FormButtons({
  busy,
  disabled,
  submitLabel,
  onCancel,
  onSubmit,
  danger,
}: {
  busy: boolean;
  disabled?: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <ActionButton variant="secondary" onClick={onCancel}>
        انصراف
      </ActionButton>
      <ActionButton variant={danger ? "danger" : "primary"} busy={busy} disabled={disabled} onClick={onSubmit}>
        {submitLabel}
      </ActionButton>
    </div>
  );
}

function AcceptForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (b: { appointmentAt?: string; appointmentNote?: string }) => void;
}) {
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  return (
    <FormShell>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="زمان نوبت تحویل (اختیاری)">
          <JalaliDateInput value={at} onChange={setAt} withTime min={todayIsoLocal()} />
        </Field>
        <Field label="توضیح برای کاربر (اختیاری)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="مثلاً: مراجعه به واحد خزانه، طبقه دوم" />
        </Field>
      </div>
      <p className="text-[11px] text-gray-600">زمان و توضیحات نوبت از طریق پیامک و اعلان به کاربر اطلاع داده می‌شود.</p>
      <FormButtons
        busy={busy}
        submitLabel="ثبت پذیرش و نوبت"
        onCancel={onCancel}
        onSubmit={() =>
          onSubmit({
            appointmentAt: at ? new Date(at).toISOString() : undefined,
            appointmentNote: note.trim() || undefined,
          })
        }
      />
    </FormShell>
  );
}

function ReasonForm({
  busy,
  placeholder,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  placeholder: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={placeholder} className={inputCls} />
      <FormButtons
        danger
        busy={busy}
        disabled={reason.trim().length < 5}
        submitLabel={submitLabel}
        onCancel={onCancel}
        onSubmit={() => onSubmit(reason.trim())}
      />
    </div>
  );
}

function NoteForm({
  busy,
  hint,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  hint: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <FormShell>
      <p className="text-[12px] text-gray-700">{hint}</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="توضیحات (اختیاری)" />
      <FormButtons busy={busy} submitLabel={submitLabel} onCancel={onCancel} onSubmit={() => onSubmit(note.trim())} />
    </FormShell>
  );
}

function InspectForm({
  busy,
  declaredWeight,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  declaredWeight: string;
  onCancel: () => void;
  onSubmit: (b: unknown) => void;
}) {
  const [checks, setChecks] = useState<Checklist>({
    hologramIntact: false,
    serialMatches: false,
    packagingIntact: false,
    surfaceIntact: false,
    purityTestPassed: false,
  });
  const [method, setMethod] = useState("XRF");
  const [weight, setWeight] = useState("");
  const [fineness, setFineness] = useState("");
  const [note, setNote] = useState("");
  const allOk = CHECKLIST.every((c) => checks[c.key]);
  const weightNum = Number(weight);
  const weightDiff = weight ? weightNum - Number(declaredWeight) : 0;

  const submit = (passed: boolean) =>
    onSubmit({
      passed,
      checklist: { ...checks, purityTestMethod: method || undefined },
      measuredWeightGrams: weight ? weightNum : undefined,
      measuredFineness: fineness ? Number(fineness) : undefined,
      note: note.trim() || undefined,
    });

  return (
    <FormShell>
      <p className="text-[12px] font-bold text-gray-700">چک‌لیست اصالت‌سنجی</p>
      <div className="grid gap-1.5 md:grid-cols-2">
        {CHECKLIST.map((c) => (
          <label key={c.key} className="flex items-start gap-2 text-[12px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={!!checks[c.key]}
              onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })}
            />
            {c.label}
          </label>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={`وزن اندازه‌گیری‌شده (گرم) — اسمی ${grams(declaredWeight)}`}>
          <input value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} className={`${inputCls} text-left`} dir="ltr" inputMode="decimal" />
        </Field>
        <Field label="عیار اندازه‌گیری‌شده (در هزار، اختیاری)" hint="مثلاً 995 یا 999.9 — مبنای قیمت می‌شود">
          <input value={fineness} onChange={(e) => setFineness(e.target.value.replace(/[^\d.]/g, ""))} className={`${inputCls} text-left`} dir="ltr" inputMode="decimal" />
        </Field>
        <Field label="روش آزمون عیار">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            <option value="XRF">دستگاه XRF</option>
            <option value="TOUCHSTONE">سنگ محک</option>
            <option value="FIRE_ASSAY">ذوب و آزمایشگاه</option>
            <option value="VISUAL">بازرسی ظاهری</option>
          </select>
        </Field>
      </div>
      {weight && Math.abs(weightDiff) > 0.01 && (
        <Alert
          kind="warn"
          text={`اختلاف وزن با وزن اسمی: ${weightDiff.toLocaleString("fa-IR", { maximumFractionDigits: 4 })} گرم — قیمت بر مبنای وزن کمتر محاسبه می‌شود.`}
        />
      )}
      <Field label="توضیحات کارشناس (برای نتیجه‌ی ناموفق الزامی و برای کاربر پیامک می‌شود)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="secondary" onClick={onCancel}>
          انصراف
        </ActionButton>
        <ActionButton busy={busy} disabled={!allOk || !weight} onClick={() => submit(true)}>
          <CheckCircle2 className="h-4 w-4" /> تأیید اصالت
        </ActionButton>
        <ActionButton variant="danger" busy={busy} disabled={note.trim().length < 3} onClick={() => submit(false)}>
          <XCircle className="h-4 w-4" /> اصالت‌سنجی ناموفق (عودت شمش)
        </ActionButton>
      </div>
    </FormShell>
  );
}

function OfferForm({
  id,
  busy,
  onCancel,
  onSubmit,
}: {
  id: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (b: unknown) => void;
}) {
  const [pricePerGram, setPricePerGram] = useState("");
  const [deduction, setDeduction] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Price | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const body = () => ({
    pricePerGramRial: pricePerGram ? Math.round(Number(pricePerGram) * 10) : undefined,
    deductionPercent: deduction !== "" ? Number(deduction) : undefined,
    feeRial: fee !== "" ? Math.round(Number(fee) * 10) : undefined,
  });

  const calc = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.post(`/api/admin/buyback/${id}/quote`, body());
      setPreview(res.data as Price);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "محاسبه‌ی قیمت ممکن نشد");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormShell>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="قیمت هر گرم (تومان)" hint="خالی = قیمت لحظه‌ای بر اساس عیار اندازه‌گیری‌شده">
          <input value={pricePerGram} onChange={(e) => setPricePerGram(e.target.value.replace(/\D/g, ""))} className={`${inputCls} text-left`} dir="ltr" inputMode="numeric" />
        </Field>
        <Field label="درصد کسر بازخرید" hint="خالی = تنظیمات سیستم">
          <input value={deduction} onChange={(e) => setDeduction(e.target.value.replace(/[^\d.]/g, ""))} className={`${inputCls} text-left`} dir="ltr" inputMode="decimal" />
        </Field>
        <Field label="هزینه‌ی کارشناسی (تومان)" hint="خالی = تنظیمات سیستم">
          <input value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))} className={`${inputCls} text-left`} dir="ltr" inputMode="numeric" />
        </Field>
      </div>
      <Field label="توضیح برای کاربر (اختیاری)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      <ActionButton variant="secondary" busy={loading} onClick={() => void calc()}>
        محاسبه‌ی قیمت با قیمت لحظه‌ای
      </ActionButton>
      {error && <Alert kind="error" text={error} />}
      {preview && (
        <div className="rounded-xl bg-white p-3 text-[12px]">
          <p>
            قیمت هر گرم: <b>{toman(preview.pricePerGramRial)}</b> تومان (
            {preview.priceBasis === "FINENESS" ? "بر اساس عیار اندازه‌گیری‌شده" : preview.priceBasis === "KARAT" ? "بر اساس عیار ثبت‌شده" : "دستی"}) ×{" "}
            {grams(preview.weightGrams)} گرم = {toman(preview.grossRial)} تومان
          </p>
          <p>
            کسر {Number(preview.deductionPercent).toLocaleString("fa-IR")}٪: {toman(preview.deductionRial)} — هزینه‌ی کارشناسی: {toman(preview.feeRial)}
          </p>
          <p className="mt-1 text-[15px] font-black text-emerald-800">مبلغ نهایی قابل واریز: {toman(preview.netRial)} تومان</p>
        </div>
      )}
      <p className="text-[11px] text-gray-600">
        قیمت هنگام ثبت دوباره با قیمت لحظه‌ای محاسبه می‌شود و برای کاربر پیامک می‌شود؛ کاربر تا پایان مهلت تنظیم‌شده می‌تواند آن را بپذیرد یا رد کند.
      </p>
      <FormButtons
        busy={busy}
        disabled={!preview}
        submitLabel="ثبت و ارسال قیمت برای کاربر"
        onCancel={onCancel}
        onSubmit={() => onSubmit({ ...body(), note: note.trim() || undefined })}
      />
    </FormShell>
  );
}

function PayForm({
  busy,
  netRial,
  dualControl,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  netRial: string | null;
  dualControl: boolean;
  onCancel: () => void;
  onSubmit: (b: unknown) => void;
}) {
  const [bankReference, setBankReference] = useState("");
  const [sourceAccountCode, setSource] = useState("");
  const [payoutMethod, setMethod] = useState("PAYA");
  const [paidAt, setPaidAt] = useState(todayIsoLocal());
  const [note, setNote] = useState("");
  return (
    <FormShell>
      <p className="text-[13px] font-black">مبلغ واریز: {toman(netRial)} تومان</p>
      {dualControl && (
        <Alert kind="info" text="این مبلغ بالای سقف تأیید دونفره است؛ واریز باید توسط کارشناسی غیر از تأییدکننده‌ی نهایی ثبت شود." />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="شماره پیگیری بانکی">
          <input value={bankReference} onChange={(e) => setBankReference(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="روش پرداخت">
          <select value={payoutMethod} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {Object.entries(PAYOUT_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="حساب بانکی مبدأ (شرکت)">
          <AccountSelect value={sourceAccountCode} onChange={setSource} filter={(a) => a.code.startsWith("1010")} placeholder="پیش‌فرض تنظیمات" />
        </Field>
        <Field label="تاریخ پرداخت">
          <JalaliDateInput value={paidAt} onChange={setPaidAt} max={todayIsoLocal()} clearable={false} />
        </Field>
      </div>
      <Field label="یادداشت (اختیاری)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      <p className="text-[11px] text-gray-600">
        با ثبت واریز، مالکیت کاربر بسته و شمش به موجودی کددار خزانه (قابل فروش مجدد) منتقل می‌شود و سند «موجودی شمش خزانه / بانک مبدأ» صادر و برای کاربر پیامک می‌شود.
      </p>
      <FormButtons
        busy={busy}
        disabled={bankReference.trim().length < 3}
        submitLabel="ثبت واریز"
        onCancel={onCancel}
        onSubmit={() =>
          onSubmit({
            bankReference: bankReference.trim(),
            sourceAccountCode: sourceAccountCode || undefined,
            payoutMethod,
            // پرداخت امروز با زمان فعلی ثبت می‌شود (ظهر امروز ممکن است هنوز نرسیده باشد)
            paidAt: paidAt && paidAt !== todayIsoLocal() ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
            note: note.trim() || undefined,
          })
        }
      />
    </FormShell>
  );
}
