"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
  UserPlus,
  AlertCircle,
  Loader2,
  Timer,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { useLogin } from "../hooks/useLogin";
import OtpInput from "../components/OtpInput";
import { digitsOnly } from "../utils/digits";
import { captureReturnPathFromUrl } from "../utils/return-path";

// آرایه متون اسلایدر
const SLIDES = ["خرید و فروش طلای آب شده", "خرید شمش طلا", "خرید مصنوعات طلا"];

export default function LoginPage() {
  const {
    loading,
    checking,
    error,
    setError,
    step,
    challenge,
    submitCredentials,
    verifyCode,
    resend,
    restart,
  } = useLogin();

  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  // کاربر دارای برنامه‌ی احراز هویت می‌تواند به‌جای کد ۶ رقمی یکی از کدهای بازیابی را وارد کند
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  // استیت‌های افکت تایپی (Typewriter)
  const [textIndex, setTextIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Form States
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  // مسیر بازگشت (?next=) — مثلاً صفحه شمشی که کاربر از سایت انتخاب کرده
  useEffect(() => {
    captureReturnPathFromUrl();
  }, []);

  // مدیریت تایمر معکوس کد OTP
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  // منطق افکت تایپی (Typewriter Effect)
  useEffect(() => {
    const currentFullText = SLIDES[textIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting && displayedText.length < currentFullText.length) {
      // در حال تایپ حروف
      timeout = setTimeout(() => {
        setDisplayedText(
          currentFullText.substring(0, displayedText.length + 1),
        );
      }, 100);
    } else if (!isDeleting && displayedText.length === currentFullText.length) {
      // مکث پس از تکمیل تایپ
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
    } else if (isDeleting && displayedText.length > 0) {
      // در حال پاک کردن حروف
      timeout = setTimeout(() => {
        setDisplayedText(
          currentFullText.substring(0, displayedText.length - 1),
        );
      }, 50);
    } else if (isDeleting && displayedText.length === 0) {
      // رفتن به متن بعدی (داخل setTimeout قرار گرفت تا ارور ESLint رفع شود)
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setTextIndex((prev) => (prev + 1) % SLIDES.length);
      }, 50);
    }

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, textIndex]);

  // فرمت زمان تایمر
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // اعتبارسنجی ورودی شماره موبایل (ارقام کیبورد فارسی هم پذیرفته می‌شوند)
  const handlePhoneChange = (val: string) => {
    const onlyDigits = digitsOnly(val);
    if (onlyDigits.length <= 11) {
      setPhone(onlyDigits);
      if (error) setError(null);
    }
  };

  // مدیریت فیلدهای OTP
  const handleOtpChange = (next: string[]) => {
    setOtp(next);
    if (error) setError(null);
  };

  const handleOtpComplete = async (code: string) => {
    if (!loading) await verifyCode(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "credentials") {
      if (!/^09\d{9}$/.test(phone)) {
        setError("شماره موبایل باید ۱۱ رقم باشد و با 09 شروع شود.");
        return;
      }
      if (!password) return setError("لطفاً رمز عبور خود را وارد کنید.");
      const wait = await submitCredentials(phone, password);
      setOtp(["", "", "", "", "", ""]);
      setUseRecovery(false);
      setRecoveryCode("");
      setTimer(wait);
      return;
    }

    if (useRecovery) {
      if (recoveryCode.replace(/[^A-Za-z0-9]/g, "").length < 10)
        return setError("کد بازیابی ۱۰ کاراکتری را کامل وارد کنید.");
      await verifyCode(recoveryCode);
      return;
    }
    const fullCode = otp.join("");
    if (fullCode.length < 6)
      return setError("لطفاً کد ۶ رقمی را کامل وارد کنید.");
    await verifyCode(fullCode);
  };

  const handleResend = async () => {
    setOtp(["", "", "", "", "", ""]);
    setTimer(await resend());
  };

  const resetToPhone = () => {
    restart();
    setOtp(["", "", "", "", "", ""]);
    setTimer(0);
    setPassword("");
  };

  return (
    <div
      className="w-full min-h-app flex flex-col lg:flex-row-reverse bg-[#fdfdfd]"
      dir="rtl"
    >
      {/* بخش راست: پنل برندینگ (دسکتاپ) */}
      <div className="hidden lg:flex lg:w-[45%] bg-emerald relative overflow-hidden flex-col justify-between p-16">
        <div className="absolute inset-0 bg-[url('/patterns/cubes.svg')] opacity-10"></div>
        <div className="relative z-10">
          {/* لوگوی دسکتاپ - بزرگ و شفاف */}
          <div className="mb-8">
            <Image
              src="/logo.png"
              alt="آرکان گلد"
              width={160}
              height={160}
              className="object-contain drop-shadow-xl"
              priority
            />
          </div>
          <h1 className="text-5xl font-black text-white leading-snug">
            آرکان گلد
            <br />
            {/* متن با افکت تایپی دسکتاپ */}
            <span className="text-gold-500 inline-flex items-center min-h-14 mt-2">
              <span>{displayedText}</span>
              <span className="animate-pulse text-white mr-1 font-normal">
                |
              </span>
            </span>
          </h1>
          <p className="mt-8 text-xl text-emerald-100/80 font-light leading-relaxed max-w-sm">
            امنیت سرمایه شما، اولویت ماست. وارد پنل کاربری خود شوید و معاملات را
            مدیریت کنید.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-3 text-gold-500/90 font-bold">
          <ShieldCheck className="w-6 h-6" />
          <span>تضمین امنیت با رمزنگاری پیشرفته</span>
        </div>
      </div>

      {/* بخش چپ: فرم ورود */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-20 py-6 sm:py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* لوگو و نام برند برای حالت موبایل */}
          <div className="flex flex-col items-center justify-center mb-6 lg:hidden">
            <div className="mb-2">
              <Image
                src="/logo.png"
                alt="آرکان گلد"
                width={110}
                height={110}
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-3xl font-black text-emerald">
              آرکان <span className="text-gold-500">گلد</span>
            </h1>
            {/* متن با افکت تایپی موبایل */}
            <p className="text-sm text-gray-500 font-bold mt-2 min-h-6 flex items-center justify-center">
              <span>{displayedText}</span>
              <span className="animate-pulse text-emerald mr-0.5">|</span>
            </p>
          </div>

          <div className="mb-6 lg:mb-10 text-center lg:text-right">
            <h2 className="text-3xl font-black text-emerald mb-2">
              ورود به حساب
            </h2>
            <p className="text-gray-500 font-medium text-sm">
              لطفاً اطلاعات خود را وارد کنید
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-start gap-3 text-sm font-bold animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === "credentials" && (
              <div className="space-y-2 animate-in fade-in">
                <label className="text-xs font-black text-gray-400 mr-1">
                  شماره موبایل
                </label>
                <div className="relative">
                  <Phone className="absolute right-4 top-4 text-emerald w-5 h-5" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    dir="ltr"
                    placeholder="0912..."
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="w-full pr-12 pl-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-medium text-left"
                  />
                </div>
              </div>
            )}

            {step === "credentials" && (
              <div className="space-y-2 animate-in fade-in">
                <label className="text-xs font-black text-gray-400 mr-1">
                  گذرواژه
                </label>

                <div className="relative flex items-center">
                  <Lock className="absolute right-4 text-emerald w-5 h-5" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    maxLength={128}
                    aria-label="رمز عبور"
                    dir="ltr"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full pr-12 pl-12 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-medium text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                    className="absolute left-4 text-gray-400 hover:text-emerald transition-colors focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>

                <div className="flex justify-start pt-1">
                  <Link
                    href="/forgot-password"
                    className="text-sm font-bold text-gold-500 hover:text-[#a88646] transition-colors"
                  >
                    فراموشی رمز عبور
                  </Link>
                </div>
              </div>
            )}

            {step === "second_factor" && challenge && (
              <div className="space-y-6 animate-in slide-in-from-left-4">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald/10">
                    {challenge.method === "TOTP" ? (
                      <Smartphone className="h-6 w-6 text-emerald" />
                    ) : (
                      <ShieldCheck className="h-6 w-6 text-emerald" />
                    )}
                  </div>
                  <p className="font-black text-emerald">تأیید دومرحله‌ای</p>
                  <p className="mt-1 text-gray-500 font-medium text-sm leading-relaxed">
                    {challenge.method === "TOTP" ? (
                      useRecovery ? (
                        "یکی از کدهای بازیابی خود را وارد کنید (هر کد فقط یک‌بار قابل استفاده است)."
                      ) : (
                        "کد ۶ رقمی برنامه‌ی احراز هویت (مثل Google Authenticator) را وارد کنید."
                      )
                    ) : (
                      <>
                        کد تایید به{" "}
                        <span className="font-bold text-emerald" dir="ltr">
                          {challenge.maskedPhone}
                        </span>{" "}
                        پیامک شد.
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={resetToPhone}
                    className="text-gold-500 underline mt-1 font-bold text-xs hover:text-[#a88646]"
                  >
                    ورود با حساب دیگر
                  </button>
                </div>

                {useRecovery ? (
                  <input
                    type="text"
                    dir="ltr"
                    autoComplete="one-time-code"
                    placeholder="XXXXX-XXXXX"
                    value={recoveryCode}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value.toUpperCase());
                      if (error) setError(null);
                    }}
                    className="w-full px-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-mono tracking-widest text-center"
                  />
                ) : (
                  <OtpInput
                    value={otp}
                    onChange={handleOtpChange}
                    onComplete={handleOtpComplete}
                    disabled={loading}
                  />
                )}

                <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500">
                  {challenge.method === "SMS" ? (
                    timer > 0 ? (
                      <>
                        <Timer className="w-4 h-4" />
                        <span>ارسال مجدد کد تا {formatTime(timer)} دیگر</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        className="text-emerald hover:underline flex items-center gap-1"
                      >
                        ارسال مجدد کد
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecovery(!useRecovery);
                        setError(null);
                      }}
                      className="text-emerald hover:underline flex items-center gap-1"
                    >
                      <KeyRound className="w-4 h-4" />
                      {useRecovery
                        ? "استفاده از کد برنامه‌ی احراز هویت"
                        : "به برنامه دسترسی ندارم؛ کد بازیابی دارم"}
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 lg:mt-8 bg-emerald text-white rounded-2xl font-black text-lg hover:bg-[#085f48] shadow-lg shadow-emerald/20 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  {checking && (
                    <span className="text-sm font-bold">در حال بررسی امنیتی…</span>
                  )}
                </>
              ) : (
                <>
                  {step === "credentials" ? "ادامه" : "تایید و ورود"}
                  <ArrowLeft className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center space-y-4">
            <Link
              href="/register"
              className="text-sm font-bold text-emerald hover:text-[#085f48] transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> هنوز حساب کاربری ندارید؟ ثبت‌نام
              کنید
            </Link>

            <p className="text-xm text-gray-400 font-medium leading-relaxed px-3 ">
              ورود یا ثبت‌نام در سایت به منزله مطالعه و پذیرش{" "}
              <a
                href="https://arkan.gold/rules/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-500 font-bold underline hover:text-[#a88646] transition-colors"
              >
                قوانین و مقررات
              </a>{" "}
              آرکان گلد است.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
