"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Timer,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { useForgotPassword } from "../hooks/useForgotPassword";

// آرایه متون اسلایدر برای افکت تایپی
const SLIDES = ["خرید و فروش طلای آب شده", "خرید شمش طلا", "خرید مصنوعات طلا"];

export default function ForgotPasswordPage() {
  const router = useRouter();
  const {
    step,
    setStep,
    loading,
    error,
    setError,
    requestOtp,
    verifyOtp,
    submitNewPassword,
  } = useForgotPassword();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  const [successMsg, setSuccessMsg] = useState(false);

  // استیت‌های افکت تایپی (Typewriter)
  const [textIndex, setTextIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // منطق افکت تایپی (Typewriter Effect)
  useEffect(() => {
    const currentFullText = SLIDES[textIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting && displayedText.length < currentFullText.length) {
      timeout = setTimeout(() => {
        setDisplayedText(
          currentFullText.substring(0, displayedText.length + 1),
        );
      }, 100);
    } else if (!isDeleting && displayedText.length === currentFullText.length) {
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
    } else if (isDeleting && displayedText.length > 0) {
      timeout = setTimeout(() => {
        setDisplayedText(
          currentFullText.substring(0, displayedText.length - 1),
        );
      }, 50);
    } else if (isDeleting && displayedText.length === 0) {
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setTextIndex((prev) => (prev + 1) % SLIDES.length);
      }, 50);
    }

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, textIndex]);

  // تایمر ارسال مجدد کد
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handlePhoneChange = (val: string) => {
    const onlyDigits = val.replace(/\D/g, "");
    if (onlyDigits.length <= 11) setPhone(onlyDigits);
    if (error) setError(null);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (isNaN(Number(value))) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (error) setError(null);

    if (value !== "" && index < 5) otpRefs.current[index + 1]?.focus();

    // ارسال خودکار بعد از تایپ رقم آخر
    if (value !== "" && index === 5) {
      verifyOtp(phone, newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "request_phone") {
      if (!/^09\d{9}$/.test(phone))
        return setError("شماره موبایل نامعتبر است.");
      await requestOtp(phone);
      setTimer(120);
    } else if (step === "verify_otp") {
      const code = otp.join("");
      if (code.length < 6) return setError("کد تایید کامل نیست.");
      await verifyOtp(phone, code);
    } else if (step === "set_password") {
      if (password.length < 6)
        return setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      const success = await submitNewPassword(password);
      if (success) {
        setSuccessMsg(true);
        setTimeout(() => router.replace("/login"), 3000);
      }
    }
  };

  return (
    <div
      className="w-full min-h-screen flex flex-col lg:flex-row-reverse bg-[#fdfdfd]"
      dir="rtl"
    >
      {/* پنل سمت راست (برندینگ دسکتاپ) */}
      <div className="hidden lg:flex lg:w-[45%] bg-emerald relative overflow-hidden flex-col justify-between p-16">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10">
          {/* لوگوی دسکتاپ - شفاف و بدون کادر */}
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
            در صورت فراموشی رمز عبور، با تایید هویت خود می‌توانید مجدداً به پنل
            معاملات دسترسی پیدا کنید.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-3 text-gold-500/90 font-bold">
          <ShieldCheck className="w-6 h-6" />
          <span>تضمین امنیت با رمزنگاری پیشرفته</span>
        </div>
      </div>

      {/* فرم مرکزی */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-20 py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* لوگو و برندینگ حالت موبایل */}
          <div className="flex flex-col items-center justify-center mb-8 lg:hidden">
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

          {successMsg ? (
            <div className="text-center animate-in zoom-in duration-300">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-black text-emerald mb-2">
                رمز عبور تغییر یافت!
              </h2>
              <p className="text-gray-500 font-medium">
                در حال انتقال به صفحه ورود...
              </p>
            </div>
          ) : (
            <>
              <div className="mb-10">
                <h2 className="text-3xl font-black text-emerald mb-2">
                  فراموشی رمز
                </h2>
                <p className="text-gray-500 font-medium">
                  مراحل بازیابی را طی کنید
                </p>
              </div>

              {/* نمایش ارورها */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-start gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* مرحله ۱: شماره موبایل */}
                {step === "request_phone" && (
                  <div className="space-y-2 animate-in fade-in">
                    <label className="text-xs font-black text-gray-400 mr-1">
                      شماره موبایل متصل به حساب
                    </label>
                    <div className="relative">
                      <Phone className="absolute right-4 top-4 text-emerald w-5 h-5" />
                      <input
                        type="tel"
                        dir="ltr"
                        placeholder="0912..."
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className="w-full pr-12 pl-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-medium text-left"
                      />
                    </div>
                  </div>
                )}

                {/* مرحله ۲: کد تایید */}
                {step === "verify_otp" && (
                  <div className="space-y-6 animate-in slide-in-from-left-4">
                    <div className="text-center">
                      <p className="text-gray-500 font-medium text-sm">
                        کد تایید به{" "}
                        <span className="font-bold text-emerald" dir="ltr">
                          {phone}
                        </span>{" "}
                        ارسال شد.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("request_phone");
                          setOtp(["", "", "", "", "", ""]);
                        }}
                        className="text-gold-500 underline mt-1 font-bold text-xs"
                      >
                        ویرایش شماره موبایل
                      </button>
                    </div>

                    <div className="flex justify-center gap-2" dir="ltr">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          type="text"
                          maxLength={1}
                          ref={(el) => {
                            otpRefs.current[i] = el;
                          }}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(i, e)}
                          className="w-12 h-14 text-center text-xl font-black bg-white border-2 border-gray-200 rounded-xl focus:border-emerald outline-none transition-all focus:scale-105"
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500">
                      {timer > 0 ? (
                        <>
                          <Timer className="w-4 h-4" />
                          <span>ارسال مجدد کد تا {formatTime(timer)}</span>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            requestOtp(phone);
                            setTimer(120);
                          }}
                          className="text-emerald hover:underline"
                        >
                          ارسال مجدد کد
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* مرحله ۳: تنظیم رمز جدید */}
                {step === "set_password" && (
                  <div className="space-y-2 animate-in slide-in-from-left-4">
                    <label className="text-xs font-black text-gray-400 mr-1">
                      رمز عبور جدید
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute right-4 text-emerald w-5 h-5" />
                      <input
                        type={showPassword ? "text" : "password"}
                        dir="ltr"
                        placeholder="حداقل ۶ کاراکتر"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pr-12 pl-12 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-medium text-left"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-4 text-gray-400 hover:text-emerald transition-colors focus:outline-none"
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* دکمه اصلی فرم */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 mt-8 bg-emerald text-white rounded-2xl font-black text-lg hover:bg-[#085f48] shadow-lg shadow-emerald/20 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      {step === "request_phone"
                        ? "دریافت کد تایید"
                        : step === "verify_otp"
                          ? "بررسی کد"
                          : "ثبت رمز جدید"}
                      <ArrowLeft className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-10 text-center">
                <Link
                  href="/login"
                  className="text-sm font-bold text-gray-500 hover:text-emerald transition-colors"
                >
                  بازگشت به صفحه ورود
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
