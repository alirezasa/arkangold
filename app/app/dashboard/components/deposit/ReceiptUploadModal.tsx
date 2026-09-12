// app/app/dashboard/components/deposit/ReceiptUploadModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { useUploadReceipt } from "@/app/hooks/useDeposits";

const ACCEPT = "image/jpeg,image/jpg,image/png";
const MAX_BYTES = 5 * 1024 * 1024;

export default function ReceiptUploadModal({
  open,
  depositId,
  onClose,
  onUploaded,
}: {
  open: boolean;
  depositId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { upload, loading, progress, error, setError } = useUploadReceipt();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setNote("");
      setError(null);
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
    }
  }, [open, setError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      return setError("فقط تصویر JPG، JPEG یا PNG قابل ارسال است");
    }
    if (f.size > MAX_BYTES) {
      return setError("حجم تصویر نباید بیشتر از ۵ مگابایت باشد");
    }
    setError(null);
    setFile(f);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(f);
    });
  };

  const submit = async () => {
    if (!file || loading) return;
    const ok = await upload(depositId, file, note);
    if (ok) {
      onUploaded();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="ارسال فیش واریزی"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden safe-bottom">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <h2 className="text-[15px] font-black text-white">ارسال فیش واریزی</h2>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="بستن"
            className="text-white/70 hover:text-white disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
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
            disabled={loading}
            className="w-full rounded-2xl border-2 border-dashed border-gray-200 hover:border-gold-500 transition-colors p-6 flex flex-col items-center gap-2 disabled:opacity-50"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="پیش‌نمایش فیش"
                className="max-h-48 rounded-xl object-contain"
              />
            ) : (
              <>
                <span className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                  <ImagePlus className="w-6 h-6" />
                </span>
                <span className="text-[13px] font-bold text-gray-600">
                  جهت افزودن تصویر کلیک کنید
                </span>
                <span className="text-[11px] text-gray-400">
                  فرمت مجاز: JPG, JPEG, PNG — حداکثر ۵ مگابایت
                </span>
              </>
            )}
          </button>

          {file && (
            <p className="text-[11px] text-gray-500 text-center -mt-2">
              {file.name} — برای تعویض، دوباره روی تصویر بزنید
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="receipt-note"
              className="text-[12px] font-bold text-gray-700"
            >
              توضیحات (اختیاری)
            </label>
            <textarea
              id="receipt-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً: واریز از حساب بانک ملت، شعبه ولیعصر"
              className="w-full rounded-xl border border-gray-200 focus:border-gold-500 outline-none px-3 py-2.5 text-[13px] resize-none"
            />
          </div>

          {loading && (
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${progress}%`,
                  backgroundColor: "var(--color-gold-500)",
                }}
              />
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border border-gray-200 text-gray-600 disabled:opacity-40"
            >
              انصراف
            </button>
            <button
              onClick={submit}
              disabled={!file || loading}
              className="flex-[2] py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "ارسال"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
