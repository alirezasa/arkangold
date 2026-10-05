import { useState } from "react";
import { AuthService } from "../core/services/auth.service";
import { apiErrorMessage } from "./useLogin";

export type ForgotPasswordStep = "request_phone" | "verify_otp" | "verify_mfa" | "set_password";

/**
 * بازیابی رمز: کد پیامکی ← (اگر ورود دومرحله‌ای با برنامه فعال است) کد برنامه یا کد بازیابی
 * ← رمز جدید. FIA_UID_EXT.1.3: بازنشانی رمز عامل دوم فعال را دور نمی‌زند.
 */
export const useForgotPassword = () => {
  const [step, setStep] = useState<ForgotPasswordStep>("request_phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string>("");
  const [challengeToken, setChallengeToken] = useState<string>("");

  const requestOtp = async (phone: string): Promise<number> => {
    setLoading(true);
    setError(null);
    try {
      const r = await AuthService.forgotPassword(phone);
      setStep("verify_otp");
      return r?.resendAfter ?? 60;
    } catch (err) {
      setError(apiErrorMessage(err, "خطایی رخ داد."));
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (phone: string, code: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await AuthService.verifyResetOtp(phone, code);
      if ("resetToken" in data && data.resetToken) {
        setResetToken(data.resetToken);
        setStep("set_password");
      } else if ("mfaRequired" in data && data.mfaRequired) {
        setChallengeToken(data.challengeToken);
        setStep("verify_mfa");
      } else {
        setError("توکن بازیابی دریافت نشد.");
      }
    } catch (err) {
      setError(apiErrorMessage(err, "خطایی رخ داد."));
    } finally {
      setLoading(false);
    }
  };

  const verifyMfa = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await AuthService.verifyResetMfa(challengeToken, code);
      setResetToken(data.resetToken);
      setStep("set_password");
    } catch (err) {
      setError(apiErrorMessage(err, "کد نادرست است."));
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
      setError(apiErrorMessage(err, "خطایی رخ داد."));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    step,
    setStep,
    loading,
    error,
    setError,
    requestOtp,
    verifyOtp,
    verifyMfa,
    submitNewPassword,
  };
};
