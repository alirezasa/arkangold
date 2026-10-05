"use client";

// ورود دومرحله‌ای با برنامه‌ی احراز هویت (FIA_UAU_EXT.2.3، FIA_AUX_EXT.1.1، FIA_UAU_EXT.3.6)
// کاربر به‌طور پیش‌فرض با رمز + کد پیامکی وارد می‌شود؛ این بخش روش قوی‌تر (TOTP) را پیشنهاد
// می‌دهد، کدهای بازیابی می‌سازد و امکان ابطال فوری (گم شدن گوشی) را فراهم می‌کند.
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";

interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  devices: { id: string; label: string; lastIp: string | null; lastSeenAt: string }[];
}

interface SetupData {
  secret: string;
  otpauthUri: string;
  qrSvg: string;
}

type Mode = "idle" | "password" | "scan" | "codes" | "disable" | "regenerate";

function msg(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) {
    const m = (e.response?.data as { message?: string | string[] } | undefined)?.message;
    if (m) return Array.isArray(m) ? m[0] : m;
  }
  return fallback;
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium outline-none transition-all focus:border-gold-500";

const fetcher = (url: string) => axios.get<MfaStatus>(url).then((r) => r.data);

export default function TwoFactorCard() {
  const { data: status, mutate } = useSWR<MfaStatus>("/api/auth/mfa", fetcher, {
    revalidateOnFocus: false,
  });
  const [mode, setMode] = useState<Mode>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => mutate();

  const reset = (next: Mode = "idle") => {
    setMode(next);
    setPassword("");
    setCode("");
    setError(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(msg(e, "خطایی رخ داد"));
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const { data } = await axios.post<SetupData>("/api/auth/mfa/setup", { password });
      setSetup(data);
      setPassword("");
      setMode("scan");
    });

  const confirmSetup = () =>
    run(async () => {
      const { data } = await axios.post<{ recoveryCodes: string[] }>("/api/auth/mfa/setup/confirm", {
        code,
      });
      setCodes(data.recoveryCodes);
      setSaved(false);
      setSetup(null);
      setCode("");
      setMode("codes");
      await load();
    });

  const disable = () =>
    run(async () => {
      await axios.post("/api/auth/mfa/disable", { password, code });
      reset();
      setNotice("برنامه‌ی احراز هویت حذف شد. از این پس با رمز عبور و کد پیامکی وارد می‌شوید.");
      await load();
    });

  const regenerate = () =>
    run(async () => {
      const { data } = await axios.post<{ recoveryCodes: string[] }>("/api/auth/mfa/recovery-codes", {
        code,
      });
      setCodes(data.recoveryCodes);
      setSaved(false);
      setCode("");
      setMode("codes");
      await load();
    });

  const downloadCodes = () => {
    const blob = new Blob(
      [
        "کدهای بازیابی ورود دومرحله‌ای آرکان گلد\nهر کد فقط یک‌بار قابل استفاده است.\n\n" +
          codes.join("\n") +
          "\n",
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arkan-gold-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div
      className="space-y-4 rounded-2xl p-5"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-black text-gray-800">
          <Smartphone className="h-4 w-4 text-gold-500" />
          ورود دومرحله‌ای
        </h2>
        {status && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
              status.enabled ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {status.enabled ? "برنامه‌ی احراز هویت فعال" : "کد پیامکی"}
          </span>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-gray-500">
        {status?.enabled
          ? "ورود شما با رمز عبور و کد ۶ رقمی برنامه‌ی احراز هویت انجام می‌شود. اگر به گوشی دسترسی ندارید، از کدهای بازیابی استفاده کنید."
          : "ورود شما با رمز عبور و کد پیامکی انجام می‌شود. برای امنیت بیشتر (در برابر سرقت سیم‌کارت یا رهگیری پیامک)، برنامه‌ی احراز هویت مثل Google Authenticator یا Microsoft Authenticator را فعال کنید."}
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 p-3 text-sm font-bold text-green-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {/* فعال‌سازی: ۱) رمز فعلی */}
      {!status?.enabled && mode === "idle" && (
        <button
          type="button"
          onClick={() => reset("password")}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <ShieldCheck className="h-4 w-4" />
          فعال‌سازی برنامه‌ی احراز هویت
        </button>
      )}
      {mode === "password" && (
        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-500">برای ادامه رمز عبور فعلی را وارد کنید</label>
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !password}
              onClick={startSetup}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ادامه"}
            </button>
            <button type="button" onClick={() => reset()} className="rounded-xl border border-gray-200 px-4 text-[13px] font-bold text-gray-500">
              انصراف
            </button>
          </div>
        </div>
      )}

      {/* ۲) اسکن QR و تأیید کد */}
      {mode === "scan" && setup && (
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-gray-600">
            ۱. در برنامه‌ی احراز هویت گزینه‌ی افزودن حساب را بزنید و این کد QR را اسکن کنید.
          </p>
          <div className="flex justify-center">
            {/* SVG تولیدشده توسط سرور خودمان؛ به‌صورت تصویر نمایش داده می‌شود (بدون اجرای اسکریپت) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
              alt="کد QR راه‌اندازی برنامه‌ی احراز هویت"
              className="h-48 w-48 rounded-xl border border-gray-100 bg-white p-2"
            />
          </div>
          <p className="text-[11px] text-gray-500">
            اگر اسکن ممکن نیست، این کلید را دستی وارد کنید:
          </p>
          <bdi dir="ltr" className="block break-all rounded-lg bg-gray-50 p-2 text-center font-mono text-[12px] tracking-wider text-gray-700">
            {setup.secret.match(/.{1,4}/g)?.join(" ")}
          </bdi>
          <label className="block text-xs font-bold text-gray-500">
            ۲. کد ۶ رقمی که برنامه نشان می‌دهد را وارد کنید
          </label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d۰-۹]/g, ""))}
            className={`${inputCls} text-center font-mono text-lg tracking-[0.4em]`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || code.length < 6}
              onClick={confirmSetup}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأیید و فعال‌سازی"}
            </button>
            <button type="button" onClick={() => { setSetup(null); reset(); }} className="rounded-xl border border-gray-200 px-4 text-[13px] font-bold text-gray-500">
              انصراف
            </button>
          </div>
        </div>
      )}

      {/* ۳) نمایش یک‌باره‌ی کدهای بازیابی */}
      {mode === "codes" && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-[13px] font-black text-amber-800">
            <KeyRound className="h-4 w-4" />
            کدهای بازیابی (فقط همین یک‌بار نمایش داده می‌شوند)
          </p>
          <p className="text-[11px] leading-relaxed text-amber-800">
            اگر گوشی را گم کنید، با هر یک از این کدها یک‌بار می‌توانید وارد شوید. آن‌ها را در جای امنی
            (مثلاً مدیر رمز عبور) نگه دارید.
          </p>
          <div dir="ltr" className="grid grid-cols-2 gap-2">
            {codes.map((c) => (
              <bdi key={c} className="rounded-lg bg-white py-1.5 text-center font-mono text-[13px] font-bold text-gray-800">
                {c}
              </bdi>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white py-2 text-[12px] font-bold text-amber-800">
              <Copy className="h-3.5 w-3.5" /> کپی
            </button>
            <button type="button" onClick={downloadCodes} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white py-2 text-[12px] font-bold text-amber-800">
              <Download className="h-3.5 w-3.5" /> دانلود فایل
            </button>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-bold text-amber-900">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            کدها را در جای امنی ذخیره کردم
          </label>
          <button
            type="button"
            disabled={!saved}
            onClick={() => { setCodes([]); reset(); setNotice("ورود دومرحله‌ای با برنامه‌ی احراز هویت فعال است."); }}
            className="w-full rounded-xl py-2.5 text-[13px] font-black text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            پایان
          </button>
        </div>
      )}

      {/* حالت فعال: کدهای بازیابی و ابطال */}
      {status?.enabled && mode === "idle" && (
        <div className="space-y-2">
          <p className="text-[12px] text-gray-500">
            کدهای بازیابی باقی‌مانده: <b className="text-gray-800">{status.recoveryCodesRemaining.toLocaleString("fa-IR")}</b>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => reset("regenerate")} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-bold text-gray-700">
              <KeyRound className="h-3.5 w-3.5" /> ساخت کدهای بازیابی جدید
            </button>
            <button type="button" onClick={() => reset("disable")} className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-600">
              <ShieldOff className="h-3.5 w-3.5" /> حذف برنامه (گم شدن گوشی)
            </button>
          </div>
        </div>
      )}
      {(mode === "disable" || mode === "regenerate") && (
        <div className="space-y-3">
          {mode === "disable" && (
            <>
              <label className="text-xs font-bold text-gray-500">رمز عبور فعلی</label>
              <input type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </>
          )}
          <label className="block text-xs font-bold text-gray-500">کد برنامه‌ی احراز هویت یا یکی از کدهای بازیابی</label>
          <input dir="ltr" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputCls} text-center font-mono tracking-widest`} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || code.length < 6 || (mode === "disable" && !password)}
              onClick={mode === "disable" ? disable : regenerate}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-60 ${mode === "disable" ? "bg-red-600" : ""}`}
              style={mode === "disable" ? undefined : { backgroundColor: "var(--color-emerald)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "disable" ? "حذف برنامه‌ی احراز هویت" : "ساخت کدهای جدید"}
            </button>
            <button type="button" onClick={() => reset()} className="rounded-xl border border-gray-200 px-4 text-[13px] font-bold text-gray-500">
              انصراف
            </button>
          </div>
          {mode === "disable" && (
            <p className="text-[11px] leading-relaxed text-gray-400">
              به کد و کدهای بازیابی دسترسی ندارید؟ با پشتیبانی تماس بگیرید؛ پس از احراز هویت مجدد (مانند
              زمان ثبت‌نام) برنامه‌ی احراز هویت حساب شما باطل می‌شود.
            </p>
          )}
        </div>
      )}

      {/* دستگاه‌های شناخته‌شده */}
      {status && status.devices.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <p className="flex items-center gap-1.5 text-[12px] font-black text-gray-700">
            <MonitorSmartphone className="h-3.5 w-3.5 text-gold-500" />
            دستگاه‌هایی که با آن‌ها وارد شده‌اید
          </p>
          {status.devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-gray-700">{d.label}</span>
              <span className="text-gray-400">
                <bdi dir="ltr">{d.lastIp ?? "—"}</bdi> · {fmt(d.lastSeenAt)}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-gray-400">
            ورود از دستگاه جدید با پیامک به شما اطلاع داده می‌شود.
          </p>
        </div>
      )}
    </div>
  );
}
