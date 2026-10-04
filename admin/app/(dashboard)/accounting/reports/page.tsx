// admin/app/(dashboard)/accounting/reports/page.tsx — صورت‌های مالی، موقعیت طلا و ارزیابی
"use client";
import { useState } from "react";
import useSWR from "swr";
import { BarChart3, Printer } from "lucide-react";
import {
  ActionButton,
  Alert,
  DateRange,
  Field,
  Num,
  PageHeader,
  Spinner,
  Table,
  Tabs,
  api,
  cardStyle,
  fetcher,
  grams,
  inputCls,
  monthStartIso,
  signedToman,
  toman,
  todayIso,
  tomanToRial,
  yearStartIso,
  CsvButton,
  downloadCsv,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import JalaliDateInput from "@/app/components/JalaliDateInput";

type Tab = "pl" | "monthly" | "cf" | "bs" | "tax" | "gold" | "reval";

interface PL {
  sections: Record<string, { code: string; name: string; amountRial: string }[]>;
  totals: Record<string, string>;
  netSalesRial: string;
  grossProfitRial: string;
  operatingProfitRial: string;
  netProfitRial: string;
  note: string;
}
interface BS {
  asOf: string;
  assets: { code: string; name: string; amountRial: string; grams: string }[];
  liabilities: { code: string; name: string; amountRial: string; grams: string }[];
  equity: { code: string; name: string; amountRial: string; grams: string }[];
  currentEarningsRial: string;
  totalAssetsRial: string;
  totalLiabilitiesRial: string;
  totalEquityRial: string;
  totalLiabilitiesAndEquityRial: string;
  isBalanced: boolean;
}
interface GoldRow {
  code: string;
  name: string;
  grams: string;
  bookValueRial: string;
  marketValueRial: string | null;
  unrealizedRial: string | null;
}
interface GoldPos {
  pricePerGramRial: string;
  meltedGold: GoldRow[];
  bullion: GoldRow[];
  walletGoldGrams: string;
  netMeltedPositionGrams: string;
  netMeltedPositionRial: string;
}
interface Reval {
  pricePerGramRial: string;
  items: { code: string; name: string; grams: string; bookValueRial: string; targetValueRial: string; adjustmentRial: string; gainRial: string }[];
  netGainRial: string;
  hasAdjustment: boolean;
}

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <tr className={bold ? "font-black bg-gray-50" : ""}>
      <td className={indent ? "pr-8" : ""}>{label}</td>
      <Num bold={bold}>{signedToman(value)}</Num>
    </tr>
  );
}

function IncomeStatement() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data } = useSWR<PL>(`/api/admin/accounting/reports/income-statement?${qs}`, fetcher);
  const section = (key: string, title: string) =>
    data?.sections[key]?.length ? (
      <>
        <tr>
          <td colSpan={2} className="font-black text-gray-700 pt-3">
            {title}
          </td>
        </tr>
        {data.sections[key].map((l) => (
          <Row key={l.code} label={`${l.code} — ${l.name}`} value={l.amountRial} indent />
        ))}
      </>
    ) : null;
  return (
    <div className="space-y-3">
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>شرح</th>
                <th>مبلغ (تومان)</th>
              </tr>
            </thead>
            <tbody>
              {section("SALES", "فروش")}
              {section("SALES_DEDUCTION", "کسر می‌شود: تخفیفات فروش")}
              <Row label="فروش خالص" value={data.netSalesRial} bold />
              {section("COGS", "کسر می‌شود: بهای تمام‌شده کالای فروش‌رفته")}
              <Row label="سود ناخالص" value={data.grossProfitRial} bold />
              {section("OTHER_INCOME", "درآمدهای عملیاتی (کارمزد، بسته‌بندی، سایر)")}
              {section("EXPENSES", "کسر می‌شود: هزینه‌های عملیاتی")}
              <Row label="سود (زیان) عملیاتی" value={data.operatingProfitRial} bold />
              {section("GOLD_RESULT", "سود (زیان) ارزیابی و فروش طلا")}
              <Row label="سود (زیان) خالص دوره" value={data.netProfitRial} bold />
            </tbody>
          </Table>
          <p className="text-[11px] text-gray-400">{data.note}</p>
        </>
      )}
    </div>
  );
}

