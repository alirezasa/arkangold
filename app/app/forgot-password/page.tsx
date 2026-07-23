"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Lock, Eye, EyeOff, ArrowLeft, Sparkles, AlertCircle, Loader2, Timer, CheckCircle2 } from "lucide-react";
import { useForgotPassword } from "../hooks/useForgotPassword";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { step, setStep, loading, error, setError, requestOtp, verifyOtp, submitNewPassword } = useForgotPassword();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  const [successMsg, setSuccessMsg] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
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
      if (!/^09\d{9}$/.test(phone)) return setError("شماره موبایل نامعتبر است.");
      await requestOtp(phone);
      setTimer(120);
    } 
    else if (step === "verify_otp") {
      const code = otp.join("");
      if (code.length < 6) return setError("کد تایید کامل نیست.");
      await verifyOtp(phone, code);
    } 
    else if (step === "set_password") {
      if (password.length < 6) return setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      const success = await submitNewPassword(password);
      if (success) {
        setSuccessMsg(true);
        setTimeout(() => router.replace("/login"), 3000);
      }
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col lg:flex-row-reverse bg-[#fdfdfd]" dir="rtl">
      {/* سایدبار راست */}
      <div className="hidden lg:flex lg:w-[45%] bg-emerald relative overflow-hidden flex-col justify-between p-16">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10">
          <div className="w-16 h-16 bg-[#c5a059] rounded-2xl flex items-center justify-center mb-8 shadow-2xl">
            <Sparkles className="text-amber-950 w-8 h-8" />
          </div>
          <h1 className="text-5xl font-black text-white leading-snug">بازیابی امن<br /><span className="text-[#c5a059]">حساب کاربری</span></h1>
          <p className="mt-8 text-xl text-emerald-100/80 font-light leading-relaxed max-w-sm">در صورت فراموشی رمز عبور، با تایید هویت خود می‌توانید مجدداً به پنل معاملات دسترسی پیدا کنید.</p>
        </div>
      </div>

      {/* فرم مرکزی */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-20 py-12">
        <div className="w-full max-w-sm mx-auto">
          {successMsg ? (
            <div className="text-center animate-in zoom-in duration-300">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-black text-[#064e3b] mb-2">رمز عبور تغییر یافت!</h2>
              <p className="text-gray-500 font-medium">در حال انتقال به صفحه ورود...</p>
            </div>
          ) : (
            <>
              <div className="mb-10">
                <h2 className="text-3xl font-black text-[#064e3b] mb-2">فراموشی رمز</h2>
                <p className="text-gray-500 font-medium">مراحل بازیابی را طی کنید</p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-start gap-3 text-sm font-bold animate-in fade-in">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* مرحله ۱: شماره موبایل */}
                {step === "request_phone" && (
                  <div className="space-y-2 animate-in fade-in">
                    <label className="text-xs font-black text-gray-400 mr-1">شماره موبایل متصل به حساب</label>
                    <div className="relative">
                      <Phone className="absolute right-4 top-4 text-[#064e3b] w-5 h-5" />
                      <input type="tel" dir="ltr" placeholder="0912..." value={phone} onChange={(e) => handlePhoneChange(e.target.value)} className="w-full pr-12 pl-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-[#c5a059] transition-all text-lg font-medium text-left" />
                    </div>
                  </div>
                )}

                {/* مرحله ۲: کد تایید */}
                {step === "verify_otp" && (
                  <div className="space-y-6 animate-in slide-in-from-left-4">
                    <div className="text-center">
                      <p className="text-gray-500 font-medium text-sm">کد تایید به <span className="font-bold text-[#064e3b]" dir="ltr">{phone}</span> ارسال شد.</p>
                      <button type="button" onClick={() => { setStep("request_phone"); setOtp(["","","","","",""]); }} className="text-[#c5a059] underline mt-1 font-bold text-xs">ویرایش شماره موبایل</button>
                    </div>
                    
                    <div className="flex justify-center gap-2" dir="ltr">
                      {otp.map((digit, i) => (
                        <input key={i} type="text" maxLength={1} ref={(el) => { otpRefs.current[i] = el; }} value={digit} onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleKeyDown(i, e)} className="w-12 h-14 text-center text-xl font-black bg-white border-2 border-gray-200 rounded-xl focus:border-[#064e3b] outline-none" />
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500">
                      {timer > 0 ? (
                        <><Timer className="w-4 h-4" /><span>ارسال مجدد کد تا {formatTime(timer)}</span></>
                      ) : (
                        <button type="button" onClick={() => { requestOtp(phone); setTimer(120); }} className="text-[#064e3b] hover:underline">ارسال مجدد کد</button>
                      )}
                    </div>
                  </div>
                )}

                {/* مرحله ۳: تنظیم رمز جدید */}
                {step === "set_password" && (
                  <div className="space-y-2 animate-in slide-in-from-left-4">
                    <label className="text-xs font-black text-gray-400 mr-1">رمز عبور جدید</label>
                    <div className="relative flex items-center">
                      <Lock className="absolute right-4 text-[#064e3b] w-5 h-5" />
                      <input type={showPassword ? "text" : "password"} dir="ltr" placeholder="حداقل ۶ کاراکتر" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pr-12 pl-12 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-[#c5a059] transition-all text-lg font-medium text-left" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 text-gray-400 hover:text-[#064e3b] transition-colors focus:outline-none">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full py-4 mt-8 bg-[#064e3b] text-white rounded-2xl font-black text-lg hover:bg-[#085f48] shadow-lg shadow-[#064e3b]/20 transition-all flex items-center justify-center gap-3 disabled:opacity-70">
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                    <>{step === "request_phone" ? "دریافت کد تایید" : step === "verify_otp" ? "بررسی کد" : "ثبت رمز جدید"}<ArrowLeft className="w-5 h-5" /></>
                  )}
                </button>
              </form>

              <div className="mt-10 text-center">
                <Link href="/login" className="text-sm font-bold text-gray-500 hover:text-[#064e3b] transition-colors">
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