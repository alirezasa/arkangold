// admin/app/(dashboard)/shop/shipping-zones/page.tsx
//
// مناطق ارسال، تعرفه‌ی هر روش در هر منطقه، شرکت‌های حمل و شبیه‌ساز هزینه‌ی ارسال.
// مشتری هنگام ثبت سفارش فقط روش‌هایی را می‌بیند که برای منطقه‌ی آدرسش تعرفه‌ی فعال دارند.
"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Calculator, MapPinned, Plus, Trash2 } from "lucide-react";
import {
  ActionButton,
  Alert,
  Empty,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Table,
  Tabs,
  api,
  cardStyle,
  fetcher,
  inputCls,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

// ─────────────────────────── انواع ───────────────────────────

type FeePayment = "PREPAID" | "ON_DELIVERY" | "CUSTOMER_CHOICE";
type MethodType = "POST" | "COURIER" | "EXPRESS" | "PICKUP";

interface Province {
  code: string;
  name: string;
  cities: string[];
}
interface Zone {
  id: string;
  name: string;
  description: string | null;
  provinceCodes: string[];
  provinceNames: string[];
  cities: string[];
  isActive: boolean;
  sortOrder: number;
  rateCount: number;
}
interface Method {
  id: string;
  code: string;
  name: string;
  type: MethodType;
  isActive: boolean;
  availableAtCheckout: boolean;
  carrier: { id: string; name: string; isActive: boolean } | null;
}
interface Rate {
  id: string;
  methodId: string;
  zoneId: string;
  baseRial: number;
  baseWeightGrams: number;
  stepRial: number;
  stepWeightGrams: number;
  valuePercent: number;
  minRial: number | null;
  maxRial: number | null;
  freeAboveRial: number | null;
  maxWeightGrams: number | null;
  maxOrderRial: number | null;
  feePayment: FeePayment;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  isActive: boolean;
}
interface Carrier {
  id: string;
  code: string;
  name: string;
  description: string | null;
  website: string | null;
  contactPhone: string | null;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  sortOrder: number;
  methodCount: number;
}
interface SimOption {
  methodId: string;
  name: string;
  carrierName: string | null;
  zoneName: string;
  available: boolean;
  unavailableReason: string | null;
  feeRial: number;
  free: boolean;
  feePayment: FeePayment;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  charge: { shippingRial: number; waivedRial: number; payOnDelivery: boolean; estimateRial: number };
  chargeOnDelivery: { shippingRial: number; payOnDelivery: boolean } | null;
}

const FEE_PAYMENT_FA: Record<FeePayment, string> = {
  PREPAID: "پیش‌پرداخت در سفارش",
  ON_DELIVERY: "پس‌کرایه (پرداخت هنگام تحویل)",
  CUSTOMER_CHOICE: "انتخاب مشتری",
};
const FEE_PAYMENT_SHORT: Record<FeePayment, string> = {
  PREPAID: "پیش‌پرداخت",
  ON_DELIVERY: "پس‌کرایه",
  CUSTOMER_CHOICE: "انتخاب مشتری",
};

const num = (v: string) => v.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const dec = (v: string) => v.replace(/[^\d.]/g, "");
const optRial = (v: string) => (v.trim() ? tomanToRial(v) : null);
const optInt = (v: string) => (v.trim() ? Number(v) : null);
const tomanStr = (rial: number | null | undefined) => (rial == null ? "" : String(Math.round(rial / 10)));
const eta = (min: number | null, max: number | null) =>
  min == null && max == null ? "—" : min != null && max != null && min !== max ? `${faInt(min)} تا ${faInt(max)} روز` : `${faInt((max ?? min)!)} روز`;
const faInt = (n: number) => n.toLocaleString("fa-IR");

type TabKey = "rates" | "zones" | "carriers" | "simulate";

export default function ShippingZonesPage() {
  const [tab, setTab] = useState<TabKey>("rates");
  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={MapPinned}
        title="مناطق و تعرفه‌های ارسال"
        subtitle="برای هر آدرس دقیق‌ترین منطقه‌ی منطبق ملاک است (فهرست شهر › استان › سایر نقاط کشور). هر روش ارسالی که در آن منطقه تعرفه‌ی فعال داشته باشد هنگام ثبت سفارش به مشتری نمایش داده می‌شود؛ تعرفه‌ی غیرفعال در منطقه‌ی دقیق‌تر یعنی «این روش برای این ناحیه ارائه نمی‌شود»."
      />
      <Tabs
        tabs={[
          { key: "rates", label: "تعرفه‌ها" },
          { key: "zones", label: "مناطق" },
          { key: "carriers", label: "شرکت‌های حمل" },
          { key: "simulate", label: "شبیه‌ساز هزینه" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "rates" && <RatesTab />}
      {tab === "zones" && <ZonesTab />}
      {tab === "carriers" && <CarriersTab />}
      {tab === "simulate" && <SimulateTab />}
    </div>
  );
}

// ═══════════════════════════ تعرفه‌ها (ماتریس روش × منطقه) ═══════════════════════════

function RatesTab() {
  const can = usePerm();
  const methods = useSWR<Method[]>("/api/admin/shop-orders/shipping-methods", fetcher);
  const zones = useSWR<Zone[]>("/api/admin/shipping/zones", fetcher);
  const rates = useSWR<Rate[]>("/api/admin/shipping/rates", fetcher);
  const [edit, setEdit] = useState<{ method: Method; zone: Zone; rate: Rate | null } | null>(null);

  if (!methods.data || !zones.data || !rates.data) return <Spinner />;
  const zoneList = zones.data;
  const rateList = rates.data;
  const rateOf = (m: string, z: string) => rateList.find((r) => r.methodId === m && r.zoneId === z) ?? null;
  const shownMethods = methods.data.filter((m) => m.availableAtCheckout);
  const hidden = methods.data.length - shownMethods.length;

  return (
    <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
      {zoneList.length === 0 || shownMethods.length === 0 ? (
        <Empty text="ابتدا منطقه و روش ارسال قابل انتخاب مشتری تعریف کنید" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>روش ارسال</th>
              {zoneList.map((z) => (
                <th key={z.id}>
                  <span className={z.isActive ? "" : "line-through text-gray-400"}>{z.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownMethods.map((m) => (
              <tr key={m.id}>
                <td>
                  <p className="font-bold">{m.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {m.carrier?.name ?? "بدون شرکت حمل"}
                    {!m.isActive && " — غیرفعال"}
                  </p>
                </td>
                {zoneList.map((z) => {
                  const r = rateOf(m.id, z.id);
                  return (
                    <td key={z.id}>
                      <button
                        type="button"
                        disabled={!can("shop.manage")}
                        onClick={() => setEdit({ method: m, zone: z, rate: r })}
                        className={`w-full min-w-[120px] text-right rounded-xl px-2.5 py-2 border text-[11px] ${
                          !r
                            ? "border-dashed border-gray-200 text-gray-400 hover:bg-gray-50"
                            : r.isActive
                              ? "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50"
                              : "border-red-100 bg-red-50/40 text-red-600"
                        }`}
                      >
                        {!r ? (
                          "＋ تعرفه"
                        ) : !r.isActive ? (
                          "ارائه نمی‌شود"
                        ) : (
                          <>
                            <span className="block font-black text-gray-800">
                              {r.baseRial > 0
                                ? `${toman(r.baseRial)} ت${r.stepRial > 0 ? ` تا ${faInt(r.baseWeightGrams)} گرم` : ""}`
                                : "رایگان"}
                            </span>
                            {r.stepRial > 0 && (
                              <span className="block text-gray-500">
                                + {toman(r.stepRial)} ت هر {faInt(r.stepWeightGrams)} گرم
                              </span>
                            )}
                            <span className="block text-gray-500">
                              {FEE_PAYMENT_SHORT[r.feePayment]}
                              {r.valuePercent > 0 && ` · بیمه ${r.valuePercent.toLocaleString("fa-IR")}٪`}
                              {r.freeAboveRial ? ` · رایگان از ${toman(r.freeAboveRial)}` : ""}
                            </span>
                            <span className="block text-gray-400">{eta(r.etaMinDays, r.etaMaxDays)}</span>
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {hidden > 0 && (
        <p className="text-[11px] text-gray-400">
          {faInt(hidden)} روش ارسال «قابل انتخاب مشتری» نیست و فقط هنگام ثبت ارسال در پنل استفاده می‌شود (صفحه‌ی مراجع ارسال).
        </p>
      )}
      {edit && (
        <RateModal
          {...edit}
          onClose={() => {
            setEdit(null);
            void rates.mutate();
            void zones.mutate();
          }}
        />
      )}
    </div>
  );
}

function RateModal({ method, zone, rate, onClose }: { method: Method; zone: Zone; rate: Rate | null; onClose: () => void }) {
  const act = useAction();
  const [f, setF] = useState({
    base: tomanStr(rate?.baseRial ?? 0),
    baseWeight: String(rate?.baseWeightGrams ?? 1000),
    step: tomanStr(rate?.stepRial ?? 0),
    stepWeight: String(rate?.stepWeightGrams ?? 1000),
    valuePercent: String(rate?.valuePercent ?? 0),
    min: tomanStr(rate?.minRial),
    max: tomanStr(rate?.maxRial),
    freeAbove: tomanStr(rate?.freeAboveRial),
    maxWeight: rate?.maxWeightGrams != null ? String(rate.maxWeightGrams) : "",
    maxOrder: tomanStr(rate?.maxOrderRial),
    feePayment: (rate?.feePayment ?? "PREPAID") as FeePayment,
    etaMin: rate?.etaMinDays != null ? String(rate.etaMinDays) : "",
    etaMax: rate?.etaMaxDays != null ? String(rate.etaMaxDays) : "",
    isActive: rate?.isActive ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  // نمونه‌ی محاسبه برای یک مرسوله‌ی ۵۰۰ گرمی به ارزش ۱۰۰ میلیون تومان
  const sample = useMemo(() => {
    const w = 500;
    const value = 1_000_000_000;
    const extra = Math.max(0, w - Number(f.baseWeight || 0));
    const steps = extra > 0 && Number(f.step) > 0 ? Math.ceil(extra / Math.max(1, Number(f.stepWeight || 1))) : 0;
    let fee = tomanToRial(f.base || "0") + steps * tomanToRial(f.step || "0") + (value * Number(f.valuePercent || 0)) / 100;
    if (f.min) fee = Math.max(fee, tomanToRial(f.min));
    if (f.max && tomanToRial(f.max) > 0) fee = Math.min(fee, tomanToRial(f.max));
    return fee;
  }, [f]);

  const save = async () => {
    const body = {
      methodId: method.id,
      zoneId: zone.id,
      baseRial: tomanToRial(f.base || "0"),
      baseWeightGrams: Number(f.baseWeight || 0),
      stepRial: tomanToRial(f.step || "0"),
      stepWeightGrams: Math.max(1, Number(f.stepWeight || 1000)),
      valuePercent: Number(f.valuePercent || 0),
      minRial: optRial(f.min),
      maxRial: optRial(f.max),
      freeAboveRial: optRial(f.freeAbove),
      maxWeightGrams: optInt(f.maxWeight),
      maxOrderRial: optRial(f.maxOrder),
      feePayment: f.feePayment,
      etaMinDays: optInt(f.etaMin),
      etaMaxDays: optInt(f.etaMax),
      isActive: f.isActive,
    };
    if (await act.run(() => api.post("/api/admin/shipping/rates", body))) onClose();
  };
  const remove = async () => {
    if (!rate) return;
    const ok = await act.run(
      () => api.delete(`/api/admin/shipping/rates/${rate.id}`),
      `تعرفه‌ی «${method.name}» در «${zone.name}» حذف شود؟ در این صورت تعرفه‌ی منطقه‌ی کلی‌تر (اگر باشد) ملاک می‌شود.`,
    );
    if (ok) onClose();
  };

  return (
    <Modal title={`تعرفه‌ی ${method.name} — ${zone.name}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="هزینه پایه (تومان)">
            <input value={f.base} onChange={(e) => set("base", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="وزن پایه (گرم)" hint="هزینه پایه تا این وزن">
            <input value={f.baseWeight} onChange={(e) => set("baseWeight", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="هر پله‌ی اضافه (تومان)">
            <input value={f.step} onChange={(e) => set("step", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="اندازه‌ی پله (گرم)">
            <input value={f.stepWeight} onChange={(e) => set("stepWeight", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="بیمه/ارزش (٪ مبلغ اقلام)" hint="مثلاً ۰٫۲">
            <input value={f.valuePercent} onChange={(e) => set("valuePercent", dec(e.target.value))} className={inputCls} inputMode="decimal" />
          </Field>
          <Field label="حداقل هزینه (تومان)">
            <input value={f.min} onChange={(e) => set("min", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="حداکثر هزینه (تومان)">
            <input value={f.max} onChange={(e) => set("max", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="ارسال رایگان از خرید (تومان)" hint="خالی = هرگز">
            <input value={f.freeAbove} onChange={(e) => set("freeAbove", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="سقف وزن مرسوله (گرم)">
            <input value={f.maxWeight} onChange={(e) => set("maxWeight", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="سقف ارزش سفارش (تومان)" hint="مثلاً سقف غرامت پست">
            <input value={f.maxOrder} onChange={(e) => set("maxOrder", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="حداقل زمان تحویل (روز)">
            <input value={f.etaMin} onChange={(e) => set("etaMin", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
          <Field label="حداکثر زمان تحویل (روز)">
            <input value={f.etaMax} onChange={(e) => set("etaMax", num(e.target.value))} className={inputCls} inputMode="numeric" />
          </Field>
        </div>
        <Field label="نحوه‌ی پرداخت هزینه‌ی ارسال">
          <select value={f.feePayment} onChange={(e) => set("feePayment", e.target.value as FeePayment)} className={inputCls}>
            {Object.entries(FEE_PAYMENT_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {f.feePayment !== "PREPAID" && (
          <Alert
            kind="info"
            text="در پس‌کرایه هزینه‌ی ارسال در مبلغ سفارش صفر در نظر گرفته می‌شود و برآورد آن به مشتری و روی فاکتور نمایش داده می‌شود؛ مشتری هنگام تحویل مستقیماً به مأمور پست/حمل پرداخت می‌کند."
          />
        )}
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} className="mt-1" />
          <span>
            <span className="font-bold">این روش در این منطقه ارائه می‌شود</span>
            <span className="block text-gray-400">خاموش = روش برای آدرس‌های این منطقه نمایش داده نمی‌شود (حتی اگر منطقه‌ی کلی‌تر تعرفه داشته باشد)</span>
          </span>
        </label>
        <p className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
          نمونه: مرسوله‌ی ۵۰۰ گرمی به ارزش ۱۰۰ میلیون تومان ≈ <b>{toman(sample)} تومان</b> (پیش از گرد کردن)
        </p>
        {act.error && <Alert kind="error" text={act.error} />}
        <div className="flex gap-2">
          <ActionButton busy={act.busy} onClick={() => void save()}>
            ذخیره تعرفه
          </ActionButton>
          {rate && (
            <ActionButton variant="danger" busy={act.busy} onClick={() => void remove()}>
              <Trash2 className="w-4 h-4" /> حذف تعرفه
            </ActionButton>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ مناطق ═══════════════════════════

function ZonesTab() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<Zone[]>("/api/admin/shipping/zones", fetcher);
  const [edit, setEdit] = useState<Zone | "new" | null>(null);

  return (
    <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
      {can("shop.manage") && (
        <div>
          <ActionButton onClick={() => setEdit("new")}>
            <Plus className="w-4 h-4" /> منطقه‌ی جدید
          </ActionButton>
        </div>
      )}
      {isLoading || !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty text="منطقه‌ای تعریف نشده است" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>نام</th>
              <th>استان‌ها</th>
              <th>شهرها</th>
              <th>تعرفه</th>
              <th>اولویت</th>
              <th>وضعیت</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((z) => (
              <tr key={z.id}>
                <td>
                  <p className="font-bold">{z.name}</p>
                  {z.description && <p className="text-[10px] text-gray-400">{z.description}</p>}
                </td>
                <td className="max-w-xs">{z.provinceNames.length ? z.provinceNames.join("، ") : <span className="text-gray-400">همه‌ی استان‌ها</span>}</td>
                <td className="max-w-xs">{z.cities.length ? z.cities.join("، ") : <span className="text-gray-400">همه</span>}</td>
                <td>{faInt(z.rateCount)}</td>
                <td>{faInt(z.sortOrder)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${z.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {z.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </td>
                <td>
                  {can("shop.manage") && (
                    <button type="button" onClick={() => setEdit(z)} className="text-emerald-700 font-bold text-[12px]">
                      ویرایش
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {edit && (
        <ZoneModal
          zone={edit === "new" ? null : edit}
          onClose={() => {
            setEdit(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function ZoneModal({ zone, onClose }: { zone: Zone | null; onClose: () => void }) {
  const { data: provinces } = useSWR<Province[]>("/api/admin/shipping/provinces", fetcher);
  const act = useAction();
  const [f, setF] = useState({
    name: zone?.name ?? "",
    description: zone?.description ?? "",
    provinceCodes: zone?.provinceCodes ?? [],
    cities: (zone?.cities ?? []).join("، "),
    sortOrder: String(zone?.sortOrder ?? 0),
    isActive: zone?.isActive ?? true,
  });
  const toggle = (code: string) =>
    setF((p) => ({
      ...p,
      provinceCodes: p.provinceCodes.includes(code) ? p.provinceCodes.filter((c) => c !== code) : [...p.provinceCodes, code],
    }));

  const save = async () => {
    const body = {
      name: f.name,
      description: f.description || null,
      provinceCodes: f.provinceCodes,
      cities: f.cities
        .split(/[،,\n]/)
        .map((c) => c.trim())
        .filter(Boolean),
      sortOrder: Number(f.sortOrder) || 0,
      isActive: f.isActive,
    };
    const ok = await act.run(() => (zone ? api.patch(`/api/admin/shipping/zones/${zone.id}`, body) : api.post("/api/admin/shipping/zones", body)));
    if (ok) onClose();
  };
  const remove = async () => {
    if (!zone) return;
    if (await act.run(() => api.delete(`/api/admin/shipping/zones/${zone.id}`), `منطقه‌ی «${zone.name}» و همه‌ی تعرفه‌های آن حذف شود؟`)) onClose();
  };

  return (
    <Modal title={zone ? `ویرایش ${zone.name}` : "منطقه‌ی جدید"} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام منطقه">
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="اولویت (کمتر = مقدم در تساوی دقت)">
            <input value={f.sortOrder} onChange={(e) => setF((p) => ({ ...p, sortOrder: num(e.target.value) }))} className={inputCls} />
          </Field>
        </div>
        <Field label="توضیح">
          <input value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} className={inputCls} />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-bold text-gray-600">
              استان‌ها {f.provinceCodes.length ? `(${faInt(f.provinceCodes.length)})` : "— هیچ = همه‌ی استان‌ها (سایر نقاط کشور)"}
            </span>
            {f.provinceCodes.length > 0 && (
              <button type="button" onClick={() => setF((p) => ({ ...p, provinceCodes: [] }))} className="text-[11px] font-bold text-gray-500">
                پاک کردن
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(provinces ?? []).map((p) => {
              const on = f.provinceCodes.includes(p.code);
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => toggle(p.code)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${on ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 bg-white"}`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="محدود به شهرها (اختیاری)" hint="با «،» یا خط جدید جدا کنید؛ مثلاً «تهران» برای محدوده‌ی پیک درون‌شهری. خالی = همه‌ی شهرهای استان‌های بالا">
          <textarea rows={2} value={f.cities} onChange={(e) => setF((p) => ({ ...p, cities: e.target.value }))} className={inputCls} />
        </Field>
        <label className="flex items-center gap-2 text-[12px] font-bold">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF((p) => ({ ...p, isActive: e.target.checked }))} /> فعال
        </label>
        {act.error && <Alert kind="error" text={act.error} />}
        <div className="flex gap-2">
          <ActionButton busy={act.busy} onClick={() => void save()}>
            ذخیره
          </ActionButton>
          {zone && (
            <ActionButton variant="danger" busy={act.busy} onClick={() => void remove()}>
              <Trash2 className="w-4 h-4" /> حذف منطقه
            </ActionButton>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ شرکت‌های حمل ═══════════════════════════

function CarriersTab() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<Carrier[]>("/api/admin/shipping/carriers", fetcher);
  const [edit, setEdit] = useState<Carrier | "new" | null>(null);

  return (
    <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
      {can("shop.manage") && (
        <div>
          <ActionButton onClick={() => setEdit("new")}>
            <Plus className="w-4 h-4" /> شرکت حمل جدید
          </ActionButton>
        </div>
      )}
      {isLoading || !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty text="شرکت حملی تعریف نشده است" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>نام</th>
              <th>تلفن</th>
              <th>وب‌سایت</th>
              <th>رهگیری</th>
              <th>روش‌ها</th>
              <th>وضعیت</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>
                  <p className="font-bold">{c.name}</p>
                  <p className="text-[10px] text-gray-400" dir="ltr">
                    {c.code}
                  </p>
                </td>
                <td dir="ltr">{c.contactPhone ?? "—"}</td>
                <td dir="ltr" className="max-w-[180px] truncate">
                  {c.website ?? "—"}
                </td>
                <td>{c.trackingUrlTemplate ? "✓" : "—"}</td>
                <td>{faInt(c.methodCount)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${c.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {c.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </td>
                <td>
                  {can("shop.manage") && (
                    <button type="button" onClick={() => setEdit(c)} className="text-emerald-700 font-bold text-[12px]">
                      ویرایش
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-[11px] text-gray-400">روش‌های ارسالِ شرکت غیرفعال به مشتری عرضه نمی‌شوند. اتصال روش به شرکت از صفحه‌ی «مراجع ارسال» انجام می‌شود.</p>
      {edit && (
        <CarrierModal
          carrier={edit === "new" ? null : edit}
          onClose={() => {
            setEdit(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function CarrierModal({ carrier, onClose }: { carrier: Carrier | null; onClose: () => void }) {
  const act = useAction();
  const [f, setF] = useState({
    code: carrier?.code ?? "",
    name: carrier?.name ?? "",
    description: carrier?.description ?? "",
    website: carrier?.website ?? "",
    contactPhone: carrier?.contactPhone ?? "",
    trackingUrlTemplate: carrier?.trackingUrlTemplate ?? "",
    sortOrder: String(carrier?.sortOrder ?? 0),
    isActive: carrier?.isActive ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const body = {
      ...(carrier ? {} : { code: f.code }),
      name: f.name,
      description: f.description || null,
      website: f.website || null,
      contactPhone: f.contactPhone || null,
      trackingUrlTemplate: f.trackingUrlTemplate || null,
      sortOrder: Number(f.sortOrder) || 0,
      isActive: f.isActive,
    };
    const ok = await act.run(() =>
      carrier ? api.patch(`/api/admin/shipping/carriers/${carrier.id}`, body) : api.post("/api/admin/shipping/carriers", body),
    );
    if (ok) onClose();
  };
  const remove = async () => {
    if (!carrier) return;
    if (await act.run(() => api.delete(`/api/admin/shipping/carriers/${carrier.id}`), `شرکت «${carrier.name}» حذف شود؟`)) onClose();
  };

  return (
    <Modal title={carrier ? `ویرایش ${carrier.name}` : "شرکت حمل جدید"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام">
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="کد (انگلیسی)">
            <input value={f.code} disabled={!!carrier} onChange={(e) => set("code", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
          <Field label="تلفن پشتیبانی">
            <input value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
          <Field label="ترتیب نمایش">
            <input value={f.sortOrder} onChange={(e) => set("sortOrder", num(e.target.value))} className={inputCls} />
          </Field>
        </div>
        <Field label="وب‌سایت">
          <input value={f.website} onChange={(e) => set("website", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="نشانی رهگیری پیش‌فرض" hint="با {code}؛ برای روش‌هایی که نشانی رهگیری اختصاصی ندارند">
          <input value={f.trackingUrlTemplate} onChange={(e) => set("trackingUrlTemplate", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="توضیح">
          <input value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
        </Field>
        <label className="flex items-center gap-2 text-[12px] font-bold">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> فعال
        </label>
        {act.error && <Alert kind="error" text={act.error} />}
        <div className="flex gap-2">
          <ActionButton busy={act.busy} onClick={() => void save()}>
            ذخیره
          </ActionButton>
          {carrier && (
            <ActionButton variant="danger" busy={act.busy} onClick={() => void remove()}>
              <Trash2 className="w-4 h-4" /> حذف
            </ActionButton>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ شبیه‌ساز ═══════════════════════════

function SimulateTab() {
  const { data: provinces } = useSWR<Province[]>("/api/admin/shipping/provinces", fetcher);
  const act = useAction();
  const [f, setF] = useState({ provinceCode: "FARS", city: "شیراز", postalCode: "1234567890", weight: "10", value: "50000000" });
  const [result, setResult] = useState<{ enabled: boolean; weightGrams: number; options: SimOption[] } | null>(null);
  const province = provinces?.find((p) => p.code === f.provinceCode);

  const run = async () => {
    let res: { data: typeof result } | undefined;
    const ok = await act.run(async () => {
      res = await api.post("/api/admin/shipping/simulate", {
        provinceCode: f.provinceCode,
        city: f.city || undefined,
        postalCode: f.postalCode || undefined,
        weightGrams: Number(f.weight || 0),
        valueRial: tomanToRial(f.value || "0"),
      });
      return res;
    });
    if (ok && res) setResult(res.data);
  };

  return (
    <div className="rounded-2xl p-4 space-y-4" style={cardStyle}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
        <Field label="استان مقصد">
          <select
            value={f.provinceCode}
            onChange={(e) => setF((p) => ({ ...p, provinceCode: e.target.value, city: provinces?.find((x) => x.code === e.target.value)?.cities[0] ?? "" }))}
            className={inputCls}
          >
            {(provinces ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="شهر">
          <input list="sim-cities" value={f.city} onChange={(e) => setF((p) => ({ ...p, city: e.target.value }))} className={inputCls} />
          <datalist id="sim-cities">
            {province?.cities.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="کد پستی">
          <input value={f.postalCode} onChange={(e) => setF((p) => ({ ...p, postalCode: num(e.target.value).slice(0, 10) }))} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="وزن اقلام (گرم)" hint="وزن بسته‌بندی از تنظیمات افزوده می‌شود">
          <input value={f.weight} onChange={(e) => setF((p) => ({ ...p, weight: dec(e.target.value) }))} className={inputCls} />
        </Field>
        <Field label="ارزش اقلام (تومان)">
          <input value={f.value} onChange={(e) => setF((p) => ({ ...p, value: num(e.target.value) }))} className={inputCls} />
        </Field>
      </div>
      <ActionButton busy={act.busy} onClick={() => void run()}>
        <Calculator className="w-4 h-4" /> محاسبه
      </ActionButton>
      {act.error && <Alert kind="error" text={act.error} />}
      {result && (
        <>
          {!result.enabled && <Alert kind="warn" text="انتخاب روش ارسال هنگام ثبت سفارش در تنظیمات سیستم (shop.shipping.enabled) خاموش است." />}
          <p className="text-[12px] text-gray-500">وزن مرسوله با بسته‌بندی: {faInt(result.weightGrams)} گرم</p>
          {result.options.length === 0 ? (
            <Empty text="برای این مقصد هیچ روش ارسالی تعرفه ندارد" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>روش</th>
                  <th>منطقه‌ی ملاک</th>
                  <th>هزینه‌ی تعرفه</th>
                  <th>دریافتی در سفارش</th>
                  <th>پرداخت</th>
                  <th>زمان تحویل</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {result.options.map((o) => (
                  <tr key={o.methodId}>
                    <td>
                      <p className="font-bold">{o.name}</p>
                      <p className="text-[10px] text-gray-400">{o.carrierName ?? ""}</p>
                    </td>
                    <td>{o.zoneName}</td>
                    <td>{toman(o.feeRial)} ت</td>
                    <td>
                      {o.free ? (
                        <span className="text-emerald-700 font-bold">رایگان (آستانه)</span>
                      ) : (
                        <>
                          {toman(o.charge.shippingRial)} ت
                          {o.chargeOnDelivery && o.feePayment === "CUSTOMER_CHOICE" && (
                            <span className="block text-[10px] text-gray-400">یا ۰ با پس‌کرایه</span>
                          )}
                        </>
                      )}
                    </td>
                    <td>{FEE_PAYMENT_SHORT[o.feePayment]}</td>
                    <td>{eta(o.etaMinDays, o.etaMaxDays)}</td>
                    <td>{o.available ? <span className="text-green-700 font-bold">قابل انتخاب</span> : <span className="text-red-600">{o.unavailableReason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