function BalanceSheet() {
  const [asOf, setAsOf] = useState(todayIso());
  const { data } = useSWR<BS>(`/api/admin/accounting/reports/balance-sheet?asOf=${asOf}`, fetcher);
  const block = (title: string, rows: BS["assets"], total: string) => (
    <div className="rounded-xl border border-gray-100 p-3">
      <p className="font-black text-[13px] mb-2">{title}</p>
      <Table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td>
                {r.code} — {r.name}
                {Number(r.grams) ? <span className="text-[10px] text-gray-400"> ({grams(r.grams)} گرم)</span> : null}
              </td>
              <Num>{signedToman(r.amountRial)}</Num>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-black">
            <td>جمع {title}</td>
            <Num>{signedToman(total)}</Num>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
  return (
    <div className="space-y-3">
      <label className="text-[12px] font-bold text-gray-600">
        در تاریخ
        <JalaliDateInput value={asOf} onChange={(v) => setAsOf(v)} className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" />
      </label>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Alert
            kind={data.isBalanced ? "success" : "error"}
            text={
              data.isBalanced
                ? `ترازنامه متوازن است: جمع دارایی‌ها ${signedToman(data.totalAssetsRial)} = بدهی‌ها و حقوق صاحبان سهام ${signedToman(data.totalLiabilitiesAndEquityRial)} تومان`
                : "ترازنامه متوازن نیست — مغایرت‌گیری را بررسی کنید"
            }
          />
          <div className="grid lg:grid-cols-2 gap-3">
            {block("دارایی‌ها", data.assets, data.totalAssetsRial)}
            <div className="space-y-3">
              {block("بدهی‌ها", data.liabilities, data.totalLiabilitiesRial)}
              {block(
                "حقوق صاحبان سهام",
                [...data.equity, { code: "—", name: "سود (زیان) دوره‌ی جاری (بسته‌نشده)", amountRial: data.currentEarningsRial, grams: "0" }],
                data.totalEquityRial,
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GoldPosition() {
  const { data } = useSWR<GoldPos>("/api/admin/accounting/reports/gold-position", fetcher);
  if (!data) return <Spinner />;
  const table = (rows: GoldRow[], showMarket: boolean) => (
    <Table>
      <thead>
        <tr>
          <th>حساب</th>
          <th>گرم</th>
          <th>ارزش دفتری (تومان)</th>
          {showMarket && <th>ارزش روز (تومان)</th>}
          {showMarket && <th>سود/زیان تحقق‌نیافته</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code}>
            <td>
              {r.code} — {r.name}
            </td>
            <Num bold>{grams(r.grams)}</Num>
            <Num>{signedToman(r.bookValueRial)}</Num>
            {showMarket && <Num>{r.marketValueRial ? signedToman(r.marketValueRial) : "—"}</Num>}
            {showMarket && <Num>{r.unrealizedRial ? signedToman(r.unrealizedRial) : "—"}</Num>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
  const net = Number(data.netMeltedPositionGrams);
  return (
    <div className="space-y-4">
      <Alert
        kind={net >= 0 ? "success" : "error"}
        text={`موقعیت خالص طلای آب‌شده (خزانه + در راه − کیف پول کاربران): ${net >= 0 ? "مازاد" : "کسری"} ${grams(Math.abs(net))} گرم ≈ ${toman(
          Math.abs(Number(data.netMeltedPositionRial)),
        )} تومان — قیمت مبنا ${toman(data.pricePerGramRial)} تومان`}
      />
      <p className="font-black text-[13px]">طلای آب‌شده (گرم ۷۵۰)</p>
      {table(data.meltedGold, true)}
      <p className="font-black text-[13px]">شمش (وزن فیزیکی)</p>
      {table(data.bullion, false)}
    </div>
  );
}

function Revaluation() {
  const can = usePerm();
  const [price, setPrice] = useState("");
  const q = price ? `?pricePerGramRial=${tomanToRial(price)}` : "";
  const { data, mutate } = useSWR<Reval>(`/api/admin/accounting/revaluation/preview${q}`, fetcher);
  const act = useAction();
  const post = async () => {
    await act.run(
      () => api.post("/api/admin/accounting/revaluation", price ? { pricePerGramRial: String(tomanToRial(price)) } : {}),
      "سند ارزیابی طلا با این قیمت ثبت شود؟",
    );
    void mutate();
  };
  return (
    <div className="space-y-3">
      <Alert
        kind="info"
        text="ارزیابی (تسعیر): ارزش ریالی موجودی طلای خزانه (1020) و بدهی طلایی کاربران (2020) را با قیمت روز برابر می‌کند و اختلاف را به «سود/زیان ارزیابی و فروش طلا» می‌برد. معمولاً در پایان هر ماه و پیش از بستن سال مالی انجام شود. موجودی شمش به بهای تمام‌شده باقی می‌ماند."
      />
      <Field label="قیمت هر گرم ۱۸ عیار (تومان)" hint="خالی = قیمت لحظه‌ای بازار">
        <input value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} dir="ltr" />
      </Field>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>حساب</th>
                <th>گرم</th>
                <th>ارزش دفتری</th>
                <th>ارزش روز</th>
                <th>تعدیل</th>
                <th>اثر بر سود</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.code}>
                  <td>
                    {i.code} — {i.name}
                  </td>
                  <Num>{grams(i.grams)}</Num>
                  <Num>{signedToman(i.bookValueRial)}</Num>
                  <Num>{signedToman(i.targetValueRial)}</Num>
                  <Num>{signedToman(i.adjustmentRial)}</Num>
                  <Num bold>{signedToman(i.gainRial)}</Num>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-[12px] font-bold">
            قیمت: {toman(data.pricePerGramRial)} تومان — اثر خالص بر سود: {signedToman(data.netGainRial)} تومان
          </p>
          {act.error && <Alert kind="error" text={act.error} />}
          {act.success && <Alert kind="success" text={act.success} />}
          {can("accounting.manage") && (
            <ActionButton onClick={post} busy={act.busy} disabled={!data.hasAdjustment}>
              ثبت سند ارزیابی
            </ActionButton>
          )}
        </>
      )}
    </div>
  );
}

export default function FinancialReportsPage() {
  const [tab, setTab] = useState<Tab>("pl");
  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        title="صورت‌های مالی"
        subtitle="صورت سود و زیان، ترازنامه، موقعیت طلا و ارزیابی طلا به قیمت روز — مستقیماً از دفتر کل"
        actions={
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700">
            <Printer className="w-4 h-4" /> چاپ
          </button>
        }
      />
      <Tabs
        tabs={[
          { key: "pl", label: "سود و زیان" },
          { key: "monthly", label: "سود و زیان ماهانه" },
          { key: "cf", label: "جریان وجوه نقد" },
          { key: "bs", label: "ترازنامه" },
          { key: "tax", label: "مالیات و ارزش افزوده" },
          { key: "gold", label: "موقعیت طلا" },
          { key: "reval", label: "ارزیابی طلا" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="rounded-2xl p-4" style={cardStyle}>
        {tab === "pl" && <IncomeStatement />}
        {tab === "bs" && <BalanceSheet />}
        {tab === "gold" && <GoldPosition />}
        {tab === "reval" && <Revaluation />}
        {tab === "monthly" && <MonthlyIncome />}
        {tab === "cf" && <CashFlow />}
        {tab === "tax" && <TaxReport />}
      </div>
    </div>
  );
}

// ═══════════════════════════ سود و زیان ماهانه ═══════════════════════════

interface Monthly {
  months: { key: string; label: string }[];
  income: { code: string; name: string; values: string[]; totalRial: string }[];
  expense: { code: string; name: string; values: string[]; totalRial: string }[];
  incomeTotals: string[];
  expenseTotals: string[];
  netProfit: string[];
  note: string;
}

function MonthlyIncome() {
  const [from, setFrom] = useState(yearStartIso());
  const [to, setTo] = useState(todayIso());
  const qs = new URLSearchParams({ from, to });
  const { data, error } = useSWR<Monthly>(from && to ? `/api/admin/accounting/reports/monthly-income?${qs}` : null, fetcher);
  const exportCsv = () => {
    if (!data) return;
    const head = ["کد", "حساب", ...data.months.map((m) => m.label), "جمع (ریال)"];
    const rows = [
      ...data.income.map((l) => [l.code, l.name, ...l.values, l.totalRial]),
      ["", "جمع درآمد", ...data.incomeTotals, ""],
      ...data.expense.map((l) => [l.code, l.name, ...l.values, l.totalRial]),
      ["", "جمع هزینه", ...data.expenseTotals, ""],
      ["", "سود (زیان) خالص", ...data.netProfit, ""],
    ];
    downloadCsv(`monthly-income-${from}-${to}.csv`, head, rows);
  };
  const lines = (title: string, list: Monthly["income"], totals: string[]) => (
    <>
      <tr>
        <td colSpan={(data?.months.length ?? 0) + 2} className="font-black text-gray-700 pt-3">
          {title}
        </td>
      </tr>
      {list.map((l) => (
        <tr key={l.code}>
          <td className="pr-6 whitespace-nowrap">
            {l.code} — {l.name}
          </td>
          {l.values.map((v, i) => (
            <Num key={i}>{signedToman(v)}</Num>
          ))}
          <Num bold>{signedToman(l.totalRial)}</Num>
        </tr>
      ))}
      <tr className="font-black bg-gray-50">
        <td>جمع {title}</td>
        {totals.map((v, i) => (
          <Num key={i} bold>
            {signedToman(v)}
          </Num>
        ))}
        <Num bold>{signedToman(totals.reduce((a, b) => a + Number(b), 0))}</Num>
      </tr>
    </>
  );
  return (
    <div className="space-y-3">
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo}>
        <CsvButton onClick={exportCsv} />
      </DateRange>
      {error ? (
        <Alert kind="error" text="بازه‌ی گزارش ماهانه حداکثر ۱۳ ماه است" />
      ) : !data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>حساب (تومان)</th>
                {data.months.map((m) => (
                  <th key={m.key} className="whitespace-nowrap">
                    {m.label.replace(/\d+/g, (d) => Number(d).toLocaleString("fa-IR", { useGrouping: false }))}
                  </th>
                ))}
                <th>جمع</th>
              </tr>
            </thead>
            <tbody>
              {lines("درآمدها", data.income, data.incomeTotals)}
              {lines("هزینه‌ها", data.expense, data.expenseTotals)}
              <tr className="font-black" style={{ backgroundColor: "#ecfdf5" }}>
                <td>سود (زیان) خالص</td>
                {data.netProfit.map((v, i) => (
                  <Num key={i} bold>
                    {signedToman(v)}
                  </Num>
                ))}
                <Num bold>{signedToman(data.netProfit.reduce((a, b) => a + Number(b), 0))}</Num>
              </tr>
            </tbody>
          </Table>
          <p className="text-[11px] text-gray-400">{data.note}</p>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════ جریان وجوه نقد ═══════════════════════════

interface CF {
  sections: { key: string; title: string; netRial: string; lines: { code: string; name: string; inflowRial: string; outflowRial: string; netRial: string }[] }[];
  openingCashRial: string;
  netChangeRial: string;
  closingCashRial: string;
  roundingDifferenceRial: string;
}

function CashFlow() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data } = useSWR<CF>(`/api/admin/accounting/reports/cash-flow?${qs}`, fetcher);
  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [];
    for (const sec of data.sections) {
      rows.push([sec.title, "", "", "", ""]);
      for (const l of sec.lines) rows.push([l.code, l.name, l.inflowRial, l.outflowRial, l.netRial]);
      rows.push(["", `خالص ${sec.title}`, "", "", sec.netRial]);
    }
    rows.push(["", "موجودی نقد ابتدای دوره", "", "", data.openingCashRial]);
    rows.push(["", "خالص تغییر", "", "", data.netChangeRial]);
    rows.push(["", "موجودی نقد پایان دوره", "", "", data.closingCashRial]);
    downloadCsv(`cash-flow-${from}-${to}.csv`, ["کد", "شرح", "ورودی (ریال)", "خروجی (ریال)", "خالص (ریال)"], rows);
  };
  return (
    <div className="space-y-3">
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo}>
        <CsvButton onClick={exportCsv} />
      </DateRange>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>شرح (تومان)</th>
                <th>ورودی</th>
                <th>خروجی</th>
                <th>خالص</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((sec) => (
                <SectionRows key={sec.key} sec={sec} />
              ))}
              <tr>
                <td>موجودی نقد و بانک ابتدای دوره</td>
                <td />
                <td />
                <Num>{signedToman(data.openingCashRial)}</Num>
              </tr>
              <tr className="font-black bg-gray-50">
                <td>خالص افزایش (کاهش) وجه نقد</td>
                <td />
                <td />
                <Num bold>{signedToman(data.netChangeRial)}</Num>
              </tr>
              <tr className="font-black" style={{ backgroundColor: "#ecfdf5" }}>
                <td>موجودی نقد و بانک پایان دوره</td>
                <td />
                <td />
                <Num bold>{signedToman(data.closingCashRial)}</Num>
              </tr>
            </tbody>
          </Table>
          <p className="text-[11px] text-gray-400">
            روش مستقیم: ورود و خروج هر سند حساب نقد و بانک به نسبت بین حساب‌های طرف مقابل آن سند تسهیم شده است. جابه‌جایی بین حساب‌های بانکی شرکت اثر خالص ندارد.
            {Number(data.roundingDifferenceRial) !== 0 && ` اختلاف گرد کردن: ${signedToman(data.roundingDifferenceRial)} تومان`}
          </p>
        </>
      )}
    </div>
  );
}

