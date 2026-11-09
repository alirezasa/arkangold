"use client";
// admin/app/(dashboard)/users/[id]/ManageSections.tsx
// بخش‌های مدیریتی پرونده‌ی کاربر: کیف پول (افزایش/کسر تومانی و طلایی)، آدرس‌ها، سقف‌های معاملاتی
// و کنترل حساب (وضعیت و نام). هر بخش بر اساس دسترسی کارشناس فعال یا فقط‌خواندنی است.
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  Wallet,
  Plus,
  Minus,
  MapPin,
  Pencil,
  Trash2,
  Star,
  Gauge,
  UserCog,
  Save,
  X,
  Percent,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { StepUpCancelledError, adminStepUpHeaders } from "@/app/utils/step-up";

// ───────────────────────────── کمکی‌ها ─────────────────────────────

const CARD_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
} as const;

const INPUT =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-emerald-500";

/** ارقام فارسی/عربی به لاتین و حذف جداکننده‌ی هزارگان */
export function toLatinNumber(v: string) {
  return v
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬,،\s]/g, "")
    .replace(/[٫]/g, ".");
}

export function apiError(err: unknown, fallback: string) {
  if (err instanceof StepUpCancelledError) return err.message;
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(msg)) return msg[0] ?? fallback;
    if (msg) return msg;
  }
  return fallback;
}

function useCan(permission: string) {
  const { me } = useAdminMe();
  return me?.permissions.includes(permission) ?? false;
}

function Note({ note }: { note: { ok: boolean; text: string } | null }) {
  if (!note) return null;
  return (
    <p
      className={`mt-3 rounded-xl p-3 text-[12px] font-bold ${
        note.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
      }`}
    >
      {note.text}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function SmsCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold text-gray-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-600"
      />
      {label}
    </label>
  );
}

// ───────────────────────────── کیف پول ─────────────────────────────

const TX_TYPE_LABELS: Record<string, string> = {
  BUY_GOLD: "خرید طلا",
  SELL_GOLD: "فروش طلا",
  BUY_SILVER: "خرید نقره",
  SELL_SILVER: "فروش نقره",
  TRANSFER_IN: "انتقال ورودی",
  TRANSFER_OUT: "انتقال خروجی",
  DEPOSIT: "واریز",
  WITHDRAWAL: "برداشت",
  FEE: "کارمزد",
  TAX: "مالیات",
  SHOP_PURCHASE: "خرید فروشگاه",
  PHYSICAL_DELIVERY: "تحویل فیزیکی",
  REFUND: "بازگشت وجه",
  REFERRAL_REWARD: "پاداش دعوت",
  SALARY: "واریز حقوق",
  MANUAL_ADJUSTMENT: "اصلاح دستی ادمین",
  INSTALLMENT_PURCHASE: "خرید اقساطی",
};

interface TxItem {
  id: string;
  type: string;
  status: string;
  amountGrams: string | null;
  amountToman: string | null;
  description: string | null;
  createdAt: string;
}

const txFetcher = (url: string) =>
  axios.get<{ data: TxItem[]; total: number }>(url).then((r) => r.data);

