"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Headset,
  Landmark,
  Loader2,
  Plus,
  ScanSearch,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import {
  useAddBankAccount,
  useBankAccounts,
  type AddBankAccountResult,
  type BankAccount,
} from "@/app/hooks/useBankAccounts";
import { digitsOnly } from "@/app/utils/digits";
import {
  bankBrand,
  detectBank,
  groupCard,
  groupIban,
  isValidCardNumber,
  type BankBrand,
} from "@/app/utils/banks";

const MAX_CARDS = 5;

// ══════════════════════════════════════════
// نمای کارت بانکی
// ══════════════════════════════════════════
function CardFace({
  brand,
  number,
  ownerName,
  badge,
  dimmed = false,
}: {
  brand: BankBrand;
  /** رشته‌ی نمایشی شماره کارت (با فاصله) */
  number: string;
  ownerName?: string | null;
  badge?: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`relative aspect-[1.586] w-full overflow-hidden rounded-[22px] p-5 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] transition-all ${
        dimmed ? "grayscale-[60%] opacity-80" : ""
      }`}
      style={{
        background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)`,
      }}
    >
      {/* بافت تزئینی */}
      <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-black/10" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.18),transparent_45%)]" />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-white/20 px-2 text-[11px] font-black backdrop-blur">
              {brand.mark}
            </span>
            <span className="text-[14px] font-black drop-shadow-sm">{brand.name}</span>
          </div>
          {badge}
        </div>

        <div className="flex items-center gap-3" dir="ltr">
          {/* تراشه */}
          <div className="relative h-8 w-11 rounded-md bg-gradient-to-br from-amber-200 via-yellow-300 to-amber-500 shadow-inner">
            <div className="absolute inset-x-1 top-1/2 h-px bg-amber-700/40" />
            <div className="absolute inset-y-1 left-1/2 w-px bg-amber-700/40" />
          </div>
          <svg viewBox="0 0 24 24" className="h-6 w-6 opacity-80" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M8.5 7.5a6 6 0 0 1 0 9" strokeLinecap="round" />
            <path d="M12 5a9.5 9.5 0 0 1 0 14" strokeLinecap="round" />
            <path d="M5 10a2.5 2.5 0 0 1 0 4" strokeLinecap="round" />
          </svg>
        </div>

        <div>
          <p
            className="mb-2 text-[19px] font-black tracking-[0.18em] drop-shadow sm:text-[21px]"
            dir="ltr"
          >
            {number}
          </p>
          <div className="flex items-end justify-between gap-2">
            <p className="truncate text-[12px] font-bold text-white/85">
              {ownerName || " "}
            </p>
            <span className="shrink-0 text-[10px] font-bold tracking-widest text-white/60" dir="ltr">
              SHETAB
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: BankAccount["status"] }) {
  if (status === "VERIFIED") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-emerald-700 shadow-sm">
        <BadgeCheck className="h-3.5 w-3.5" /> تأیید شده
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-rose-600 shadow-sm">
        <XCircle className="h-3.5 w-3.5" /> رد شده
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-amber-600 shadow-sm">
      <Clock className="h-3.5 w-3.5 animate-pulse" /> در حال بررسی
    </span>
  );
}

// ══════════════════════════════════════════
// کارت ثبت‌شده + جزئیات حساب
// ══════════════════════════════════════════
function AccountTile({
  account,
  onSetDefault,
  onRemove,
}: {
  account: BankAccount;
  onSetDefault: (id: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<null | "default" | "remove">(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const brand = bankBrand(account.cardBin, account.bankName);
  const brandName =
    account.bankName && account.bankName !== "بانک نامشخص" ? account.bankName : brand.name;
  const number = `${account.cardBin.slice(0, 4)} ${account.cardBin.slice(4, 6)}•• •••• ${account.cardLast4}`;

  const run = async (kind: "default" | "remove") => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === "default") await onSetDefault(account.id);
      else await onRemove(account.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(null);
      setConfirmRemove(false);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-3xl"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="p-3 pb-0">
        <CardFace
          brand={{ ...brand, name: brandName }}
          number={number}
          ownerName={account.ownerName}
          dimmed={account.status === "REJECTED"}
          badge={
            <div className="flex flex-col items-end gap-1.5">
              <StatusPill status={account.status} />
              {account.isDefault && (
                <span className="flex items-center gap-1 rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-black text-amber-900 shadow-sm">
                  <Star className="h-3 w-3 fill-current" /> پیش‌فرض برداشت
                </span>
              )}
            </div>
          }
        />
      </div>

      <div className="space-y-3 p-4">
        <dl className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
          <Detail label="شماره شبا" icon={<Landmark className="h-3.5 w-3.5" />}>
            {account.sheba ? (
              <span dir="ltr" className="font-black tracking-wider text-gray-800">
                {groupIban(account.sheba)}
              </span>
            ) : (
              <span className="text-gray-400">پس از استعلام تکمیل می‌شود</span>
            )}
          </Detail>
          <Detail label="شماره حساب" icon={<CreditCard className="h-3.5 w-3.5" />}>
            {account.accountNumber ? (
              <span dir="ltr" className="font-black text-gray-800">
                {account.accountNumber}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </Detail>
          {account.ownerName && (
            <Detail label="صاحب حساب" icon={<UserRound className="h-3.5 w-3.5" />}>
              <span className="font-bold text-gray-800">{account.ownerName}</span>
            </Detail>
          )}
          {account.depositStatusLabel && (
            <Detail label="وضعیت حساب" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              <span
                className={`font-bold ${
                  account.depositStatus === "02" ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {account.depositStatusLabel}
              </span>
            </Detail>
          )}
        </dl>

        {account.status !== "VERIFIED" && account.statusMessage && (
          <div
            className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] font-medium leading-relaxed ${
              account.status === "REJECTED"
                ? "border-rose-100 bg-rose-50 text-rose-700"
                : "border-amber-100 bg-amber-50 text-amber-800"
            }`}
          >
            {account.status === "REJECTED" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{account.statusMessage}</span>
          </div>
        )}

        {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          {account.isVerified && !account.isDefault && (
            <button
              onClick={() => run("default")}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              {busy === "default" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
              پیش‌فرض برداشت
            </button>
          )}
          <div className="flex-1" />
          {confirmRemove ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-gray-500">حذف شود؟</span>
              <button
                onClick={() => run("remove")}
                disabled={busy !== null}
                className="flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : "بله، حذف"}
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="rounded-xl px-3 py-2 text-[12px] font-bold text-gray-500 hover:bg-gray-100"
              >
                انصراف
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" /> حذف کارت
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "var(--color-bg-page)" }}>
      <dt className="mb-1 flex items-center gap-1 text-[10px] font-bold text-gray-400">
        {icon}
        {label}
      </dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

// ══════════════════════════════════════════
// افزودن کارت: فقط شماره کارت → استعلام → نتیجه
// ══════════════════════════════════════════
const INQUIRY_STEPS = [
  "بررسی تعلق کارت به کد ملی شما",
  "دریافت شماره شبا و اطلاعات حساب از بانک",
  "ثبت کارت در حساب کاربری",
];

function AddCardSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const { loading, error, setError, submit } = useAddBankAccount();
  const [card, setCard] = useState("");
  const [touched, setTouched] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AddBankAccountResult | null>(null);

  const detected = detectBank(card);
  const brand = bankBrand(card);
  const complete = card.length === 16;
  const luhnOk = complete && isValidCardNumber(card);

  // پیشرفت نمایشی مراحل استعلام تا رسیدن پاسخ
  useEffect(() => {
    if (!loading) return;
    const t1 = setTimeout(() => setProgress(1), 1200);
    const t2 = setTimeout(() => setProgress(2), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

  const preview = card.padEnd(16, "•");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!luhnOk) return;
    setProgress(0);
    const res = await submit(card);
    if (res) {
      setResult(res);
      onAdded();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        style={{ backgroundColor: "var(--color-surface)" }}
        dir="rtl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-black text-gray-900">افزودن کارت بانکی</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="بستن"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <AddResult result={result} onClose={onClose} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <CardFace brand={brand} number={groupCard(preview)} />

            {error && <AddError code={error.code} message={error.message} />}

            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-gray-500">شماره کارت ۱۶ رقمی</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="cc-number"
                dir="ltr"
                placeholder="6037 9900 0000 0000"
                value={groupCard(card)}
                disabled={loading}
                onChange={(e) => {
                  setCard(digitsOnly(e.target.value).slice(0, 16));
                  if (error) setError(null);
                }}
                onBlur={() => setTouched(true)}
                className={`w-full rounded-xl border bg-white px-4 py-3.5 text-center text-[18px] font-black tracking-[0.15em] outline-none transition-all focus:border-gold-500 ${
                  touched && complete && !luhnOk ? "border-rose-300" : "border-gray-200"
                }`}
              />
              <div className="min-h-[18px] text-[11px] font-bold">
                {touched && complete && !luhnOk ? (
                  <span className="text-rose-600">شماره کارت معتبر نیست؛ ارقام را دوباره بررسی کنید</span>
                ) : detected ? (
                  <span className="text-emerald-600">✓ {detected.name}</span>
                ) : (
                  <span className="text-gray-400">بانک از روی ۶ رقم اول شناسایی می‌شود</span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="space-y-2 rounded-2xl p-4" style={{ backgroundColor: "var(--color-bg-page)" }}>
                {INQUIRY_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-2.5 text-[12px] font-bold">
                    {i < progress ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : i === progress ? (
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-emerald)" }} />
                    ) : (
                      <span className="h-4 w-4 rounded-full border-2 border-gray-200" />
                    )}
                    <span className={i <= progress ? "text-gray-700" : "text-gray-400"}>{label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5 rounded-2xl p-4 text-[11px] leading-relaxed text-gray-500" style={{ backgroundColor: "var(--color-bg-page)" }}>
                <li className="flex gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  فقط کارتی که به نام خودتان (با کد ملی شما) صادر شده قابل ثبت است.
                </li>
                <li className="flex gap-1.5">
                  <ScanSearch className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  شبا، شماره حساب و نام بانک خودکار از بانک دریافت می‌شود؛ نیازی به وارد کردن آن‌ها نیست.
                </li>
              </ul>
            )}

            <button
              type="submit"
              disabled={loading || !complete}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-black text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> در حال استعلام...
                </>
              ) : (
                <>
                  <ScanSearch className="h-5 w-5" /> استعلام و ثبت کارت
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AddError({ code, message }: { code?: string; message: string }) {
  if (code === "OWNER_MISMATCH" || code === "ACCOUNT_BLOCKED") {
    const mismatch = code === "OWNER_MISMATCH";
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-black">
          <AlertTriangle className="h-4 w-4" />
          {mismatch ? "این کارت به نام شما نیست" : "امکان واریز به این حساب وجود ندارد"}
        </div>
        <p className="mb-3 text-[12px] leading-relaxed">{message}</p>
        <ul className="space-y-1 text-[11px] leading-relaxed text-rose-700/90">
          {mismatch ? (
            <>
              <li>• کارت همسر، والدین یا دیگران قابل ثبت نیست؛ حتی اگر در اختیار شما باشد.</li>
              <li>• اگر کارت به نام خودتان است، شاید با کد ملی دیگری (مثلاً قدیمی) صادر شده؛ با بانک تماس بگیرید.</li>
              <li>• کارت دیگری که به نام خودتان است را امتحان کنید.</li>
            </>
          ) : (
            <>
              <li>• برای رفع مسدودی یا فعال‌سازی حساب راکد به شعبه‌ی بانک مراجعه کنید.</li>
              <li>• یا کارت حساب فعال دیگری که به نام خودتان است وارد کنید.</li>
            </>
          )}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] font-bold leading-relaxed text-red-600">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function AddResult({ result, onClose }: { result: AddBankAccountResult; onClose: () => void }) {
  const ok = result.result === "VERIFIED";
  const acc = result.account;
  return (
    <div className="space-y-4 text-center">
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
          ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
        }`}
      >
        {ok ? <CheckCircle2 className="h-9 w-9" /> : <Clock className="h-9 w-9" />}
      </div>
      <div>
        <h3 className="mb-1 text-[17px] font-black text-gray-900">
          {ok ? "کارت تأیید و ثبت شد" : "کارت ثبت شد و در انتظار بررسی است"}
        </h3>
        <p className="text-[12px] leading-relaxed text-gray-500">{result.message}</p>
      </div>
      {ok && (
        <div className="space-y-2 rounded-2xl p-4 text-right text-[12px]" style={{ backgroundColor: "var(--color-bg-page)" }}>
          <Row label="بانک" value={acc.bankName} />
          {acc.sheba && <Row label="شبا" value={groupIban(acc.sheba)} ltr />}
          {acc.accountNumber && <Row label="شماره حساب" value={acc.accountNumber} ltr />}
          {acc.ownerName && <Row label="صاحب حساب" value={acc.ownerName} />}
        </div>
      )}
      <button
        onClick={onClose}
        className="w-full rounded-xl py-3.5 font-black text-white"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        متوجه شدم
      </button>
    </div>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-bold text-gray-400">{label}</span>
      <span className="truncate font-black text-gray-800" dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════
// صفحه
// ══════════════════════════════════════════
export default function CardsPage() {
  const { accounts, loading, error, refetch, setDefault, remove } = useBankAccounts();
  const [showForm, setShowForm] = useState(false);

  const activeCount = accounts.filter((a) => a.status !== "REJECTED").length;
  const verifiedCount = accounts.filter((a) => a.status === "VERIFIED").length;
  const pendingCount = accounts.filter((a) => a.status === "PENDING_INQUIRY").length;
  const canAdd = activeCount < MAX_CARDS;

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      {/* هدر */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-emerald-light)" }}
          >
            <CreditCard className="h-5 w-5" style={{ color: "var(--color-emerald)" }} />
          </div>
          <div>
            <h1 className="text-[18px] font-black text-gray-900">کارت‌های بانکی</h1>
            <p className="text-[12px] text-gray-400">
              {activeCount.toLocaleString("fa-IR")} از {MAX_CARDS.toLocaleString("fa-IR")} کارت
            </p>
          </div>
        </div>
        {canAdd && accounts.length > 0 && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-all active:scale-95"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Plus className="h-4 w-4" /> افزودن کارت
          </button>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="کل کارت‌ها" value={activeCount} tone="text-gray-800" />
          <Stat label="تأیید شده" value={verifiedCount} tone="text-emerald-600" />
          <Stat label="در حال بررسی" value={pendingCount} tone="text-amber-600" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--color-emerald)" }} />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-[14px] font-bold text-red-500">{error}</div>
      ) : accounts.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {accounts.map((acc) => (
            <AccountTile key={acc.id} account={acc} onSetDefault={setDefault} onRemove={remove} />
          ))}
          {canAdd && (
            <button
              onClick={() => setShowForm(true)}
              className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed text-gray-400 transition-colors hover:border-gold-500 hover:text-gold-600"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
                <Plus className="h-6 w-6" />
              </span>
              <span className="text-[13px] font-bold">افزودن کارت جدید</span>
            </button>
          )}
        </div>
      )}

      <div
        className="flex items-start gap-3 rounded-2xl p-4 text-[12px] leading-relaxed"
        style={{ backgroundColor: "var(--color-gold-50)", border: "1px solid var(--color-gold-100)", color: "var(--color-gold-900)" }}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          برداشت ریالی فقط به کارت‌های تأییدشده‌ی به نام خودتان واریز می‌شود. اگر کارتی «در حال بررسی» است، به‌دلیل
          در دسترس نبودن سامانه‌ی بانکی ثبت شده و پس از استعلام کارشناسان فعال می‌شود.{" "}
          <Link href="/dashboard/support" className="inline-flex items-center gap-1 font-bold underline">
            <Headset className="h-3.5 w-3.5" /> پشتیبانی
          </Link>
        </p>
      </div>

      {showForm && <AddCardSheet onClose={() => setShowForm(false)} onAdded={() => void refetch()} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div
      className="rounded-2xl p-3 text-center"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className={`text-[20px] font-black ${tone}`}>{value.toLocaleString("fa-IR")}</p>
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const sample = bankBrand("603799");
  return (
    <div
      className="grid items-center gap-6 rounded-3xl p-6 md:grid-cols-2"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="mx-auto w-full max-w-sm -rotate-3">
        <CardFace brand={{ ...sample, name: "کارت شما", mark: "AG", from: "#330509", to: "#c5a059" }} number="•••• •••• •••• ••••" />
      </div>
      <div className="space-y-3 text-center md:text-right">
        <h2 className="text-[17px] font-black text-gray-900">هنوز کارتی ثبت نکرده‌اید</h2>
        <p className="text-[13px] leading-relaxed text-gray-500">
          فقط شماره کارت را وارد کنید؛ تعلق کارت به کد ملی شما بررسی و شبا و اطلاعات حساب به‌صورت خودکار تکمیل
          می‌شود.
        </p>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="h-4 w-4" /> افزودن اولین کارت
        </button>
      </div>
    </div>
  );
}
