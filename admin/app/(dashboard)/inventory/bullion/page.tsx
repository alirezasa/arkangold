// admin/app/(dashboard)/inventory/bullion/page.tsx — موجودی لحظه‌ای شمش
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Boxes, CheckCircle2, Hourglass, PackageCheck, QrCode, ScanLine, ShoppingBag, Store, Tag, Truck } from "lucide-react";
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
  Pagination,
  Spinner,
  Table,
  Tabs,
  api,
  cardStyle,
  downloadCsv,
  faDate,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  toman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Summary {
  generatedAt: string;
  codes: { batches: number; generated: number; blank: number; used: number; revoked: number };
  totals: {
    vaultCoded: { count: number; grams: string };
    atAgents: { count: number; grams: string };
    transferPending: { count: number; grams: string };
    soldWithOwner: { count: number; grams: string };
    awaitingCode: { count: number; grams: string; rows: number };
    shopStock: { units: number; grams: string };
    companyOwned: { grams: string };
  };
  byAgent: { agentId: string; code: string; name: string; city: string | null; count: number; grams: string }[];
  byProduct: { productName: string; weightGrams: string; purityKarat: string | null; vaultCoded: number; atAgent: number; transferPending: number; sold: number }[];
  shopStockByVariant: { variantId: string; sku: string | null; productName: string; purityKarat: string | null; weightGrams: string; units: number }[];
  sales: Record<"shop" | "agents" | "partners", { count: number; grams: string; rial: string }>;
  ledger: {
    vaultBullion: { grams: string; costRial: string };
    consignment: { grams: string; costRial: string; physicalGrams: string; differenceGrams: string };
    soldCogs: { shopAndPartnersGrams: string; shopAndPartnersRial: string; agentsGrams: string; agentsRial: string };
  };
}

type Bucket = "VAULT_CODED" | "AT_AGENT" | "SOLD" | "TRANSFER_PENDING" | "AWAITING_CODE" | "BLANK" | "REVOKED";
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "VAULT_CODED", label: "کددار در خزانه" },
  { key: "AT_AGENT", label: "نزد نمایندگان" },
  { key: "SOLD", label: "فروخته‌شده" },
  { key: "TRANSFER_PENDING", label: "در انتظار تأیید گیرنده" },
  { key: "AWAITING_CODE", label: "فروخته — در انتظار کد" },
  { key: "BLANK", label: "کد خام" },
  { key: "REVOKED", label: "باطل‌شده" },
];
const PURITY: Record<string, string> = { K18: "۱۸", K24: "۲۴" };
const CHANNEL: Record<string, string> = { SHOP: "فروشگاه", AGENT: "نماینده", PARTNER: "شریک فروش", OTHER: "انتقال" };

interface Item {
  id: string;
  code?: string;
  status?: string;
  batchNumber?: string;
  productName: string | null;
  weightGrams: string | null;
  purityKarat: string | null;
  factorySerialNumber?: string | null;
  agent?: { code: string; name: string } | null;
  ownerName?: string | null;
  soldChannel?: string | null;
  reference?: string | null;
  vaultCodedAt?: string | null;
  updatedAt?: string;
  orderId?: string;
  quantity?: number;
  createdAt?: string;
}

