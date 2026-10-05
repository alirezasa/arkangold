// admin/app/login/LoginSteps.tsx
// مراحل پس از عامل اول در ورود پنل (FIA_UAU_EXT.2.3 و FIA_UID_EXT.1.1):
//   CHANGE_PASSWORD → تغییر اجباری رمز موقتی که سیستم پیامک کرده است
//   MFA_SETUP       → راه‌اندازی اجباری برنامه‌ی احراز هویت + نمایش یک‌باره‌ی کدهای بازیابی
//   MFA_VERIFY      → کد ۶ رقمی برنامه یا یکی از کدهای بازیابی
// نشست فقط پس از آخرین مرحله ثبت می‌شود.
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Smartphone,
} from "lucide-react";

export interface LoginStep {
  next: "CHANGE_PASSWORD" | "MFA_SETUP" | "MFA_VERIFY";
  challengeToken: string;
  minPasswordLength?: number;
  message?: string;
}

interface SetupData {
  secret: string;
  qrSvg: string;
}

const inputClass =
  "w-full px-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none transition-all text-base font-medium text-left focus:border-gold-500";
const submitClass =
  "w-full py-4 mt-2 rounded-2xl font-black text-lg text-white shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-60";
const submitStyle = { backgroundColor: "var(--color-emerald)", boxShadow: "0 8px 20px rgba(51,5,9,.25)" };

const faNum = (n: number) => n.toLocaleString("fa-IR");

function errorText(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const m = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (m) return Array.isArray(m) ? m[0] : m;
  }
  return fallback;
}