function SectionRows({ sec }: { sec: CF["sections"][number] }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="font-black text-gray-700 pt-3">
          {sec.title}
        </td>
      </tr>
      {sec.lines.map((l) => (
        <tr key={l.code}>
          <td className="pr-6">
            {l.code} — {l.name}
          </td>
          <Num>{toman(l.inflowRial)}</Num>
          <Num>{toman(l.outflowRial)}</Num>
          <Num>{signedToman(l.netRial)}</Num>
        </tr>
      ))}
      <tr className="font-bold bg-gray-50">
        <td>خالص {sec.title}</td>
        <td />
        <td />
        <Num bold>{signedToman(sec.netRial)}</Num>
      </tr>
    </>
  );
}

// ═══════════════════════════ مالیات و ارزش افزوده ═══════════════════════════

interface TaxRep {
  payable: { openingRial: string; increaseRial: string; decreaseRial: string; closingRial: string };
  receivable: { openingRial: string; increaseRial: string; decreaseRial: string; closingRial: string };
  netPayableRial: string;
  bySource: { referenceType: string | null; source: string; amountRial: string }[];
  note: string;
}

const REF_FA: Record<string, string> = {
  TREASURY_ORDER: "سفارش خزانه",
  PARTNER_ORDER: "فروش شرکا",
  MANUAL_VOUCHER: "سند دستی",
  AGENT_SALE: "فروش نمایندگان",
};