function Items({ bucket }: { bucket: Bucket }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const qs = new URLSearchParams({ bucket, page: String(page) });
  if (search) qs.set("search", search);
  const { data } = useSWR<{ data: Item[]; page: number; totalPages: number; total: number }>(`/api/admin/inventory/bullion/items?${qs}`, fetcher);
  const awaiting = bucket === "AWAITING_CODE";
  return (
    <div className="space-y-3">
      {!awaiting && (
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="جست‌وجوی کد هولوگرام یا سریال"
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
        />
      )}
      {!data ? (
        <Spinner />
      ) : (
        <>
          <p className="text-[11px] text-gray-400">{data.total.toLocaleString("fa-IR")} ردیف</p>
          <Table>
            <thead>
              {awaiting ? (
                <tr>
                  <th>سفارش</th>
                  <th>محصول</th>
                  <th>وزن</th>
                  <th>عیار</th>
                  <th>تعداد</th>
                  <th>تاریخ سفارش</th>
                </tr>
              ) : (
                <tr>
                  <th>کد</th>
                  <th>محصول</th>
                  <th>وزن (گرم)</th>
                  <th>عیار</th>
                  <th>سریال</th>
                  <th>نماینده / مالک</th>
                  <th>کانال / مرجع</th>
                  <th>آخرین تغییر</th>
                </tr>
              )}
            </thead>
            <tbody>
              {data.data.map((i) =>
                awaiting ? (
                  <tr key={i.id}>
                    <td dir="ltr" className="text-left text-[10px]">
                      {i.orderId?.slice(0, 8)}
                    </td>
                    <td>{i.productName}</td>
                    <Num>{grams(i.weightGrams)}</Num>
                    <td>{i.purityKarat ? PURITY[i.purityKarat] : "—"}</td>
                    <td>{i.quantity?.toLocaleString("fa-IR")}</td>
                    <td>{faDate(i.createdAt)}</td>
                  </tr>
                ) : (
                  <tr key={i.id}>
                    <Num bold>{i.code}</Num>
                    <td>{i.productName ?? "—"}</td>
                    <Num>{grams(i.weightGrams)}</Num>
                    <td>{i.purityKarat ? PURITY[i.purityKarat] : "—"}</td>
                    <td>{i.factorySerialNumber ?? "—"}</td>
                    <td>{i.agent ? `${i.agent.code} — ${i.agent.name}` : (i.ownerName ?? "—")}</td>
                    <td>
                      {i.soldChannel ? CHANNEL[i.soldChannel] : "—"}
                      {i.reference && <p className="text-[10px] text-gray-400">{i.reference}</p>}
                    </td>
                    <td>{faDateTime(i.vaultCodedAt ?? i.updatedAt)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function CodeBarsForm({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const act = useAction();
  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [code, weightGrams, purity, serial] = l.split(/[\s,،]+/);
      return {
        code,
        weightGrams,
        purityKarat: purity === "18" || purity?.toUpperCase() === "K18" ? "K18" : "K24",
        factorySerialNumber: serial || undefined,
      };
    });
  const valid = items.length > 0 && items.every((i) => /^\d{8}$/.test(i.code) && Number(i.weightGrams) > 0);
  const save = async () => {
    const ok = await act.run(() => api.post("/api/admin/inventory/bullion/code", { items }));
    if (ok) onDone();
  };
  return (
    <div className="space-y-3">
      <Alert
        kind="info"
        text={"هر خط یک شمش: «کد هولوگرام  وزن(گرم)  عیار(۱۸ یا ۲۴)  سریال کارخانه(اختیاری)»\nمثال: 12345678 10 24 AB-99812\nکدگذاری فقط کد را به شمش فیزیکی خزانه متصل می‌کند و سند حسابداری ندارد."}
      />
      <Field label={`شمش‌ها (${items.length.toLocaleString("fa-IR")} ردیف)`}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} font-mono`} rows={8} dir="ltr" />
      </Field>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!valid}>
        کدگذاری
      </ActionButton>
    </div>
  );
}

export default function BullionInventoryPage() {
  const can = usePerm();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bucket, setBucket] = useState<Bucket>("VAULT_CODED");
  const [coding, setCoding] = useState(false);
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, mutate } = useSWR<Summary>(`/api/admin/inventory/bullion?${qs}`, fetcher, { refreshInterval: 30_000 });

  const exportCsv = () =>
    data &&
    downloadCsv(
      "bullion-inventory.csv",
      ["محصول", "وزن", "عیار", "کددار خزانه", "نزد نمایندگان", "در انتظار گیرنده", "فروخته‌شده"],
      data.byProduct.map((r) => [r.productName, r.weightGrams, r.purityKarat, r.vaultCoded, r.atAgent, r.transferPending, r.sold]),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Boxes}
        title="موجودی لحظه‌ای شمش"
        subtitle="تعداد و وزن شمش‌ها به تفکیک وضعیت: کددار در خزانه، امانی نزد نمایندگان، فروخته‌شده (فروشگاه/نماینده/شریک)، در انتظار کدگذاری و ارسال، موجودی بدون کد فروشگاه و کدهای خام — همراه با تطبیق با دفاتر"
        actions={
          <>
            <CsvButton onClick={exportCsv} />
            {can("inventory.code") && (
              <ActionButton onClick={() => setCoding(true)}>
                <QrCode className="w-4 h-4" /> کدگذاری شمش خزانه
              </ActionButton>
            )}
          </>
        }
      />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="شمش کددار در خزانه" value={`${data.totals.vaultCoded.count.toLocaleString("fa-IR")} عدد`} hint={`${grams(data.totals.vaultCoded.grams)} گرم`} icon={Tag} />
            <Kpi title="امانی نزد نمایندگان" value={`${data.totals.atAgents.count.toLocaleString("fa-IR")} عدد`} hint={`${grams(data.totals.atAgents.grams)} گرم`} icon={Store} color="#2563eb" />
            <Kpi title="موجودی بدون کد فروشگاه" value={`${data.totals.shopStock.units.toLocaleString("fa-IR")} عدد`} hint={`${grams(data.totals.shopStock.grams)} گرم`} icon={ShoppingBag} color="#7c3aed" />
            <Kpi title="کل شمش متعلق به شرکت" value={`${grams(data.totals.companyOwned.grams)} گرم`} hint="کددار + امانی + فروشگاه" icon={Boxes} color="#0d9488" />
            <Kpi title="فروخته‌شده (دارای مالک)" value={`${data.totals.soldWithOwner.count.toLocaleString("fa-IR")} عدد`} hint={`${grams(data.totals.soldWithOwner.grams)} گرم`} icon={CheckCircle2} />
            <Kpi
              title="فروخته — در انتظار کدگذاری/ارسال"
              value={`${data.totals.awaitingCode.count.toLocaleString("fa-IR")} عدد`}
              hint={`${grams(data.totals.awaitingCode.grams)} گرم`}
              icon={Truck}
              color="#d97706"
            />
            <Kpi title="در انتظار تأیید گیرنده" value={`${data.totals.transferPending.count.toLocaleString("fa-IR")} عدد`} hint={`${grams(data.totals.transferPending.grams)} گرم`} icon={Hourglass} color="#6b7280" />
            <Kpi
              title="کدهای هولوگرام"
              value={`${data.codes.blank.toLocaleString("fa-IR")} خام`}
              hint={`${data.codes.generated.toLocaleString("fa-IR")} تولید — ${data.codes.used.toLocaleString("fa-IR")} مصرف — ${data.codes.revoked.toLocaleString("fa-IR")} باطل`}
              icon={ScanLine}
              color="#6b7280"
            />
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <p className="font-black text-[13px]">فروش شمش به تفکیک کانال</p>
            <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
            <Table>
              <thead>
                <tr>
                  <th>کانال</th>
                  <th>تعداد</th>
                  <th>وزن (گرم)</th>
                  <th>مبلغ (تومان)</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["shop", "فروشگاه آنلاین"],
                    ["agents", "نمایندگان"],
                    ["partners", "شرکای فروش / اقساطی"],
                  ] as const
                ).map(([k, label]) => (
                  <tr key={k}>
                    <td className="font-bold">{label}</td>
                    <Num>{data.sales[k].count.toLocaleString("fa-IR")}</Num>
                    <Num>{grams(data.sales[k].grams)}</Num>
                    <Num>{toman(data.sales[k].rial)}</Num>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
              <p className="font-black text-[13px]">موجودی به تفکیک محصول و وزن</p>
              <Table>
                <thead>
                  <tr>
                    <th>محصول</th>
                    <th>وزن</th>
                    <th>عیار</th>
                    <th>خزانه</th>
                    <th>نماینده</th>
                    <th>فروخته</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byProduct.map((r, i) => (
                    <tr key={i}>
                      <td>{r.productName}</td>
                      <Num>{grams(r.weightGrams)}</Num>
                      <td>{r.purityKarat ? PURITY[r.purityKarat] : "—"}</td>
                      <Num bold>{r.vaultCoded.toLocaleString("fa-IR")}</Num>
                      <Num>{r.atAgent.toLocaleString("fa-IR")}</Num>
                      <Num>{(r.sold + r.transferPending).toLocaleString("fa-IR")}</Num>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {data.shopStockByVariant.length > 0 && (
                <>
                  <p className="font-black text-[12px] pt-2">موجودی بدون کد فروشگاه</p>
                  <Table>
                    <tbody>
                      {data.shopStockByVariant.map((v) => (
                        <tr key={v.variantId}>
                          <td>
                            {v.productName} {v.sku ? `(${v.sku})` : ""}
                          </td>
                          <Num>{grams(v.weightGrams)} گرم</Num>
                          <Num bold>{v.units.toLocaleString("fa-IR")} عدد</Num>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
                <p className="font-black text-[13px]">امانی نزد نمایندگان</p>
                <Table>
                  <tbody>
                    {data.byAgent.map((a) => (
                      <tr key={a.agentId}>
                        <td>
                          {a.code} — {a.name} {a.city ? `(${a.city})` : ""}
                        </td>
                        <Num bold>{a.count.toLocaleString("fa-IR")} عدد</Num>
                        <Num>{grams(a.grams)} گرم</Num>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {!data.byAgent.length && <p className="text-[12px] text-gray-400">شمشی نزد نمایندگان نیست</p>}
              </div>
              <div className="rounded-2xl p-4 space-y-1 text-[12px]" style={cardStyle}>
                <p className="font-black text-[13px] flex items-center gap-2">
                  <PackageCheck className="w-4 h-4" /> تطبیق با دفاتر
                </p>
                <p>
                  موجودی شمش خزانه در دفتر (1025): <b>{grams(data.ledger.vaultBullion.grams)}</b> گرم — بها {toman(data.ledger.vaultBullion.costRial)} تومان
                </p>
                <p>
                  امانی نمایندگان در دفتر (1030): <b>{grams(data.ledger.consignment.grams)}</b> گرم؛ فیزیکی {grams(data.ledger.consignment.physicalGrams)} گرم — اختلاف{" "}
                  <b className={Number(data.ledger.consignment.differenceGrams) ? "text-red-600" : "text-green-700"}>{grams(data.ledger.consignment.differenceGrams)}</b>
                </p>
                <p>
                  بهای تمام‌شده‌ی فروش (فروشگاه و شرکا): {grams(data.ledger.soldCogs.shopAndPartnersGrams)} گرم — {toman(data.ledger.soldCogs.shopAndPartnersRial)} تومان
                </p>
                <p>
                  بهای تمام‌شده‌ی فروش نمایندگان: {grams(data.ledger.soldCogs.agentsGrams)} گرم — {toman(data.ledger.soldCogs.agentsRial)} تومان
                </p>
                <p className="text-gray-400">
                  برای ثبت بهای تمام‌شده‌ی صحیح، موجودی افتتاحیه‌ی شمش را با سند افتتاحیه (بدهکار 1025) و خریدهای شمش را از «سفارش‌های خزانه» ثبت کنید.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <Tabs tabs={BUCKETS} value={bucket} onChange={setBucket} />
            <Items key={bucket} bucket={bucket} />
          </div>
          <p className="text-[11px] text-gray-400">به‌روزرسانی خودکار هر ۳۰ ثانیه — {faDateTime(data.generatedAt)}</p>
        </>
      )}
      {coding && (
        <Modal title="کدگذاری شمش‌های خزانه" onClose={() => setCoding(false)} wide>
          <CodeBarsForm
            onDone={() => {
              setCoding(false);
              void mutate();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