export default function LoginSteps({
  initial,
  onRestart,
  home,
}: {
  initial: LoginStep;
  onRestart: () => void;
  home: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  const post = (path: string, body: Record<string, unknown>) =>
    axios.post(`/api/admin-auth/login/step/${path}`, { challengeToken: step.challengeToken, ...body });

  const fail = (err: unknown, fallback: string) => {
    const message = errorText(err, fallback);
    setError(message);
    // مهلت یا تلاش‌های مرحله تمام شده → بازگشت به ابتدای ورود
    if (/دوباره وارد شوید/.test(message)) setTimeout(onRestart, 1500);
  };

  // دریافت QR در مرحله‌ی راه‌اندازی
  useEffect(() => {
    if (step.next !== "MFA_SETUP" || setup) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await post("mfa-setup", {});
        if (!cancelled) setSetup(data);
      } catch (err) {
        if (!cancelled) fail(err, "راه‌اندازی برنامه‌ی احراز هویت ممکن نشد");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.next]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const min = step.minPasswordLength ?? 15;
    if ([...password].length < min) return setError(`رمز عبور باید حداقل ${faNum(min)} کاراکتر باشد`);
    if (password !== confirm) return setError("تکرار رمز عبور مطابقت ندارد");
    setLoading(true);
    setError(null);
    try {
      const { data } = await post("change-password", { newPassword: password });
      setPassword("");
      setConfirm("");
      setStep(data as LoginStep);
    } catch (err) {
      fail(err, "تغییر رمز ممکن نشد");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!useRecovery && !/^[\d۰-۹]{6}$/.test(value)) return setError("کد ۶ رقمی را کامل وارد کنید");
    if (useRecovery && value.replace(/[^A-Za-z0-9]/g, "").length < 10)
      return setError("کد بازیابی ۱۰ کاراکتری را کامل وارد کنید");
    setLoading(true);
    setError(null);
    try {
      if (step.next === "MFA_SETUP") {
        const { data } = await post("mfa-setup/confirm", { code: value });
        setRecoveryCodes(data.recoveryCodes ?? []);
      } else {
        await post("mfa", { code: value });
        router.replace(home);
      }
    } catch (err) {
      setCode("");
      fail(err, "کد نادرست است");
    } finally {
      setLoading(false);
    }
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob(
      ["کدهای بازیابی ورود دومرحله‌ای پنل آرکان گلد\nهر کد فقط یک‌بار قابل استفاده است.\n\n" + recoveryCodes.join("\n") + "\n"],
      { type: "text/plain;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arkan-panel-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const header = (icon: React.ReactNode, title: string, text?: string) => (
    <div className="text-center space-y-2 mb-5">
      <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--color-gold-50)" }}>
        {icon}
      </div>
      <p className="font-black text-gray-900">{title}</p>
      {text && <p className="text-[13px] text-gray-500 leading-relaxed">{text}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-start gap-3 text-sm font-bold">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      {/* تغییر اجباری رمز موقت */}
      {step.next === "CHANGE_PASSWORD" && (
        <form onSubmit={submitPassword} className="space-y-4">
          {header(
            <Lock className="w-6 h-6" style={{ color: "var(--color-emerald)" }} />,
            "تعیین رمز عبور جدید",
            step.message,
          )}
          <div className="relative flex items-center">
            <input
              type={show ? "text" : "password"}
              dir="ltr"
              autoComplete="new-password"
              maxLength={128}
              placeholder="رمز عبور جدید"
              aria-label="رمز عبور جدید"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className={`${inputClass} pl-12`}
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute left-4 text-gray-400" aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"}>
              {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <input
            type={show ? "text" : "password"}
            dir="ltr"
            autoComplete="new-password"
            maxLength={128}
            placeholder="تکرار رمز عبور جدید"
            aria-label="تکرار رمز عبور جدید"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            className={inputClass}
          />
          <p className="text-[11px] text-gray-500 leading-5">
            حداقل {faNum(step.minPasswordLength ?? 15)} و حداکثر ۱۲۸ کاراکتر؛ نیازی به عدد یا نماد نیست. عبارت عبور طولانی
            (حتی فارسی) یا رمز تولیدشده‌ی مدیر رمز عبور بهترین انتخاب است. رمزهای رایج/افشاشده و رمزهای ساخته‌شده از
            نام، نام کاربری یا نام برنامه پذیرفته نمی‌شوند.
          </p>
          <button type="submit" disabled={loading} className={submitClass} style={submitStyle}>
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "ثبت رمز و ادامه"}
          </button>
        </form>
      )}

      {/* راه‌اندازی برنامه‌ی احراز هویت */}
      {step.next === "MFA_SETUP" && !recoveryCodes && (
        <form onSubmit={submitCode} className="space-y-4">
          {header(
            <Smartphone className="w-6 h-6" style={{ color: "var(--color-emerald)" }} />,
            "راه‌اندازی ورود دومرحله‌ای (اجباری)",
            "در برنامه‌ی احراز هویت (Google Authenticator، Microsoft Authenticator یا مشابه) این کد QR را اسکن کنید و کد ۶ رقمی را وارد کنید.",
          )}
          {setup ? (
            <>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
                  alt="کد QR راه‌اندازی برنامه‌ی احراز هویت"
                  className="w-48 h-48 rounded-xl border border-gray-100 bg-white p-2"
                />
              </div>
              <p className="text-[11px] text-gray-500 text-center">یا این کلید را دستی وارد کنید:</p>
              <bdi dir="ltr" className="block text-center font-mono text-[12px] tracking-wider bg-gray-50 rounded-lg p-2 break-all text-gray-700">
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </bdi>
            </>
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            placeholder="------"
            aria-label="کد ۶ رقمی برنامه‌ی احراز هویت"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/[^\d۰-۹]/g, "")); setError(null); }}
            className={`${inputClass} text-center font-mono text-xl tracking-[0.5em]`}
          />
          <button type="submit" disabled={loading || !setup} className={submitClass} style={submitStyle}>
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "تأیید و فعال‌سازی"}
          </button>
        </form>
      )}

      {/* نمایش یک‌باره‌ی کدهای بازیابی */}
      {recoveryCodes && (
        <div className="space-y-4">
          {header(
            <KeyRound className="w-6 h-6" style={{ color: "var(--color-emerald)" }} />,
            "کدهای بازیابی",
            "اگر به گوشی دسترسی نداشته باشید، با هر کد یک‌بار می‌توانید وارد شوید. این کدها فقط همین یک‌بار نمایش داده می‌شوند.",
          )}
          <div dir="ltr" className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((c) => (
              <bdi key={c} className="text-center font-mono text-[13px] font-bold bg-gray-50 rounded-lg py-2 text-gray-800">
                {c}
              </bdi>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n"))} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-700">
              <Copy className="w-4 h-4" /> کپی
            </button>
            <button type="button" onClick={downloadCodes} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-700">
              <Download className="w-4 h-4" /> دانلود
            </button>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-bold text-gray-700">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            کدها را در جای امنی ذخیره کردم
          </label>
          <button type="button" disabled={!saved} onClick={() => router.replace(home)} className={submitClass} style={submitStyle}>
            <CheckCircle2 className="w-5 h-5" />
            ورود به پنل
          </button>
        </div>
      )}

      {/* بررسی کد */}
      {step.next === "MFA_VERIFY" && (
        <form onSubmit={submitCode} className="space-y-4">
          {header(
            <Smartphone className="w-6 h-6" style={{ color: "var(--color-emerald)" }} />,
            "تأیید دومرحله‌ای",
            useRecovery
              ? "یکی از کدهای بازیابی خود را وارد کنید (هر کد فقط یک‌بار قابل استفاده است)."
              : "کد ۶ رقمی برنامه‌ی احراز هویت را وارد کنید.",
          )}
          <input
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            dir="ltr"
            autoFocus
            maxLength={useRecovery ? 11 : 6}
            placeholder={useRecovery ? "XXXXX-XXXXX" : "------"}
            aria-label={useRecovery ? "کد بازیابی" : "کد ۶ رقمی برنامه‌ی احراز هویت"}
            value={code}
            onChange={(e) => {
              setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/[^\d۰-۹]/g, ""));
              setError(null);
            }}
            className={`${inputClass} text-center font-mono text-xl ${useRecovery ? "tracking-widest" : "tracking-[0.5em]"}`}
          />
          <button type="submit" disabled={loading} className={submitClass} style={submitStyle}>
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "تأیید و ورود"}
          </button>
          <button
            type="button"
            onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}
            className="w-full text-[13px] font-bold text-gray-500 hover:text-gray-700"
          >
            {useRecovery ? "استفاده از کد برنامه‌ی احراز هویت" : "به برنامه دسترسی ندارم؛ کد بازیابی دارم"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="w-full flex items-center justify-center gap-1.5 text-[13px] font-bold text-gray-400 hover:text-gray-600"
      >
        <ArrowRight className="w-4 h-4" />
        بازگشت به صفحه‌ی ورود
      </button>
    </div>
  );
}
