import { useState } from "react";
import { AuthService } from "../core/services/auth.service";
import axios from "axios";

export type ForgotPasswordStep = "request_phone" | "verify_otp" | "set_password";

export const useForgotPassword = () => {
  const [step, setStep] = useState<ForgotPasswordStep>("request_phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string>("");

  const handleError = (err: unknown) => {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message[0] : message || "خطایی رخ داد.");
    } else {
      setError("خطای ناشناخته‌ای رخ داد.");
    }
  };

  const requestOtp = async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.forgotPassword(phone);
      setStep("verify_otp");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (phone: string, code: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await AuthService.verifyResetOtp(phone, code);
      // فرض می‌کنیم بک‌اَند resetToken را در پاسخ برمی‌گرداند
      if (data.resetToken) {
        setResetToken(data.resetToken);
        setStep("set_password");
      } else {
        setError("توکن بازیابی دریافت نشد.");
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.resetPassword(resetToken, password);
      return true; // موفقیت‌آمیز
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { step, setStep, loading, error, setError, requestOtp, verifyOtp, submitNewPassword };
};