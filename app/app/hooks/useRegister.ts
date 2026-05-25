import { useState } from "react";
import axios from "axios";
import { AuthService } from "../core/services/auth.service";

// ساختار خطاهای حرفه‌ای NestJS (گاهی رشته است، گاهی آرایه‌ای از خطاها)
interface NestApiError {
  message?: string | string[];
  statusCode?: number;
  error?: string;
}

export const useRegister = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);

  // تابع هوشمند برای استخراج و ترجمه خطاهای NestJS
  const getErrorMessage = (err: unknown, defaultMsg: string): string => {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const errorData = err.response?.data as NestApiError | undefined;

      // ۱. مدیریت خطای محدودیت درخواست (Rate Limiting / Throttler)
      if (status === 429) {
        return "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.";
      }

      // ۲. استخراج پیام خطای اصلی از بک‌اند
      if (errorData?.message) {
        // اگر NestJS خطاها را به صورت آرایه داد (ValidationPipe)، اولین خطا را نشان بده
        if (Array.isArray(errorData.message)) {
          return errorData.message[0]; 
        }
        // ترجمه خطای Throttler اگر استاتوس کد 429 نبود اما متن آن ارسال شد
        if (errorData.message.includes("ThrottlerException")) {
          return "درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید.";
        }
        return errorData.message;
      }
    }
    return defaultMsg;
  };

  const handleSendOtp = async (phone: string) => {
    // اعتبارسنجی اولیه پیش از ارسال به سرور
    if (!/^09\d{9}$/.test(phone)) {
      setError("شماره موبایل باید ۱۱ رقم باشد و با 09 شروع شود.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await AuthService.sendOtp(phone);
      setStep(2);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "خطا در ارسال کد تایید. لطفا دوباره تلاش کنید."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (phone: string, otpArray: string[], type: "REAL" | "LEGAL", companyId?: string) => {
    const code = otpArray.join("");
    if (code.length < 6) {
      setError("لطفاً کد تایید ۶ رقمی را به طور کامل وارد کنید.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await AuthService.verifyOtp(phone, code, type, companyId);
      setTempToken(res.tempToken);
      setStep(3);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "کد تایید نادرست یا منقضی شده است."));
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async (password: string, confirmPassword: string, referralCode?: string) => {
    // اعتبارسنجی‌های امنیتی رمز عبور سمت کاربر
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("رمز عبور و تکرار آن با یکدیگر تطابق ندارند.");
      return false;
    }
    if (!tempToken) {
      setError("نشست شما منقضی شده است. لطفاً از مرحله اول شروع کنید.");
      setStep(1);
      return false;
    }

    setLoading(true);
    setError(null);
    try {
      await AuthService.finalizeRegister(tempToken, password, referralCode);
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "خطایی در ثبت نهایی رمز عبور رخ داد."));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { step, setStep, loading, error, handleSendOtp, handleVerifyOtp, handleFinalize, setError };
};