function TaxReport() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data } = useSWR<TaxRep>(`/api/admin/accounting/reports/tax?${qs}`, fetcher);
  const row = (label: string, v: TaxRep["payable"]) => (
    <tr>
      <td>{label}</td>
      <Num>{signedToman(v.openingRial)}</Num>
      <Num>{toman(v.increaseRial)}</Num>
      <Num>{toman(v.decreaseRial)}</Num>
      <Num bold>{signedToman(v.closingRial)}</Num>
    </tr>
  );
  return (
    <div className="space-y-3">
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>حساب (تومان)</th>
                <th>مانده‌ی ابتدا</th>
                <th>افزایش دوره</th>
                <th>کاهش دوره</th>
                <th>مانده‌ی پایان</th>
              </tr>
            </thead>
            <tbody>
              {row("2030 — مالیات پرداختنی", data.payable)}
              {row("1080 — اعتبار مالیات بر ارزش افزوده خرید", data.receivable)}
              <tr className="font-black" style={{ backgroundColor: "#ecfdf5" }}>
                <td colSpan={4}>خالص مالیات قابل پرداخت (پرداختنی − اعتبار)</td>
                <Num bold>{signedToman(data.netPayableRial)}</Num>
              </tr>
            </tbody>
          </Table>
          {data.bySource.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <th>منشأ مالیات دوره</th>
                  <th>مبلغ (تومان)</th>
                </tr>
              </thead>
              <tbody>
                {data.bySource.map((b, i) => (
                  <tr key={i}>
                    <td>{(b.referenceType && REF_FA[b.referenceType]) || b.referenceType || (b.source === "SYSTEM" ? "معاملات طلای کاربران" : b.source)}</td>
                    <Num>{toman(b.amountRial)}</Num>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="text-[11px] text-gray-400">{data.note}</p>
        </>
      )}
    </div>
  );
}
