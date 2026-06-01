"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import Link from "next/link";
import { Phone, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, Sparkles, UserPlus, AlertCircle, Loader2, Timer } from "lucide-react";
import { useLogin } from "../hooks/useLogin";

type LoginMethod = "password" | "otp";
type OtpStep = "request" | "verify";

export default function LoginPage() {
  const { loading, error, setError, loginWithPassword, sendLoginOtpCode, verifyLoginOtpCode } = useLogin();

  const [method, setMethod] = useState<LoginMethod>("password");
  const [otpStep, setOtpStep] = useState<OtpStep>("request");
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);

  // Form States
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // مدیریت تایمر OTP
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  // فرمت زمان تایمر (مثلاً 01:45)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // اعتبارسنجی ورودی شماره موبایل (فقط عدد)
  const handlePhoneChange = (val: string) => {
    const onlyDigits = val.replace(/\D/g, "");
    if (onlyDigits.length <= 11) {
      setPhone(onlyDigits);
      if (error) setError(null);
    }
  };

  // مدیریت فیلدهای OTP
  const handleOtpChange = async (index: number, value: string) => {
    if (isNaN(Number(value))) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (error) setError(null);

    // فوکوس به جلو
    if (value !== "" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    
    // ارسال خودکار با تکمیل رقم آخر (با اضافه کردن await و جلوگیری در صورت loading)
    if (value !== "" && index === 5 && !loading) {
      const fullCode = newOtp.join("");
      await verifyLoginOtpCode(phone, fullCode);
    }
  };

  // بک‌اسپیس برای OTP
  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // ارسال فرم
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!/^09\d{9}$/.test(phone)) {
      setError("شماره موبایل باید ۱۱ رقم باشد و با 09 شروع شود.");
      return;
    }

    if (method === "password") {
      if (!password) return setError("لطفاً رمز عبور خود را وارد کنید.");
      await loginWithPassword(phone, password);
    } 
    else if (method === "otp") {
      if (otpStep === "request") {
        const success = await sendLoginOtpCode(phone);
        if (success) {
          setOtpStep("verify");
          setTimer(120); // شروع تایمر ۲ دقیقه‌ای
        }
      } else {
        const fullCode = otp.join("");
        if (fullCode.length < 6) return setError("لطفاً کد ۶ رقمی را کامل وارد کنید.");
        await verifyLoginOtpCode(phone, fullCode);
      }
    }
  };

  const resetToPhone = () => {
    setOtpStep("request");
    setOtp(["", "", "", "", "", ""]);
    setTimer(0);
    setError(null);
  };

  return (
    <div className="w-full min-h-screen flex flex-col lg:flex-row-reverse bg-[#fdfdfd]" dir="rtl">
      
      {/* بخش راست: پنل برندینگ (بدون تغییر) */}
      <div className="hidden lg:flex lg:w-[45%] bg-emerald relative overflow-hidden flex-col justify-between p-16">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10">
          <div className="w-16 h-16 bg-gold-500 rounded-2xl flex items-center justify-center mb-8 shadow-2xl">
            <Sparkles className="text-emerald w-8 h-8" />
          </div>
          <h1 className="text-5xl font-black text-white leading-snug">آرکان گلد<br /><span className="text-gold-500">طلای آب‌شده</span></h1>
          <p className="mt-8 text-xl text-emerald-100/80 font-light leading-relaxed max-w-sm">امنیت سرمایه شما، اولویت ماست. وارد پنل کاربری خود شوید و معاملات را مدیریت کنید.</p>
        </div>
        <div className="relative z-10 flex items-center gap-3 text-gold-500/90 font-bold">
          <ShieldCheck className="w-6 h-6" />
          <span>تضمین امنیت با رمزنگاری پیشرفته</span>
        </div>
      </div>

      {/* بخش چپ: فرم ورود */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-20 py-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-10">
            <h2 className="text-3xl font-black text-emerald mb-2">ورود به حساب</h2>
            <p className="text-gray-500 font-medium">لطفاً اطلاعات خود را وارد کنید</p>
          </div>

          {/* تب‌های انتخاب روش ورود (در زمان وارد کردن کد مخفی می‌شود) */}
          {otpStep === "request" && (
            <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-8 border border-gray-200">
              <button type="button" onClick={() => { setMethod("password"); setError(null); }} className={`flex-1 py-3.5 font-bold rounded-xl transition-all ${method === "password" ? "bg-white shadow-sm text-emerald" : "text-gray-500"}`}>رمز عبور</button>
              <button type="button" onClick={() => { setMethod("otp"); setError(null); }} className={`flex-1 py-3.5 font-bold rounded-xl transition-all ${method === "otp" ? "bg-white shadow-sm text-emerald" : "text-gray-500"}`}>کد پیامکی</button>
            </div>
          )}

          {/* باکسی برای نمایش خطاها */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-start gap-3 text-sm font-bold animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* فیلد شماره موبایل */}
            {otpStep === "request" && (
              <div className="space-y-2 animate-in fade-in">
                <label className="text-xs font-black text-gray-400 mr-1">شماره موبایل</label>
                <div className="relative">
                  <Phone className="absolute right-4 top-4 text-emerald w-5 h-5" />
                  <input type="tel" dir="ltr" placeholder="0912..." value={phone} onChange={(e) => handlePhoneChange(e.target.value)} className="w-full pr-12 pl-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-medium text-left" />
                </div>
              </div>
            )}

            {/* فیلد رمز عبور */}
            {method === "password" && otpStep === "request" && (
              <div className="space-y-2 animate-in fade-in">
                <label className="text-xs font-black text-gray-400 mr-1">گذرواژه</label>
                <div className="relative flex items-center">
                  <Lock className="absolute right-4 text-emerald w-5 h-5" />
                  <input type={showPassword ? "text" : "password"} dir="ltr" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); if(error) setError(null); }} className="w-full pr-12 pl-12 py-4 bg-white border border-gray-300 rounded-2xl outline-none focus:border-gold-500 transition-all text-lg font-medium text-left" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 text-gray-400 hover:text-emerald transition-colors focus:outline-none">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* فیلد OTP و تایمر */}
            {method === "otp" && otpStep === "verify" && (
              <div className="space-y-6 animate-in slide-in-from-left-4">
                <div className="text-center">
                  <p className="text-gray-500 font-medium text-sm">
                    کد تایید به <span className="font-bold text-emerald" dir="ltr">{phone}</span> ارسال شد.
                  </p>
                  <button type="button" onClick={resetToPhone} className="text-gold-500 underline mt-1 font-bold text-xs hover:text-[#a88646]">ویرایش شماره موبایل</button>
                </div>
                
                <div className="flex justify-center gap-2" dir="ltr">
                  {otp.map((digit, i) => (
                    <input key={i} type="text" maxLength={1} ref={(el) => { otpRefs.current[i] = el; }} value={digit} onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleKeyDown(i, e)} className="w-12 h-14 text-center text-xl font-black bg-white border-2 border-gray-200 rounded-xl focus:border-emerald focus:scale-105 outline-none transition-all shadow-sm" />
                  ))}
                </div>

                <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500">
                  {timer > 0 ? (
                    <>
                      <Timer className="w-4 h-4" />
                      <span>ارسال مجدد کد تا {formatTime(timer)} دیگر</span>
                    </>
                  ) : (
                    <button type="button" onClick={() => sendLoginOtpCode(phone)} className="text-emerald hover:underline flex items-center gap-1">
                      ارسال مجدد کد
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* دکمه ارسال (Submit) */}
            <button type="submit" disabled={loading} className="w-full py-4 mt-8 bg-emerald text-white rounded-2xl font-black text-lg hover:bg-[#085f48] shadow-lg shadow-emerald/20 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>
                  {method === "password" ? "ورود ایمن به حساب" : otpStep === "request" ? "ارسال پیامک تایید" : "تایید و ورود"}
                  <ArrowLeft className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 text-center">
            <Link href="/register" className="text-sm font-bold text-emerald hover:text-[#085f48] transition-colors flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" /> هنوز حساب کاربری ندارید؟ ثبت‌نام کنید
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}