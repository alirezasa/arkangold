"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { useRegister } from "../hooks/useRegister";

// آرایه متون اسلایدر
const SLIDES = [
  "خرید و فروش طلای آب شده",
  "خرید شمش طلا",
  "خرید مصنوعات طلا",
];

export default function RegisterPage() {
  const router = useRouter();
  const {
    step,
    setStep,
    loading,
    error,
    setError,
    handleSendOtp,
    handleVerifyOtp,
    handleFinalize,
  } = useRegister();

  const [userType, setUserType] = useState<"REAL" | "LEGAL">("REAL");
  const [formData, setFormData] = useState({
    phone: "",
    repPhone: "",
    companyNationalId: "",
    otp: ["", "", "", "", "", ""],
    password: "",
    confirmPassword: "",
    referralCode: "",
  });

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
        setDisplayedText(currentFullText.substring(0, displayedText.length + 1));
      }, 100);
    } else if (!isDeleting && displayedText.length === currentFullText.length) {
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
    } else if (isDeleting && displayedText.length > 0) {
      timeout = setTimeout(() => {
        setDisplayedText(currentFullText.substring(0, displayedText.length - 1));
      }, 50);
    } else if (isDeleting && displayedText.length === 0) {
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setTextIndex((prev) => (prev + 1) % SLIDES.length);
      }, 50);
    }

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, textIndex]);

  // هندلر هوشمند برای فیلدهای عددی
  const handleNumericChange = (
    key: keyof typeof formData,
    value: string,
    maxLength: number,
  ) => {
    const onlyDigits = value.replace(/\D/g, "");
    if (onlyDigits.length <= maxLength) {
      setFormData({ ...formData, [key]: onlyDigits });
      if (error) setError(null);
    }
  };

  const handleSubmit = async () => {
    if (step === 1) {
      const activePhone =
        userType === "REAL" ? formData.phone : formData.repPhone;
      if (!activePhone) {
        setError("لطفا شماره موبایل را وارد کنید.");
        return;
      }
      await handleSendOtp(activePhone);
    } else if (step === 2) {
      const activePhone =
        userType === "REAL" ? formData.phone : formData.repPhone;
      await handleVerifyOtp(
        activePhone,
        formData.otp,
        userType,
        formData.companyNationalId,
      );
    } else if (step === 3) {
      const success = await handleFinalize(
        formData.password,
        formData.confirmPassword,
        formData.referralCode,
      );
      if (success) {
        router.replace("/dashboard");
      }
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (isNaN(Number(value))) return;
    const newOtp = [...formData.otp];
    newOtp[index] = value;
    setFormData({ ...formData, otp: newOtp });

    if (error) setError(null);

    if (value !== "" && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && formData.otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && index === 5) {
      handleSubmit();
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
              <span className="animate-pulse text-white mr-1 font-normal">|</span>
            </span>
          </h1>
          <p className="mt-8 text-xl text-emerald-100/80 font-light leading-relaxed max-w-sm">
            سریع‌ترین و امن‌ترین پلتفرم معاملاتی طلا در کشور.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-3 text-gold-500/90 font-bold">
          <ShieldCheck className="w-6 h-6" />
          <span>تضمین امنیت با رمزنگاری پیشرفته</span>
        </div>
      </div>

      {/* پنل فرم */}
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

          <div className="mb-10">
            <h2 className="text-3xl font-black text-emerald mb-2">ثبت نام</h2>
            <div className="flex gap-2 mt-4">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= s ? "bg-emerald" : "bg-gray-200"}`}
                />
              ))}
            </div>
          </div>

          {/* نمایش ارورها */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-start gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {/* مرحله ۱ */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setUserType("REAL")}
                  className={`flex-1 py-3.5 font-bold rounded-xl transition-all ${userType === "REAL" ? "bg-white shadow-sm text-emerald" : "text-gray-500"}`}
                >
                  حقیقی
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("LEGAL")}
                  className={`flex-1 py-3.5 font-bold rounded-xl transition-all ${userType === "LEGAL" ? "bg-white shadow-sm text-emerald" : "text-gray-500"}`}
                >
                  حقوقی
                </button>
              </div>

              {userType === "REAL" ? (
                <InputField
                  label="شماره موبایل"
                  placeholder="09123456789"
                  value={formData.phone}
                  onChange={(v) => handleNumericChange("phone", v, 11)}
                  isNumeric
                />
              ) : (
                <>
                  <InputField
                    label="شماره موبایل نماینده"
                    placeholder="0912..."
                    value={formData.repPhone}
                    onChange={(v) => handleNumericChange("repPhone", v, 11)}
                    isNumeric
                  />
                  <InputField
                    label="شناسه ملی شرکت"
                    placeholder="1032..."
                    value={formData.companyNationalId}
                    onChange={(v) =>
                      handleNumericChange("companyNationalId", v, 11)
                    }
                    isNumeric
                  />
                </>
              )}
            </div>
          )}

          {/* مرحله ۲ */}
          {step === 2 && (
            <div className="py-2 animate-in fade-in duration-300">
              <p className="text-gray-500 text-center mb-6 font-medium text-sm leading-relaxed">
                کد تایید به شماره{" "}
                <span className="font-bold text-emerald" dir="ltr">
                  {userType === "REAL" ? formData.phone : formData.repPhone}
                </span>{" "}
                ارسال شد.
                <br />
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-gold-500 underline mt-2 font-bold text-xs hover:text-[#a88646] transition-colors"
                >
                  ویرایش شماره
                </button>
              </p>
              <div className="flex justify-center gap-2" dir="ltr">
                {formData.otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center border-2 border-gray-200 rounded-xl text-xl font-black focus:border-emerald outline-none transition-all focus:scale-105 bg-white"
                  />
                ))}
              </div>
            </div>
          )}

          {/* مرحله ۳ */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <InputField
                label="رمز عبور"
                placeholder="حداقل ۸ کاراکتر"
                value={formData.password}
                onChange={(v) => {
                  setFormData({ ...formData, password: v });
                  if (error) setError(null);
                }}
                isPassword
              />
              <InputField
                label="تکرار رمز عبور"
                placeholder="تکرار دقیق رمز عبور"
                value={formData.confirmPassword}
                onChange={(v) => {
                  setFormData({ ...formData, confirmPassword: v });
                  if (error) setError(null);
                }}
                isPassword
              />
              <InputField
                label="کد معرف (اختیاری)"
                placeholder="مثال: X7Y2Z"
                value={formData.referralCode}
                onChange={(v) => setFormData({ ...formData, referralCode: v })}
              />
            </div>
          )}

          {/* دکمه اصلی */}
          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            className="w-full mt-8 py-4 bg-emerald text-white rounded-2xl font-black text-lg hover:bg-[#085f48] shadow-lg shadow-emerald/20 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                {step === 3 ? "تکمیل ثبت نام" : "ادامه"}
                <ArrowLeft className="w-5 h-5" />
              </>
            )}
          </button>

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="text-sm font-bold text-emerald hover:text-[#085f48] transition-colors"
            >
              حساب کاربری دارید؟{" "}
              <span className="underline decoration-2 underline-offset-4">
                ورود
              </span>
            </Link>
            <p className="text-xm text-gray-400 font-medium leading-relaxed px-3 mt-4">
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

// کامپوننت اینپوت با قابلیت نمایش/مخفی‌سازی رمز عبور
interface InputFieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  isNumeric?: boolean;
  isPassword?: boolean;
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
  isNumeric = false,
  isPassword = false,
}: InputFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordField = isPassword && !showPassword;

  return (
    <div className="space-y-2">
      <label className="text-xs font-black text-gray-500 mr-1">{label}</label>
      <div className="relative flex items-center">
        <input
          type={isPasswordField ? "password" : isNumeric ? "tel" : "text"}
          placeholder={placeholder}
          dir={isNumeric || isPassword ? "ltr" : "rtl"}
          className={`w-full p-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 focus:ring-4 focus:ring-gold-500/10 transition-all text-lg font-medium ${isNumeric || isPassword ? "text-left" : "text-right"} ${isPassword ? "pl-12" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {isPassword && (
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
        )}
      </div>
    </div>
  );
}