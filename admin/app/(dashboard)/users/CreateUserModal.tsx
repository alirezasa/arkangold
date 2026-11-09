"use client";
// admin/app/(dashboard)/users/CreateUserModal.tsx
// تعریف کاربر جدید از پنل؛ حساب بدون رمز ساخته می‌شود و کاربر با «فراموشی رمز عبور» (کد پیامکی
// به همین شماره) رمز خود را تعیین می‌کند. ارسال پیامک اطلاع‌رسانی اختیاری است.
import { useState } from "react";
import axios from "axios";
import { CheckCircle2, Loader2, UserPlus, X } from "lucide-react";

const toLatin = (v: string) =>
  v
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");

const INPUT =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-emerald-500";

export interface CreatedUser {
  id: string;
  phone: string;
  message: string;
}

export default function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: CreatedUser) => void;
}) {
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<"REAL" | "LEGAL">("REAL");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyNationalId, setCompanyNationalId] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<
    (CreatedUser & { smsOk: boolean | null }) | null
  >(null);

  const phoneDigits = toLatin(phone);
  const phoneValid = /^09\d{9}$/.test(phoneDigits);
  const companyValid =
    type === "REAL" || /^\d{11}$/.test(toLatin(companyNationalId));

  const submit = async () => {
    if (!phoneValid || !companyValid) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await axios.post("/api/admin/users", {
        phone: phoneDigits,
        type,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        ...(type === "LEGAL"
          ? { companyNationalId: toLatin(companyNationalId) }
          : {}),
        sendSms,
      });
      const smsStatus: string | undefined = data.sms?.status;
      setCreated({
        id: data.id,
        phone: data.phone,
        message: data.message,
        smsOk: smsStatus
          ? smsStatus === "SENT" || smsStatus === "DRY_RUN"
          : null,
      });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] } | undefined)
            ?.message
        : undefined;
      setError((Array.isArray(msg) ? msg[0] : msg) || "ایجاد کاربر انجام نشد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-title"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      {created ? (
        <div
          className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 text-center shadow-xl"
          dir="rtl"
        >
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="text-[14px] font-black text-gray-900">
            {created.message}
          </p>
          <p className="text-[13px] font-bold text-gray-500" dir="ltr">
            {created.phone}
          </p>
          <p
            className={`rounded-xl p-2.5 text-[12px] font-bold ${
              created.smsOk === null
                ? "bg-gray-50 text-gray-500"
                : created.smsOk
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {created.smsOk === null
              ? "پیامکی ارسال نشد (به انتخاب شما)"
              : created.smsOk
                ? "پیامک اطلاع‌رسانی برای کاربر ارسال شد"
                : "پیامک ارسال نشد؛ وضعیت را در گزارش پیامک‌ها بررسی کنید"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCreated(created)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-black text-white"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              مشاهده پرونده کاربر
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 text-[13px] font-bold text-gray-500"
            >
              بستن
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
          dir="rtl"
        >
          <div className="flex items-center justify-between">
            <h2
              id="create-user-title"
              className="flex items-center gap-2 text-[15px] font-black text-gray-900"
            >
              <UserPlus className="h-5 w-5 text-emerald-600" />
              تعریف کاربر جدید
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-gray-500">
              شماره موبایل *
            </label>
            <input
              autoFocus
              dir="ltr"
              inputMode="tel"
              placeholder="09xxxxxxxxx"
              maxLength={13}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT}
            />
            {phone && !phoneValid && (
              <p className="mt-1 text-[11px] font-bold text-red-600">
                شماره باید ۱۱ رقم و با ۰۹ شروع شود
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-gray-500">
              نوع کاربر
            </label>
            <div className="flex rounded-xl bg-gray-100 p-1 text-[12px] font-bold">
              {(
                [
                  ["REAL", "حقیقی"],
                  ["LEGAL", "حقوقی"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  className={`flex-1 rounded-lg py-1.5 ${type === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {type === "LEGAL" && (
            <div>
              <label className="mb-1 block text-[11px] font-bold text-gray-500">
                شناسه ملی شرکت *
              </label>
              <input
                dir="ltr"
                inputMode="numeric"
                maxLength={11}
                placeholder="۱۱ رقم"
                value={companyNationalId}
                onChange={(e) => setCompanyNationalId(e.target.value)}
                className={INPUT}
              />
              <p className="mt-1 text-[10px] text-gray-400">
                حساب حقوقی تا تکمیل مدارک و تأیید پروفایل شرکت در حالت «در
                انتظار فعال‌سازی» می‌ماند.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-bold text-gray-500">
              {type === "LEGAL" ? "نام نماینده (اختیاری)" : "نام (اختیاری)"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="نام"
                maxLength={60}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={INPUT}
              />
              <input
                placeholder="نام خانوادگی"
                maxLength={60}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={INPUT}
              />
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              احراز هویت (کد ملی و تطبیق با ثبت احوال) را خود کاربر در اپلیکیشن
              انجام می‌دهد.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={sendSms}
              onChange={(e) => setSendSms(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span>
              <span className="block text-[12px] font-bold text-gray-700">
                ارسال پیامک به کاربر
              </span>
              <span className="block text-[10px] leading-5 text-gray-500">
                اطلاع ایجاد حساب و راهنمای تعیین رمز با «فراموشی رمز عبور» (متن
                از بخش قالب‌های پیامک قابل ویرایش است)
              </span>
            </span>
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-[12px] font-bold text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !phoneValid || !companyValid}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            ایجاد کاربر
          </button>
        </form>
      )}
    </div>
  );
}
