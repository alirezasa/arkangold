// admin/app/(dashboard)/treasury/page.tsx — گزارش پوشش ذخایر و خرید طلای آب‌شده
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Coins, Printer, ShieldCheck, ShoppingCart, Truck, Vault, Wallet } from "lucide-react";
import {
  ActionButton,
  Alert,
  CsvButton,
  DateRange,
  Field,
  Kpi,
  Modal,
  Num,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  downloadCsv,
  faDate,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Coverage {
  generatedAt: string;
  pricePerGramRial: string;
  liability: { walletGrams: string; ledgerGrams: string; differenceGrams: string; heldGrams: string };
  reserves: {
    vaultGrams: string;
    vaultBookValueRial: string;
    inTransitGrams: string;
    inTransitOrders: number;
    draftPurchaseGrams: string;
    draftPurchaseOrders: number;
    coveredGrams: string;
  };
  policy: { targetReservePercent: string; safetyBufferGrams: string; purchaseLotGrams: string; alertCoveragePercent: string };
  requiredGrams: string;
  shortfallGrams: string;
  surplusGrams: string;
  coveragePercent: string;
  status: "COVERED" | "SHORTFALL" | "CRITICAL";
  recommendedPurchaseGrams: string;
  estimatedPurchaseCostRial: string;
  ledgerCoverageClearingGrams: string;
  lastPurchase: { orderNumber: string; confirmedAt: string | null; grams: string; pricePerGramRial: string } | null;
  netDemandSinceLastPurchase: { since: string; inflowGrams: string; userSellGrams: string; netGrams: string } | null;
  flows: { data: Record<string, string>[]; totals: Record<string, string> };
}

interface SupplierOpt {
  id: string;
  code: string;
  name: string;
}

const FLOW_COLS: [string, string][] = [
  ["userBuy", "خرید کاربران"],
  ["rewards", "پاداش/حقوق طلایی"],
  ["partner", "فروش شرکا (اقساطی)"],
  ["userSell", "فروش کاربران"],
  ["delivery", "تحویل فیزیکی"],
  ["netDemand", "تقاضای خالص"],
  ["treasuryBuy", "خرید خزانه"],
  ["treasurySell", "فروش خزانه"],
  ["gap", "اختلاف (نیاز به خرید)"],
];

function PurchaseRequestForm({ report, onDone }: { report: Coverage; onDone: (id: string) => void }) {
  const { data: suppliers } = useSWR<{ data: SupplierOpt[] }>("/api/admin/treasury/suppliers?activeOnly=true&limit=200", fetcher);
  const [supplierId, setSupplierId] = useState("");
  const [g, setG] = useState(report.recommendedPurchaseGrams !== "0" ? report.recommendedPurchaseGrams : "");
  const [price, setPrice] = useState(String(Math.round(Number(report.pricePerGramRial) / 10)));
  const [note, setNote] = useState("");
  const act = useAction();
  const [id, setId] = useState<string | null>(null);
  const save = async () => {
    await act.run(async () => {
      const r = await api.post<{ id: string; message: string }>("/api/admin/treasury/coverage/purchase-request", {
        supplierId,
        grams: g,
        pricePerGramRial: String(tomanToRial(price)),
        note: note || undefined,
      });
      setId(r.data.id);
      return r;
    });
  };
  if (id)
    return (
      <div className="space-y-3">
        <Alert kind="success" text="درخواست خرید (پیش‌نویس) ثبت شد. پس از توافق قیمت نهایی با فروشنده، آن را در «سفارش‌های خزانه» قطعی کنید." />
        <ActionButton onClick={() => onDone(id)}>رفتن به سفارش‌ها</ActionButton>
      </div>
    );
  return (
    <div className="space-y-3">
      <Field label="تأمین‌کننده (بنکدار / فروشنده)">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
          <option value="">انتخاب کنید</option>
          {suppliers?.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
      </Field>
      {!suppliers?.data.length && (
        <Alert kind="warn" text="هنوز تأمین‌کننده‌ای تعریف نشده است؛ از صفحه‌ی «تأمین‌کنندگان» اضافه کنید." />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="مقدار خرید (گرم ۷۵۰)" hint={`پیشنهاد گزارش: ${grams(report.recommendedPurchaseGrams)} گرم`}>
          <input value={g} onChange={(e) => setG(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="قیمت تقریبی هر گرم (تومان)" hint="قیمت نهایی هنگام قطعی‌سازی قابل ویرایش است">
          <input value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
      </div>
      <p className="text-[12px] font-bold text-gray-600">
        برآورد مبلغ: {Number(g) && Number(price) ? (Number(g) * Number(price)).toLocaleString("fa-IR", { maximumFractionDigits: 0 }) : "—"} تومان
      </p>
      <Field label="توضیحات">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!supplierId || !Number(g)}>
        ثبت درخواست خرید
      </ActionButton>
    </div>
  );
}

export default function CoveragePage() {
  const can = usePerm();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState(false);
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useSWR<Coverage>(`/api/admin/treasury/coverage?${qs}`, fetcher, { refreshInterval: 60_000 });

  const exportCsv = () =>
    data &&
    downloadCsv(
      "treasury-coverage-flows.csv",
      ["روز", ...FLOW_COLS.map((c) => c[1])],
      data.flows.data.map((r) => [r.day, ...FLOW_COLS.map((c) => r[c[0]])]),
    );

  const statusView = data && {
    COVERED: { kind: "success" as const, text: "خزانه کامل پوشش دارد — طلای فیزیکی (موجود + در راه) از بدهی طلایی کاربران و ذخیره‌ی احتیاطی بیشتر است." },
    SHORTFALL: { kind: "warn" as const, text: `کسری پوشش: ${grams(data.shortfallGrams)} گرم. خرید پیشنهادی ${grams(data.recommendedPurchaseGrams)} گرم.` },
    CRITICAL: {
      kind: "error" as const,
      text: `هشدار: پوشش ${data.coveragePercent}٪ و کمتر از حد مجاز ${data.policy.alertCoveragePercent}٪ است. خرید فوری ${grams(data.recommendedPurchaseGrams)} گرم لازم است.`,
    },
  }[data.status];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Vault}
        title="گزارش پوشش و خرید طلای آب‌شده"
        subtitle="به ازای هر گرم طلایی که کاربران می‌خرند (یا پاداش/حقوق/خرید اقساطی دریافت می‌کنند) باید معادل آن از بازار خریده و در خزانه نگهداری شود. این گزارش کسری را محاسبه، مقدار خرید را پیشنهاد و درخواست خرید استاندارد صادر می‌کند."
        actions={
          <>
            <CsvButton onClick={exportCsv} />
            <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700">
              <Printer className="w-4 h-4" /> چاپ گزارش
            </button>
            {can("treasury.order.manage") && (
              <ActionButton onClick={() => setModal(true)}>
                <ShoppingCart className="w-4 h-4" /> ثبت درخواست خرید
              </ActionButton>
            )}
          </>
        }
      />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {statusView && <Alert kind={statusView.kind} text={statusView.text} />}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="بدهی طلایی کاربران (کیف پول‌ها)" value={`${grams(data.liability.walletGrams)} گرم`} icon={Wallet} color="#dc2626" />
            <Kpi
              title="موجودی خزانه"
              value={`${grams(data.reserves.vaultGrams)} گرم`}
              hint={`بهای دفتری ${toman(data.reserves.vaultBookValueRial)} تومان`}
              icon={Vault}
            />
            <Kpi
              title="خریداری‌شده در راه"
              value={`${grams(data.reserves.inTransitGrams)} گرم`}
              hint={`${data.reserves.inTransitOrders.toLocaleString("fa-IR")} سفارش قطعی دریافت‌نشده`}
              icon={Truck}
              color="#d97706"
            />
            <Kpi
              title="نسبت پوشش"
              value={`${Number(data.coveragePercent).toLocaleString("fa-IR")}٪`}
              hint={`هدف ${data.policy.targetReservePercent}٪ + ذخیره ${grams(data.policy.safetyBufferGrams)} گرم`}
              icon={data.status === "COVERED" ? ShieldCheck : AlertTriangle}
              color={data.status === "COVERED" ? "var(--color-emerald)" : "#dc2626"}
            />
            <Kpi title="طلای لازم (هدف)" value={`${grams(data.requiredGrams)} گرم`} icon={Coins} color="#7c3aed" />
            <Kpi
              title={Number(data.surplusGrams) > 0 ? "مازاد خزانه" : "کسری پوشش"}
              value={`${grams(Number(data.surplusGrams) > 0 ? data.surplusGrams : data.shortfallGrams)} گرم`}
              icon={AlertTriangle}
              color={Number(data.surplusGrams) > 0 ? "var(--color-emerald)" : "#dc2626"}
            />
            <Kpi
              title="خرید پیشنهادی"
              value={`${grams(data.recommendedPurchaseGrams)} گرم`}
              hint={`≈ ${toman(data.estimatedPurchaseCostRial)} تومان با قیمت ${toman(data.pricePerGramRial)}`}
              icon={ShoppingCart}
              color="#2563eb"
            />
            <Kpi
              title="درخواست‌های خرید پیش‌نویس"
              value={`${grams(data.reserves.draftPurchaseGrams)} گرم`}
              hint={`${data.reserves.draftPurchaseOrders.toLocaleString("fa-IR")} سفارش — از خرید پیشنهادی کسر شده`}
              icon={ShoppingCart}
              color="#6b7280"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="rounded-2xl p-4 space-y-2 text-[12px]" style={cardStyle}>
              <p className="font-black text-[13px]">کنترل‌ها</p>
              <p>
                بدهی طلایی در دفتر کل (2020): <b>{grams(data.liability.ledgerGrams)}</b> گرم — اختلاف با کیف پول‌ها:{" "}
                <b className={Number(data.liability.differenceGrams) ? "text-red-600" : "text-green-700"}>{grams(data.liability.differenceGrams)}</b> گرم
              </p>
              <p>طلای در حال تحویل فیزیکی / مسدود کاربران: {grams(data.liability.heldGrams)} گرم</p>
              <p>مانده‌ی حساب واسط پوشش در دفتر کل (1090): {grams(data.ledgerCoverageClearingGrams)} گرم</p>
              <p className="text-gray-400">
                سیاست خرید از «تنظیمات سیستم» (کلیدهای treasury.*) قابل تغییر است — واحد گرد کردن خرید: {grams(data.policy.purchaseLotGrams) || "—"} گرم
              </p>
            </div>
            <div className="rounded-2xl p-4 space-y-2 text-[12px]" style={cardStyle}>
              <p className="font-black text-[13px]">از آخرین خرید</p>
              {data.lastPurchase ? (
                <>
                  <p>
                    آخرین خرید: <b>{data.lastPurchase.orderNumber}</b> — {grams(data.lastPurchase.grams)} گرم به قیمت {toman(data.lastPurchase.pricePerGramRial)} تومان —{" "}
                    {faDateTime(data.lastPurchase.confirmedAt)}
                  </p>
                  {data.netDemandSinceLastPurchase && (
                    <p>
                      از آن زمان: ورودی به کیف پول‌ها {grams(data.netDemandSinceLastPurchase.inflowGrams)} گرم، فروش کاربران{" "}
                      {grams(data.netDemandSinceLastPurchase.userSellGrams)} گرم — خالص <b>{grams(data.netDemandSinceLastPurchase.netGrams)}</b> گرم
                    </p>
                  )}
                </>
              ) : (
                <p className="text-gray-400">هنوز خریدی از بازار ثبت نشده است.</p>
              )}
              <Link href="/treasury/orders" className="inline-block text-blue-700 font-bold">
                مشاهده‌ی سفارش‌های خزانه ←
              </Link>
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <p className="font-black text-[13px]">گردش روزانه‌ی طلای آب‌شده (گرم) — {faDate(data.flows.data.at(-1)?.day ?? null)} تا امروز</p>
            <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
            <Table>
              <thead>
                <tr>
                  <th>روز</th>
                  {FLOW_COLS.map((c) => (
                    <th key={c[0]}>{c[1]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.flows.data.map((r) => (
                  <tr key={r.day}>
                    <td className="whitespace-nowrap">{faDate(r.day)}</td>
                    {FLOW_COLS.map((c) => (
                      <Num key={c[0]} bold={c[0] === "gap" || c[0] === "netDemand"}>
                        {Number(r[c[0]]) ? grams(r[c[0]]) : "—"}
                      </Num>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-black">
                  <td>جمع</td>
                  {FLOW_COLS.map((c) => (
                    <Num key={c[0]}>{grams(data.flows.totals[c[0]] ?? "0")}</Num>
                  ))}
                </tr>
              </tfoot>
            </Table>
            {!data.flows.data.length && <p className="text-center text-[12px] text-gray-400 py-4">در این بازه گردشی ثبت نشده است</p>}
          </div>
          <p className="text-[11px] text-gray-400">تهیه‌شده در {faDateTime(data.generatedAt)} — واحد: گرم طلای ۱۸ عیار (۷۵۰)</p>
        </>
      )}
      {modal && data && (
        <Modal title="درخواست خرید طلای آب‌شده از بازار" onClose={() => setModal(false)}>
          <PurchaseRequestForm report={data} onDone={() => (window.location.href = "/treasury/orders")} />
        </Modal>
      )}
    </div>
  );
}
