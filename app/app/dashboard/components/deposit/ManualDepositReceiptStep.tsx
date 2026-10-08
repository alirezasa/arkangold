// app/app/dashboard/components/deposit/ManualDepositReceiptStep.tsx
//
// مرحله‌ی پایانی واریز کارت به کارت / حساب به حساب: کاربر پس از انجام واریز، مبلغ و
// تصویر فیش را ارسال می‌کند. فقط در این لحظه درخواست واریز ساخته می‌شود و در صف بررسی
// کارشناس قرار می‌گیرد؛ کیف پول پس از تأیید شارژ و تراکنش ثبت می‌شود.
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import {
  useCreateManualDeposit,
  useUploadReceipt,
} from "@/app/hooks/useDeposits";
import { newIdempotencyKey } from "@/app/utils/idempotency";

const ACCEPT = "image/jpeg,image/jpg,image/png";
const MAX_BYTES = 5 * 1024 * 1024;

const toEnglishDigits = (str: string) =>
  str
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));

export default function ManualDepositReceiptStep({
  method,
  sourceCardId,
  amountRial,
  minAmountRial,
  maxAmountRial,
  onBack,
}: {
  method: "CARD_TO_CARD" | "BANK_TRANSFER";
  sourceCardId: string;
  /** مبلغ ثابت (کارت به کارت)؛ اگر خالی باشد کاربر مبلغ واریزی را وارد می‌کند */
  amountRial?: number;
  minAmountRial?: number;
  maxAmountRial?: number;
  onBack: () => void;
}) {
  const manual = useCreateManualDeposit();
  const receipt = useUploadReceipt();
  // یک کلید برای کل عمر فرم: تلاش مجدد پس از خطای شبکه، درخواست تکراری نمی‌سازد
  const [idempotencyKey] = useState(newIdempotencyKey);
  const inputRef = useRef<HTMLInputElement>(null);

  const [amountToman, setAmountToman] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const busy = manual.loading || receipt.loading;
  const error = localError ?? manual.error ?? receipt.error;

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      return setLocalError("فقط تصویر JPG، JPEG یا PNG قابل ارسال است");
    }
    if (f.size > MAX_BYTES) {
      return setLocalError("حجم تصویر نباید بیشتر از ۵ مگابایت باشد");
    }
    setLocalError(null);
    setFile(f);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(f);
    });
  };

  const resolveAmount = (): number | null => {
    if (amountRial) return amountRial;
    const toman = Number(toEnglishDigits(amountToman).replace(/\D/g, ""));
    if (!toman) {
      setLocalError("مبلغ واریزی را وارد کنید");
      return null;
    }
    const rial = toman * 10;
    if (minAmountRial && rial < minAmountRial) {
      setLocalError(
        `حداقل مبلغ ${(minAmountRial / 10).toLocaleString("fa-IR")} تومان است`,
      );
      return null;
    }
    if (maxAmountRial && rial > maxAmountRial) {
      setLocalError(
        `حداکثر مبلغ ${(maxAmountRial / 10).toLocaleString("fa-IR")} تومان است`,
      );
      return null;
    }
    return rial;
  };

  const submit = async () => {
    if (busy) return;
    setLocalError(null);
    manual.setError(null);
    receipt.setError(null);
    if (!file) return setLocalError("تصویر فیش واریزی را انتخاب کنید");
    const rial = resolveAmount();
    if (!rial) return;

    let id = depositId;
    if (!id) {
      const created = await manual.create({
        method,
        amountRial: rial,
        sourceCardId,
        idempotencyKey,
      });
      if (!created) return;
      id = created.id;
      setDepositId(id);
    }
    const ok = await receipt.upload(id, file, note.trim() || undefined);
    if (ok) setDone(true);
  };

  if (done && depositId) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-[18px] font-black text-gray-900 mb-2">فیش شما ارسال شد</h2>
        <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
          درخواست واریز در صف بررسی قرار گرفت. پس از تطبیق فیش توسط کارشناسان، مبلغ به
          کیف پول شما افزوده و در «تراکنش‌ها» ثبت می‌شود.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href={`/dashboard/wallet/deposits/${depositId}`}
            className="py-3.5 rounded-xl font-black text-white! text-[14px] text-center"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            پیگیری درخواست واریز
          </Link>
          <Link
            href="/dashboard/wallet"
            className="py-3.5 rounded-xl font-bold text-[13px] text-center border border-gray-200 text-gray-600"
          >
            بازگشت به کیف پول
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div>
        <h2 className="text-[14px] font-black text-gray-800 mb-1">ارسال فیش واریزی</h2>
        <p className="text-[12px] text-gray-400 leading-relaxed">
          تا فیش ارسال نشود هیچ درخواستی ثبت نمی‌شود. کیف پول فقط پس از تأیید کارشناس شارژ می‌شود.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {error}
            {depositId && (
              <p className="mt-1 font-medium">
                درخواست ثبت شده است؛ می‌توانید دوباره «ارسال» را بزنید یا از{" "}
                <Link href={`/dashboard/wallet/deposits/${depositId}`} className="underline">
                  صفحه‌ی درخواست
                </Link>{" "}
                فیش را ارسال کنید.
              </p>
            )}
          </div>
        </div>
      )}

      {amountRial ? (
        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <span className="text-[12px] text-gray-500">مبلغ واریزی</span>
          <span className="text-[14px] font-black text-gray-800">
            {(amountRial / 10).toLocaleString("fa-IR")} تومان
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-700">مبلغ واریزشده (تومان)</label>
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={amountToman}
            disabled={!!depositId || busy}
            onChange={(e) => {
              const raw = toEnglishDigits(e.target.value).replace(/\D/g, "");
              setAmountToman(raw ? Number(raw).toLocaleString("fa-IR") : "");
              setLocalError(null);
            }}
            placeholder="دقیقاً مطابق فیش"
            className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[17px] font-black text-gray-800 bg-gray-50 disabled:opacity-60"
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full rounded-2xl border-2 border-dashed border-gray-200 hover:border-gold-500 transition-colors p-6 flex flex-col items-center gap-2 disabled:opacity-50"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="پیش‌نمایش فیش" className="max-h-48 rounded-xl object-contain" />
        ) : (
          <>
            <span className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
              <ImagePlus className="w-6 h-6" />
            </span>
            <span className="text-[13px] font-bold text-gray-600">تصویر فیش / رسید واریز</span>
            <span className="text-[11px] text-gray-400">JPG, JPEG, PNG — حداکثر ۵ مگابایت</span>
          </>
        )}
      </button>

      <div className="space-y-1.5">
        <label htmlFor="manual-deposit-note" className="text-[12px] font-bold text-gray-700">
          شماره پیگیری / توضیحات (اختیاری)
        </label>
        <textarea
          id="manual-deposit-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثلاً: شماره پیگیری ۱۲۳۴۵۶"
          className="w-full rounded-xl border border-gray-200 focus:border-gold-500 outline-none px-3 py-2.5 text-[13px] resize-none"
        />
      </div>

      {receipt.loading && (
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${receipt.progress}%`, backgroundColor: "var(--color-gold-500)" }}
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={busy || !!depositId}
          className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 disabled:opacity-40"
        >
          بازگشت
        </button>
        <button
          onClick={submit}
          disabled={busy || !file}
          className="flex-[2] py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "ثبت واریز و ارسال فیش"}
        </button>
      </div>
    </div>
  );
}
