// admin/app/(dashboard)/agent-portal/purchase/page.tsx
//
// خرید شمش از شرکت (بیع قطعی): فهرست قیمت لحظه‌ای نمایندگی، ثبت سفارش با قفل قیمت و پرداخت
// از کیف پول، درگاه، واریز بانکی با پیش‌فاکتور یا خرید اعتباری (در صورت مجوز). پس از تأیید،
// صورتحساب به نام نماینده و حواله‌ی تحویل صادر می‌شود.
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Minus, Plus, RefreshCw, ShoppingBag } from "lucide-react";
import {
  Alert,
  Badge,
  Empty,
  Field,
  Pagination,
  PURITY_FA,
  Spinner,
  cardStyle,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
} from "@/app/components/agents/ui";
import { PAYMENT_METHODS, PURCHASE_STATUS, type PricedItem, type PurchaseOrder } from "@/app/components/agents/trading";

interface PriceList {
  items: PricedItem[];
  priceLockMinutes: number;
  gatewayMaxRial: string;
  generatedAt: string;
}

interface Summary {
  agent: { status: string; creditPurchaseEnabled: boolean };
  wallet: { availableRial: string };
  creditLimitRial: string | null;
  availableCreditRial: string | null;
}

export default function AgentPurchasePage() {
  const router = useRouter();
  const { data: prices, mutate: refreshPrices, isLoading } = useSWR<PriceList>("/api/agent-portal/price-list", fetcher, {
    refreshInterval: 60_000,
  });
  const { data: summary } = useSWR<Summary>("/api/agent-portal/summary", fetcher);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]["key"]>("WALLET");
  const [gateway, setGateway] = useState<"ZARINPAL" | "BEHPARDAKHT">("ZARINPAL");
  const [delivery, setDelivery] = useState<"IN_PERSON" | "SHIPPING">("IN_PERSON");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data: orders } = useSWR<{ data: PurchaseOrder[]; page: number; totalPages: number }>(
    `/api/agent-portal/purchase-orders?page=${page}&limit=10`,
    fetcher,
  );

  const lines = useMemo(
    () => (prices?.items ?? []).filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ ...i, quantity: qty[i.id] })),
    [prices, qty],
  );
  const total = lines.reduce((s, l) => s + Number(l.unitPriceRial) * l.quantity, 0);
  const grams = lines.reduce((s, l) => s + Number(l.weightGrams) * l.quantity, 0);
  const available = Number(summary?.wallet.availableRial ?? 0);
  const gatewayMax = Number(prices?.gatewayMaxRial ?? 0);
  const methods = PAYMENT_METHODS.filter((m) => m.key !== "CREDIT" || summary?.agent.creditPurchaseEnabled);

  const setQ = (id: string, v: number, max: number | null) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(v, max ?? 1000)) }));

  const submit = async () => {
    setError(null);
    if (!lines.length) return setError("حداقل یک قلم انتخاب کنید");
    setBusy(true);
    try {
      const { data } = await axios.post("/api/agent-portal/purchase-orders", {
        items: lines.map((l) => ({ priceItemId: l.id, quantity: l.quantity })),
        paymentMethod: method,
        gateway: method === "GATEWAY" ? gateway : undefined,
        deliveryMethod: delivery,
        deliveryAddress: delivery === "SHIPPING" ? address : undefined,
        note: note || undefined,
      });
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      router.push(`/agent-portal/purchase/${data.order.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "ثبت سفارش ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };

  const active = summary?.agent.status === "ACTIVE";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" /> خرید شمش از شرکت
          </h1>
          <p className="text-[12px] text-gray-400 mt-1">
            هر سفارش یک خرید قطعی است. قیمت پس از ثبت فقط {faNum(prices?.priceLockMinutes ?? 15)} دقیقه معتبر است و باید در همین مهلت پرداخت
            (یا مشخصات واریز بانکی ثبت) شود؛ در غیر این صورت سفارش خودبه‌خود لغو می‌شود.
          </p>
        </div>
        <button type="button" onClick={() => refreshPrices()} className={secondaryBtn}>
          <RefreshCw className="w-4 h-4" /> به‌روزرسانی قیمت
        </button>
      </div>

      {summary && !active && <Alert kind="warn" text="حساب نمایندگی شما فعال نیست و امکان ثبت سفارش ندارد." />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl p-4" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800 mb-3">فهرست قیمت نمایندگی</h2>
          {isLoading || !prices ? (
            <Spinner />
          ) : !prices.items.length ? (
            <Empty text="فهرست قیمت هنوز توسط شرکت تعریف نشده است" />
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table w-full min-w-[620px]">
                <thead>
                  <tr>
                    <th>شمش</th>
                    <th>قیمت نمایندگی (تومان)</th>
                    <th>سقف قیمت مصرف‌کننده</th>
                    <th>تعداد</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <p className="font-black">{i.title}</p>
                        <p className="text-[11px] text-gray-400">
                          {faNum(i.weightGrams, 4)} گرم — {PURITY_FA[i.purityKarat]}
                        </p>
                      </td>
                      <td>
                        <p className="font-black">{toman(i.unitPriceRial)}</p>
                        <p className="text-[10px] text-gray-400">
                          طلا {toman(i.unitGoldValueRial)} + اجرت {toman(i.unitPremiumRial)}
                        </p>
                      </td>
                      <td className="text-[12px] text-gray-600">{toman(i.consumerMaxPriceRial)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button type="button" className="p-1.5 rounded-lg border border-gray-200" onClick={() => setQ(i.id, (qty[i.id] ?? 0) - 1, i.maxPerOrder)} aria-label="کم کردن">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            className="w-12 text-center rounded-lg border border-gray-200 py-1 text-[13px] font-black"
                            inputMode="numeric"
                            value={qty[i.id] ?? 0}
                            onChange={(e) => setQ(i.id, Number(e.target.value.replace(/\D/g, "")) || 0, i.maxPerOrder)}
                          />
                          <button type="button" className="p-1.5 rounded-lg border border-gray-200" onClick={() => setQ(i.id, (qty[i.id] ?? 0) + 1, i.maxPerOrder)} aria-label="افزودن">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-gray-400 mt-2">
                قیمت‌ها لحظه‌ای است ({faDateTime(prices.generatedAt)}). سقف قیمت مصرف‌کننده حداکثر قیمتی است که می‌توانید به مشتری بفروشید
                (بند ۸-۳ قرارداد).
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4 space-y-3 h-fit" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800">ثبت سفارش</h2>
          <div className="rounded-xl bg-gray-50 p-3 text-[12px] space-y-1">
            <p>
              تعداد: <b>{faNum(lines.reduce((s, l) => s + l.quantity, 0))}</b> شمش — {faNum(grams, 4)} گرم
            </p>
            <p className="text-[15px] font-black">مبلغ قابل پرداخت: {toman(total)} تومان</p>
            <p className="text-gray-500">موجودی کیف پول: {toman(available)} تومان</p>
          </div>

          <div className="space-y-2">
            {methods.map((m) => (
              <label key={m.key} className={`flex items-start gap-2 p-2.5 rounded-xl border-2 cursor-pointer ${method === m.key ? "border-emerald-700 bg-emerald-50" : "border-gray-100"}`}>
                <input type="radio" className="mt-1" checked={method === m.key} onChange={() => setMethod(m.key)} />
                <span>
                  <span className="block text-[12px] font-black text-gray-800">{m.label}</span>
                  <span className="block text-[10px] text-gray-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {method === "WALLET" && total > available && (
            <Alert kind="warn" text="موجودی کیف پول کافی نیست؛ ابتدا کیف پول را شارژ کنید یا روش درگاه را انتخاب کنید." />
          )}
          {method === "GATEWAY" && (
            <>
              <Field label="درگاه">
                <select className={inputCls} value={gateway} onChange={(e) => setGateway(e.target.value as "ZARINPAL" | "BEHPARDAKHT")}>
                  <option value="ZARINPAL">زرین‌پال</option>
                  <option value="BEHPARDAKHT">به‌پرداخت ملت</option>
                </select>
              </Field>
              {gatewayMax > 0 && total - available > gatewayMax && (
                <Alert kind="warn" text={`مبلغ قابل پرداخت از سقف درگاه (${toman(gatewayMax)} تومان) بیشتر است؛ واریز بانکی با پیش‌فاکتور را انتخاب کنید.`} />
              )}
            </>
          )}
          {method === "CREDIT" && summary?.availableCreditRial != null && (
            <p className="text-[11px] text-gray-500">اعتبار باقی‌مانده: {toman(summary.availableCreditRial)} تومان</p>
          )}

          <Field label="روش تحویل">
            <select className={inputCls} value={delivery} onChange={(e) => setDelivery(e.target.value as "IN_PERSON" | "SHIPPING")}>
              <option value="IN_PERSON">تحویل حضوری در محل شرکت</option>
              <option value="SHIPPING">ارسال (هزینه و ریسک حمل طبق قرارداد)</option>
            </select>
          </Field>
          {delivery === "SHIPPING" && (
            <Field label="نشانی تحویل">
              <textarea className={inputCls} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          )}
          <Field label="توضیحات (اختیاری)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <Alert kind="error" text={error} />}
          <button type="button" disabled={busy || !active || !lines.length} onClick={submit} className={`${primaryBtn} w-full`} style={primaryBtnStyle}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "ثبت سفارش و قفل قیمت"}
          </button>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            با ثبت سفارش، خرید قطعی طبق قرارداد نمایندگی انجام می‌شود و پس از پرداخت، نوسان قیمت طلا در مبلغ معامله اثری ندارد (بند ۴-۳).
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 mb-3">سفارش‌های من</h2>
        {!orders?.data.length ? (
          <Empty text="هنوز سفارشی ثبت نکرده‌اید" />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[640px]">
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>تاریخ</th>
                  <th>اقلام</th>
                  <th>مبلغ (تومان)</th>
                  <th>پرداخت</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.map((o) => (
                  <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/agent-portal/purchase/${o.id}`)}>
                    <td className="font-bold" dir="ltr">
                      <Link href={`/agent-portal/purchase/${o.id}`}>{o.orderNumber}</Link>
                    </td>
                    <td className="text-[11px] text-gray-500">{faDateTime(o.createdAt)}</td>
                    <td className="text-[12px]">{o.items.map((i) => `${faNum(i.quantity)}× ${i.title}`).join("، ")}</td>
                    <td className="font-black">{toman(o.totalRial)}</td>
                    <td className="text-[11px]">{o.paymentMethodLabel}</td>
                    <td>
                      <Badge map={PURCHASE_STATUS} value={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orders && <Pagination page={orders.page} totalPages={orders.totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}