export function WalletSection({
  userId,
  rialBalance,
  goldBalanceGrams,
  onUpdated,
}: {
  userId: string;
  rialBalance: string | number;
  goldBalanceGrams: string | number;
  onUpdated: () => Promise<unknown>;
}) {
  const canAdjust = useCan("wallet.adjust");
  const canViewTx = useCan("transactions.view");
  const { data: txs, mutate: mutateTx } = useSWR(
    canViewTx ? `/api/admin/transactions?userId=${userId}&limit=8` : null,
    txFetcher,
  );

  const [asset, setAsset] = useState<"RIAL" | "GOLD">("RIAL");
  const [direction, setDirection] = useState<"INC" | "DEC">("INC");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const parsed = Number(toLatinNumber(amount));
  const validAmount =
    Number.isFinite(parsed) &&
    parsed > 0 &&
    (asset === "RIAL" ? Number.isInteger(parsed) : /^\d+(\.\d{1,4})?$/.test(toLatinNumber(amount)));
  const tomanBalance = Number(rialBalance) / 10;
  const goldBalance = Number(goldBalanceGrams);
  const exceeds =
    direction === "DEC" && validAmount && (asset === "RIAL" ? parsed > tomanBalance : parsed > goldBalance);

  const submit = async () => {
    if (!validAmount || description.trim().length < 3) return;
    const sign = direction === "INC" ? 1 : -1;
    const label =
      asset === "RIAL"
        ? `${parsed.toLocaleString("fa-IR")} تومان`
        : `${parsed.toLocaleString("fa-IR", { maximumFractionDigits: 4 })} گرم طلا`;
    if (
      !confirm(
        `${direction === "INC" ? "افزایش" : "کسر"} ${label} ${direction === "INC" ? "به" : "از"} کیف پول کاربر؟\nاین عملیات سند حسابداری ثبت می‌کند.`,
      )
    )
      return;
    setBusy(true);
    setNote(null);
    try {
      const headers = await adminStepUpHeaders("اصلاح دستی موجودی کیف پول");
      const body =
        asset === "RIAL"
          ? { amountRial: sign * Math.round(parsed * 10) }
          : { amountGrams: sign * parsed };
      const { data } = await axios.post(
        `/api/admin/wallets/${userId}/adjust`,
        { ...body, description: description.trim(), notifyUser: notify },
        { headers },
      );
      setNote({ ok: true, text: data?.message ?? "انجام شد" });
      setAmount("");
      setDescription("");
      await Promise.all([onUpdated(), mutateTx()]);
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "اصلاح موجودی انجام نشد") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={CARD_STYLE}>
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-black text-gray-700">
        <Wallet className="h-4 w-4 text-gold-500" />
        کیف پول
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-0.5 text-[10px] text-gray-400">موجودی تومانی</p>
          <p className="text-[14px] font-black text-gray-800">{tomanBalance.toLocaleString("fa-IR")} ت</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-0.5 text-[10px] text-gray-400">موجودی طلا</p>
          <p className="text-[14px] font-black text-gray-800">
            {goldBalance.toLocaleString("fa-IR", { maximumFractionDigits: 4 })} گرم
          </p>
        </div>
      </div>

      {canAdjust && (
        <div className="space-y-3 rounded-xl border border-gray-100 p-3">
          <p className="text-[12px] font-black text-gray-600">افزایش / کاهش موجودی</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex rounded-xl bg-gray-100 p-1 text-[12px] font-bold">
              {(
                [
                  ["RIAL", "تومان"],
                  ["GOLD", "طلا (گرم)"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAsset(k)}
                  className={`flex-1 rounded-lg py-1.5 ${asset === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl bg-gray-100 p-1 text-[12px] font-bold">
              <button
                type="button"
                onClick={() => setDirection("INC")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 ${
                  direction === "INC" ? "bg-emerald-600 text-white" : "text-gray-500"
                }`}
              >
                <Plus className="h-3.5 w-3.5" /> افزایش
              </button>
              <button
                type="button"
                onClick={() => setDirection("DEC")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 ${
                  direction === "DEC" ? "bg-red-600 text-white" : "text-gray-500"
                }`}
              >
                <Minus className="h-3.5 w-3.5" /> کاهش
              </button>
            </div>
          </div>
          <input
            dir="ltr"
            inputMode="decimal"
            placeholder={asset === "RIAL" ? "مبلغ به تومان" : "مقدار به گرم (تا ۴ رقم اعشار)"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={INPUT}
            aria-label="مقدار"
          />
          {amount && !validAmount && (
            <p className="text-[11px] font-bold text-red-600">
              {asset === "RIAL" ? "مبلغ باید عدد صحیح مثبت به تومان باشد" : "مقدار باید مثبت و حداکثر ۴ رقم اعشار باشد"}
            </p>
          )}
          {exceeds && <p className="text-[11px] font-bold text-red-600">مقدار کسر از موجودی فعلی بیشتر است</p>}
          <input
            placeholder="شرح (مثلاً جبران خطای واریز، هدیه‌ی کمپین، ...)"
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT}
            aria-label="شرح"
          />
          <SmsCheckbox checked={notify} onChange={setNotify} label="ارسال پیامک اطلاع‌رسانی به کاربر" />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !validAmount || !!exceeds || description.trim().length < 3}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-black text-white disabled:opacity-50 ${
              direction === "INC" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {direction === "INC" ? "افزایش موجودی" : "کسر از موجودی"}
          </button>
          <p className="text-[10px] leading-5 text-gray-400">
            با کد برنامه‌ی احراز هویت شما تأیید و در گزارش ممیزی و دفاتر حسابداری ثبت می‌شود.
          </p>
        </div>
      )}
      <Note note={note} />

      {canViewTx && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-black text-gray-600">آخرین تراکنش‌ها</p>
            {txs && txs.total > txs.data.length && (
              <Link href="/transactions" className="text-[11px] font-bold text-gray-400 hover:text-gray-600">
                همه‌ی تراکنش‌ها ←
              </Link>
            )}
          </div>
          {!txs ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
          ) : txs.data.length === 0 ? (
            <p className="text-[12px] text-gray-400">تراکنشی ثبت نشده است</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {txs.data.map((t) => {
                const toman = t.amountToman !== null ? Number(t.amountToman) : null;
                const grams = t.amountGrams !== null ? Number(t.amountGrams) : null;
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-2 text-[12px]">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-700">{TX_TYPE_LABELS[t.type] ?? t.type}</p>
                      <p className="truncate text-[10px] text-gray-400" title={t.description ?? undefined}>
                        {new Date(t.createdAt).toLocaleString("fa-IR")}
                        {t.status !== "COMPLETED" ? ` · ${t.status === "PENDING" ? "در انتظار" : "ناموفق"}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-left font-bold" dir="ltr">
                      {toman !== null && toman !== 0 && (
                        <p className={toman < 0 ? "text-red-600" : "text-gray-700"}>
                          {toman.toLocaleString("fa-IR")} ت
                        </p>
                      )}
                      {grams !== null && grams !== 0 && (
                        <p className={grams < 0 ? "text-red-600" : "text-gray-700"}>
                          {grams.toLocaleString("fa-IR", { maximumFractionDigits: 4 })} g
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── آدرس‌ها ─────────────────────────────

interface Province {
  code: string;
  name: string;
  cities: string[];
}

interface AddressItem {
  id: string;
  title: string | null;
  provinceCode: string | null;
  province: string | null;
  city: string | null;
  postalCode: string | null;
  fullAddress: string;
  plaque: string | null;
  unit: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  isDefault: boolean;
  incomplete: boolean;
}

type AddressForm = {
  title: string;
  provinceCode: string;
  city: string;
  postalCode: string;
  fullAddress: string;
  plaque: string;
  unit: string;
  receiverName: string;
  receiverPhone: string;
  isDefault: boolean;
};

const EMPTY_ADDRESS: AddressForm = {
  title: "",
  provinceCode: "",
  city: "",
  postalCode: "",
  fullAddress: "",
  plaque: "",
  unit: "",
  receiverName: "",
  receiverPhone: "",
  isDefault: false,
};

const addressesFetcher = (url: string) =>
  axios.get<{ data: AddressItem[]; provinces: Province[] }>(url).then((r) => r.data);

export function AddressesSection({
  userId,
  defaultReceiverName,
  defaultReceiverPhone,
}: {
  userId: string;
  defaultReceiverName: string;
  defaultReceiverPhone: string;
}) {
  const canManage = useCan("users.manage");
  const { data, mutate, isLoading } = useSWR(`/api/admin/users/${userId}/addresses`, addressesFetcher);
  // null = فرم بسته، "new" = آدرس جدید، شناسه = ویرایش
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_ADDRESS);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof AddressForm>(k: K, v: AddressForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cities = data?.provinces.find((p) => p.code === form.provinceCode)?.cities ?? [];

  const openNew = () => {
    setForm({ ...EMPTY_ADDRESS, receiverName: defaultReceiverName, receiverPhone: defaultReceiverPhone });
    setEditing("new");
    setNote(null);
  };
  const openEdit = (a: AddressItem) => {
    setForm({
      title: a.title ?? "",
      provinceCode: a.provinceCode ?? "",
      city: a.city ?? "",
      postalCode: a.postalCode ?? "",
      fullAddress: a.fullAddress,
      plaque: a.plaque ?? "",
      unit: a.unit ?? "",
      receiverName: a.receiverName ?? "",
      receiverPhone: a.receiverPhone ?? "",
      isDefault: a.isDefault,
    });
    setEditing(a.id);
    setNote(null);
  };

  const save = async () => {
    setBusy("save");
    setNote(null);
    const payload = {
      ...form,
      postalCode: toLatinNumber(form.postalCode),
      receiverPhone: toLatinNumber(form.receiverPhone),
    };
    try {
      if (editing === "new") {
        await axios.post(`/api/admin/users/${userId}/addresses`, payload);
      } else {
        await axios.patch(`/api/admin/users/${userId}/addresses/${editing}`, payload);
      }
      setNote({ ok: true, text: editing === "new" ? "آدرس افزوده شد" : "آدرس ویرایش شد" });
      setEditing(null);
      await mutate();
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "ذخیره‌ی آدرس انجام نشد") });
    } finally {
      setBusy(null);
    }
  };

  const act = async (a: AddressItem, action: "default" | "delete") => {
    if (action === "delete" && !confirm("این آدرس حذف شود؟ (سفارش‌های قبلی که به آن ارسال شده‌اند تغییر نمی‌کنند)"))
      return;
    setBusy(a.id);
    setNote(null);
    try {
      const { data: res } =
        action === "delete"
          ? await axios.delete(`/api/admin/users/${userId}/addresses/${a.id}`)
          : await axios.post(`/api/admin/users/${userId}/addresses/${a.id}/default`);
      setNote({ ok: true, text: res?.message ?? "انجام شد" });
      await mutate();
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "عملیات ناموفق بود") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={CARD_STYLE}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-black text-gray-700">
          <MapPin className="h-4 w-4 text-gold-500" />
          آدرس‌ها
          {data && <span className="text-[11px] font-bold text-gray-400">({data.data.length.toLocaleString("fa-IR")})</span>}
        </h2>
        {canManage && editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-bold text-gray-700"
          >
            <Plus className="h-3.5 w-3.5" /> آدرس جدید
          </button>
        )}
      </div>

      {editing !== null && data && (
        <div className="mb-4 space-y-2 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
          <p className="text-[12px] font-black text-gray-600">{editing === "new" ? "افزودن آدرس" : "ویرایش آدرس"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="عنوان">
              <input className={INPUT} placeholder="مثلاً منزل، محل کار" value={form.title} maxLength={40} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="استان *">
              <select
                className={INPUT}
                value={form.provinceCode}
                onChange={(e) => setForm((f) => ({ ...f, provinceCode: e.target.value, city: "" }))}
              >
                <option value="">انتخاب استان</option>
                {data.provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="شهر *">
              <input className={INPUT} list={`cities-${userId}`} value={form.city} maxLength={60} onChange={(e) => set("city", e.target.value)} />
              <datalist id={`cities-${userId}`}>
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="کد پستی">
              <input
                className={INPUT}
                dir="ltr"
                inputMode="numeric"
                placeholder="۱۰ رقم"
                maxLength={10}
                value={form.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </Field>
          </div>
          <Field label="نشانی کامل *">
            <textarea
              className={INPUT}
              rows={2}
              placeholder="حداقل ۱۰ کاراکتر"
              maxLength={500}
              value={form.fullAddress}
              onChange={(e) => set("fullAddress", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="پلاک">
              <input className={INPUT} maxLength={20} value={form.plaque} onChange={(e) => set("plaque", e.target.value)} />
            </Field>
            <Field label="واحد">
              <input className={INPUT} maxLength={20} value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            </Field>
            <Field label="نام تحویل‌گیرنده *">
              <input className={INPUT} maxLength={80} value={form.receiverName} onChange={(e) => set("receiverName", e.target.value)} />
            </Field>
            <Field label="موبایل تحویل‌گیرنده *">
              <input
                className={INPUT}
                dir="ltr"
                inputMode="tel"
                placeholder="09xxxxxxxxx"
                maxLength={11}
                value={form.receiverPhone}
                onChange={(e) => set("receiverPhone", e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => set("isDefault", e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            آدرس پیش‌فرض
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy === "save"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-black text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              ذخیره
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-xl border border-gray-200 px-4 text-[13px] font-bold text-gray-500"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
      ) : !data?.data.length ? (
        <p className="text-[12px] text-gray-400">آدرسی ثبت نشده است</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.data.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-100 p-3 text-[12px]">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-black text-gray-800">
                  {a.title || "بدون عنوان"}
                  {a.isDefault && <span className="mr-1 text-[10px] font-bold text-amber-600">· پیش‌فرض</span>}
                  {a.incomplete && <span className="mr-1 text-[10px] font-bold text-red-500">· ناقص</span>}
                </p>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    {busy === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    ) : (
                      <>
                        {!a.isDefault && (
                          <button type="button" title="پیش‌فرض شود" onClick={() => void act(a, "default")} className="rounded-lg p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600">
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button type="button" title="ویرایش" onClick={() => openEdit(a)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" title="حذف" onClick={() => void act(a, "delete")} className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="leading-6 text-gray-600">
                {[a.province, a.city].filter(Boolean).join("، ")}
                {a.province || a.city ? " — " : ""}
                {a.fullAddress}
                {a.plaque ? ` · پلاک ${a.plaque}` : ""}
                {a.unit ? ` · واحد ${a.unit}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                کد پستی: <span dir="ltr">{a.postalCode ?? "—"}</span> · تحویل‌گیرنده: {a.receiverName ?? "—"}{" "}
                <span dir="ltr">{a.receiverPhone ?? ""}</span>
              </p>
            </div>
          ))}
        </div>
      )}
      <Note note={note} />
    </div>
  );
}

// ───────────────────────────── سقف‌ها ─────────────────────────────

export interface UserLimits {
  dailyBuyLimitGrams: string;
  dailySellLimitGrams: string;
  monthlyWithdrawLimitRial: string;
  dailyTransferLimitGrams: string;
  physicalDeliveryMinGrams: string;
  physicalDeliveryMaxGrams: string;
}

// فقط سقف‌هایی که برای هر کاربر جداگانه اعمال می‌شوند؛ سقف خرید/فروش/انتقال/برداشت از تنظیمات سیستم است
const LIMIT_ROWS: { key: keyof UserLimits; label: string; unit: "g" | "toman" }[] = [
  { key: "physicalDeliveryMinGrams", label: "حداقل تحویل فیزیکی", unit: "g" },
  { key: "physicalDeliveryMaxGrams", label: "حداکثر تحویل فیزیکی", unit: "g" },
];

const limitToForm = (_k: keyof UserLimits, v: string) => String(Number(v));

export function LimitsSection({
  userId,
  limits,
  onUpdated,
}: {
  userId: string;
  limits: UserLimits | null;
  onUpdated: () => Promise<unknown>;
}) {
  const canManage = useCan("users.manage");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const open = () => {
    setForm(
      Object.fromEntries(LIMIT_ROWS.map((r) => [r.key, limits ? limitToForm(r.key, limits[r.key]) : ""])),
    );
    setEditing(true);
    setNote(null);
  };

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const r of LIMIT_ROWS) {
      const raw = toLatinNumber(form[r.key] ?? "");
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setNote({ ok: false, text: `مقدار «${r.label}» نامعتبر است` });
        return;
      }
      payload[r.key] = r.unit === "toman" ? Math.round(n * 10) : n;
    }
    setBusy(true);
    setNote(null);
    try {
      const { data } = await axios.patch(`/api/admin/users/${userId}/limits`, payload);
      setNote({ ok: true, text: data?.message ?? "ذخیره شد" });
      setEditing(false);
      await onUpdated();
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "ذخیره‌ی سقف‌ها انجام نشد") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={CARD_STYLE}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-black text-gray-700">
          <Gauge className="h-4 w-4 text-gold-500" />
          سقف تحویل فیزیکی
        </h2>
        {canManage && !editing && (
          <button
            type="button"
            onClick={open}
            className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-bold text-gray-700"
          >
            <Pencil className="h-3.5 w-3.5" /> ویرایش
          </button>
        )}
      </div>
      {!limits && !editing ? (
        <p className="text-[12px] text-gray-400">سقف اختصاصی ثبت نشده است</p>
      ) : (
        <div className="space-y-1">
          {LIMIT_ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 border-b border-gray-50 py-1.5 text-[12px]">
              <span className="text-gray-400">{r.label}</span>
              {editing ? (
                <div className="flex items-center gap-1">
                  <input
                    dir="ltr"
                    inputMode="decimal"
                    value={form[r.key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [r.key]: e.target.value }))}
                    className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-[12px] outline-none focus:border-emerald-500"
                    aria-label={r.label}
                  />
                  <span className="w-8 text-[10px] text-gray-400">{r.unit === "g" ? "گرم" : "تومان"}</span>
                </div>
              ) : (
                <span className="font-bold text-gray-700">
                  {limits
                    ? r.unit === "g"
                      ? `${Number(limits[r.key]).toLocaleString("fa-IR", { maximumFractionDigits: 4 })} گرم`
                      : `${(Number(limits[r.key]) / 10).toLocaleString("fa-IR")} ت`
                    : "—"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-black text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            ذخیره
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-gray-200 px-3 text-[12px] font-bold text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <p className="mt-2 text-[10px] leading-5 text-gray-400">
        سقف خرید، فروش، انتقال و برداشت برای همه‌ی کاربران از «تنظیمات سیستم» تعیین می‌شود.
      </p>
      <Note note={note} />
    </div>
  );
}

// ───────────────────────────── کارمزد خرید/فروش ─────────────────────────────

type FeeType = "BUY_GOLD" | "SELL_GOLD";

export type UserFees = {
  type: FeeType;
  feePercent: string;
  /** USER = کارمزد دستی کارشناس؛ SYSTEM = تابع تنظیمات سیستم */
  source: "USER" | "SYSTEM";
  updatedAt: string | null;
  systemFeePercent: string;
}[];

const FEE_LABELS: Record<FeeType, string> = {
  BUY_GOLD: "کارمزد خرید طلا",
  SELL_GOLD: "کارمزد فروش طلا",
};

const faPercent = (v: string | number) =>
  `${Number(v).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;

export function FeesSection({
  userId,
  fees,
  onUpdated,
}: {
  userId: string;
  fees: UserFees | null | undefined;
  onUpdated: () => Promise<unknown>;
}) {
  const canManage = useCan("users.fee.manage");
  const [editing, setEditing] = useState<FeeType | null>(null);
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!fees?.length) return null;

  const send = async (type: FeeType, feePercent: number | null, confirmText: string) => {
    if (!confirm(confirmText)) return;
    setBusy(true);
    setNote(null);
    try {
      const { data } = await axios.patch(`/api/admin/users/${userId}/fees`, { type, feePercent });
      setNote({ ok: true, text: data?.message ?? "انجام شد" });
      setEditing(null);
      await onUpdated();
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "ثبت کارمزد انجام نشد") });
    } finally {
      setBusy(false);
    }
  };

  const save = (type: FeeType, current: string) => {
    const raw = toLatinNumber(percent);
    const p = Number(raw);
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || p > 100) {
      setNote({ ok: false, text: "درصد کارمزد باید بین ۰ تا ۱۰۰ و حداکثر ۲ رقم اعشار باشد" });
      return;
    }
    void send(
      type,
      p,
      `${FEE_LABELS[type]} این کاربر از ${faPercent(current)} به ${faPercent(p)} تغییر کند؟\nاز این پس تغییر تنظیمات سیستم روی این کاربر اثر ندارد.`,
    );
  };

  return (
    <div className="rounded-2xl p-5" style={CARD_STYLE}>
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-black text-gray-700">
        <Percent className="h-4 w-4 text-gold-500" />
        کارمزد معاملات طلا
      </h2>
      <div className="space-y-2">
        {fees.map((f) => {
          const manual = f.source === "USER";
          return (
            <div key={f.type} className="rounded-xl border border-gray-100 p-3 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-gray-700">{FEE_LABELS[f.type]}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="badge"
                    style={manual ? { background: "#fdf4e3", color: "#b07d1e" } : { background: "#f3f4f6", color: "#6b7280" }}
                  >
                    {manual ? "دستی" : "طبق تنظیمات"}
                  </span>
                  <span className="text-[13px] font-black text-gray-800">{faPercent(f.feePercent)}</span>
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-5 text-gray-400">
                {manual
                  ? `کارمزد دستی${f.updatedAt ? ` (${new Date(f.updatedAt).toLocaleString("fa-IR")})` : ""} · تغییر تنظیمات (${faPercent(f.systemFeePercent)}) روی این کاربر اثر ندارد`
                  : "با تغییر تنظیمات سیستم، کارمزد این کاربر هم تغییر می‌کند"}
              </p>

              {editing === f.type ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      dir="ltr"
                      inputMode="decimal"
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                      className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] outline-none focus:border-emerald-500"
                      aria-label={`درصد ${FEE_LABELS[f.type]}`}
                    />
                    <span className="text-[11px] text-gray-400">درصد</span>
                    {Number(percent) !== Number(f.systemFeePercent) && (
                      <button
                        type="button"
                        onClick={() => setPercent(String(Number(f.systemFeePercent)))}
                        className="text-[11px] font-bold text-gray-500 hover:underline"
                      >
                        برابر تنظیمات ({faPercent(f.systemFeePercent)})
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void save(f.type, f.feePercent)}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-[12px] font-black text-white disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      ثبت
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-xl border border-gray-200 px-3 text-[12px] font-bold text-gray-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                canManage && (
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setPercent(String(Number(f.feePercent)));
                        setEditing(f.type);
                        setNote(null);
                      }}
                      className="flex items-center gap-1 text-emerald-700 hover:underline"
                    >
                      <Pencil className="h-3 w-3" /> کم یا زیاد کردن کارمزد
                    </button>
                    {manual && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void send(
                            f.type,
                            null,
                            `کارمزد دستی حذف شود و ${FEE_LABELS[f.type]} این کاربر دوباره طبق تنظیمات (${faPercent(f.systemFeePercent)}) باشد؟`,
                          )
                        }
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        بازگشت به تنظیمات
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-5 text-gray-400">
        کارمزد در هر معامله (هنگام صدور پیش‌فاکتور) بررسی می‌شود: کارمزد دستی کاربر، وگرنه نرخ فعلی تنظیمات. کارمزد
        برداشت و واریز برای همه یکسان و از تنظیمات سیستم است.
      </p>
      <Note note={note} />
    </div>
  );
}

// ───────────────────────────── کنترل حساب ─────────────────────────────

type AccountStatus = "ACTIVE" | "BANNED" | "INACTIVE" | "PENDING_ACTIVATION";

const STATUS_OPTIONS: { value: Exclude<AccountStatus, "PENDING_ACTIVATION">; label: string }[] = [
  { value: "ACTIVE", label: "فعال" },
  { value: "INACTIVE", label: "غیرفعال" },
  { value: "BANNED", label: "مسدود (همه‌ی نشست‌ها بسته می‌شود)" },
];

export function AccountSection({
  userId,
  status,
  firstName,
  lastName,
  identityVerified,
  onUpdated,
}: {
  userId: string;
  status: AccountStatus;
  firstName: string | null;
  lastName: string | null;
  identityVerified: boolean;
  onUpdated: () => Promise<unknown>;
}) {
  const canView = useCan("users.view");
  const canManage = useCan("users.manage");
  // پیش‌نویس‌ها تا وقتی کارشناس چیزی تغییر نداده، مقدار فعلی پرونده را دنبال می‌کنند (null = بدون تغییر)
  const [statusDraft, setStatusDraft] = useState<string | null>(null);
  const [firstDraft, setFirstDraft] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<string | null>(null);
  const nextStatus = statusDraft ?? (status === "PENDING_ACTIVATION" ? "" : status);
  const first = firstDraft ?? firstName ?? "";
  const last = lastDraft ?? lastName ?? "";
  const [busy, setBusy] = useState<null | "status" | "name">(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (!canView) return null;

  const saveStatus = async () => {
    if (!nextStatus || nextStatus === status) return;
    const label = STATUS_OPTIONS.find((o) => o.value === nextStatus)?.label ?? nextStatus;
    if (!confirm(`وضعیت حساب کاربر به «${label}» تغییر کند؟`)) return;
    setBusy("status");
    setNote(null);
    try {
      const { data } = await axios.post(`/api/admin/users/${userId}/status`, { status: nextStatus });
      setNote({ ok: true, text: data?.message ?? "انجام شد" });
      await onUpdated();
      setStatusDraft(null);
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "تغییر وضعیت انجام نشد") });
    } finally {
      setBusy(null);
    }
  };

  const saveName = async () => {
    setBusy("name");
    setNote(null);
    try {
      const { data } = await axios.patch(`/api/admin/users/${userId}/name`, { firstName: first, lastName: last });
      setNote({ ok: true, text: data?.message ?? "انجام شد" });
      await onUpdated();
      setFirstDraft(null);
      setLastDraft(null);
    } catch (err) {
      setNote({ ok: false, text: apiError(err, "ویرایش نام انجام نشد") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={CARD_STYLE}>
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-black text-gray-700">
        <UserCog className="h-4 w-4 text-gold-500" />
        کنترل حساب
      </h2>

      <label className="mb-1 block text-[11px] font-bold text-gray-400">وضعیت حساب</label>
      <div className="flex gap-2">
        <select className={INPUT} value={nextStatus} onChange={(e) => setStatusDraft(e.target.value)} aria-label="وضعیت حساب">
          {status === "PENDING_ACTIVATION" && <option value="">در انتظار فعال‌سازی (حقوقی)</option>}
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void saveStatus()}
          disabled={busy !== null || !nextStatus || nextStatus === status}
          className="shrink-0 rounded-xl px-3 text-[12px] font-black text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {busy === "status" ? <Loader2 className="h-4 w-4 animate-spin" /> : "اعمال"}
        </button>
      </div>

      {canManage && (
        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-bold text-gray-400">نام و نام خانوادگی</label>
          {identityVerified ? (
            <p className="rounded-xl bg-gray-50 p-2.5 text-[11px] leading-5 text-gray-500">
              هویت کاربر از ثبت احوال تأیید شده و نام رسمی او قابل ویرایش دستی نیست.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className={INPUT} placeholder="نام" maxLength={60} value={first} onChange={(e) => setFirstDraft(e.target.value)} />
                <input className={INPUT} placeholder="نام خانوادگی" maxLength={60} value={last} onChange={(e) => setLastDraft(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => void saveName()}
                disabled={busy !== null || (first === (firstName ?? "") && last === (lastName ?? ""))}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-[12px] font-bold text-gray-700 disabled:opacity-40"
              >
                {busy === "name" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                ذخیره‌ی نام
              </button>
            </div>
          )}
        </div>
      )}
      <Note note={note} />
    </div>
  );
}
