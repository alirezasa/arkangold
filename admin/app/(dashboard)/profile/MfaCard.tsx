// admin/app/(dashboard)/profile/MfaCard.tsx
// ورود دومرحله‌ای ادمین (اجباری): وضعیت، کدهای بازیابی، جایگزینی برنامه‌ی احراز هویت روی گوشی جدید
// و دستگاه‌های شناخته‌شده (FIA_UAU_EXT.2.3، 3.6 و 2.5). غیرفعال‌سازی برای حساب‌های پنل ممکن نیست؛
// در صورت گم شدن گوشی و کدهای بازیابی، مدیر دیگری از «مدیریت ادمین‌ها» آن را بازنشانی می‌کند.
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { CheckCircle2, Copy, KeyRound, Loader2, MonitorSmartphone, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";

interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  required: boolean;
  devices: { id: string; label: string; lastIp: string | null; lastSeenAt: string }[];
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);
const cardStyle = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" };
const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm text-center font-mono tracking-widest";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

function errorText(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const m = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (m) return Array.isArray(m) ? m[0] : m;
  }
  return fallback;
}

type Mode = "idle" | "regenerate" | "reconfigure" | "scan" | "codes";

export default function MfaCard() {
  const { data, mutate } = useSWR<MfaStatus>("/api/admin-auth/mfa", fetcher);
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (m: Mode) => {
    setMode(m);
    setCode("");
    setError(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, "خطایی رخ داد"));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (mode === "regenerate") {
        const { data: r } = await axios.post("/api/admin-auth/mfa/recovery-codes", { code });
        setCodes(r.recoveryCodes);
        go("codes");
      } else if (mode === "reconfigure") {
        const { data: r } = await axios.post("/api/admin-auth/mfa/reconfigure", { code });
        setSetup(r);
        go("scan");
      } else if (mode === "scan") {
        const { data: r } = await axios.post("/api/admin-auth/mfa/reconfigure/confirm", { code });
        setSetup(null);
        setCodes(r.recoveryCodes);
        go("codes");
      }
      await mutate();
    });

  return (
    <div className="rounded-2xl p-6 space-y-4 max-w-xl" style={cardStyle}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-black text-gray-800 flex items-center gap-2">
          <Smartphone className="w-4 h-4" style={{ color: "var(--color-gold-500)" }} />
          ورود دومرحله‌ای
        </h2>
        {data && (
          <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${data.enabled ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {data.enabled ? "فعال (اجباری)" : "راه‌اندازی نشده"}
          </span>
        )}
      </div>
      <p className="text-[12px] text-gray-500 leading-relaxed">
        ورود به پنل با رمز عبور و کد ۶ رقمی برنامه‌ی احراز هویت انجام می‌شود و قابل غیرفعال‌سازی نیست.
        {data?.enabledAt && <> فعال از {fmt(data.enabledAt)}.</>}
      </p>

      {error && <p className="text-[12px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}

      {data?.enabled && mode === "idle" && (
        <>
          <p className="text-[12px] text-gray-600">
            کدهای بازیابی باقی‌مانده: <b>{data.recoveryCodesRemaining.toLocaleString("fa-IR")}</b>
            {data.recoveryCodesRemaining <= 3 && <span className="text-amber-600 font-bold"> — کدهای جدید بسازید</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => go("regenerate")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-700">
              <KeyRound className="w-3.5 h-3.5" /> کدهای بازیابی جدید
            </button>
            <button type="button" onClick={() => go("reconfigure")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-700">
              <RefreshCw className="w-3.5 h-3.5" /> انتقال به گوشی جدید
            </button>
          </div>
        </>
      )}

      {(mode === "regenerate" || mode === "reconfigure" || mode === "scan") && (
        <div className="space-y-3">
          {mode === "scan" && setup && (
            <>
              <p className="text-[12px] text-gray-600">کد QR را با برنامه‌ی احراز هویت گوشی جدید اسکن کنید:</p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} alt="کد QR برنامه‌ی احراز هویت" className="w-44 h-44 rounded-xl border border-gray-100 bg-white p-2" />
              </div>
              <bdi dir="ltr" className="block text-center font-mono text-[12px] bg-gray-50 rounded-lg p-2 break-all">
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </bdi>
            </>
          )}
          <label className="block text-[12px] font-bold text-gray-500">
            {mode === "scan"
              ? "کد ۶ رقمی برنامه‌ی جدید"
              : "کد ۶ رقمی برنامه‌ی فعلی یا یکی از کدهای بازیابی"}
          </label>
          <input dir="ltr" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || code.trim().length < 6} onClick={submit} className="flex-1 py-2.5 rounded-xl font-black text-white text-[13px] flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: "var(--color-emerald)" }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأیید"}
            </button>
            <button type="button" onClick={() => { setSetup(null); go("idle"); }} className="px-4 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-500">
              انصراف
            </button>
          </div>
        </div>
      )}

      {mode === "codes" && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[13px] font-black text-amber-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> کدهای بازیابی جدید (فقط همین یک‌بار نمایش داده می‌شوند)
          </p>
          <div dir="ltr" className="grid grid-cols-2 gap-2">
            {codes.map((c) => (
              <bdi key={c} className="text-center font-mono text-[13px] font-bold bg-white rounded-lg py-1.5">{c}</bdi>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-300 bg-white text-[12px] font-bold text-amber-800">
              <Copy className="w-3.5 h-3.5" /> کپی
            </button>
            <button type="button" onClick={() => { setCodes([]); go("idle"); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-[12px] font-bold" style={{ backgroundColor: "var(--color-emerald)" }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> ذخیره کردم
            </button>
          </div>
        </div>
      )}

      {data && data.devices.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <p className="text-[12px] font-black text-gray-700 flex items-center gap-1.5">
            <MonitorSmartphone className="w-3.5 h-3.5" /> دستگاه‌های شناخته‌شده
          </p>
          {data.devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-gray-700">{d.label}</span>
              <span className="text-gray-400">
                <bdi dir="ltr">{d.lastIp ?? "—"}</bdi> · {fmt(d.lastSeenAt)}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-gray-400">ورود از دستگاه جدید به موبایل ثبت‌شده‌ی شما پیامک می‌شود.</p>
        </div>
      )}
    </div>
  );
}
