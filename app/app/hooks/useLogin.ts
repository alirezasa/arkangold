import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { AuthService, type LoginChallenge } from "../core/services/auth.service";
import { consumeReturnPath } from "../utils/return-path";
import { withCaptcha } from "../utils/pow-captcha";

export type LoginStep = "credentials" | "second_factor";

// استخراج پیام خطای استاندارد از بک‌اَند
export function apiErrorMessage(err: unknown, fallback = "خطایی در ارتباط با سرور رخ داد."): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message;
    return Array.isArray(message) ? message[0] : message || fallback;
  }
  return err instanceof Error ? err.message : "خطای ناشناخته‌ای رخ داد.";
}

/**
 * ورود دومرحله‌ای (FIA_UAU_EXT.2.3): رمز عبور ← کد پیامکی یا کد برنامه‌ی احراز هویت.
 * «بررسی امنیتی» در صورت درخواست سرور به‌طور خودکار حل می‌شود (FIA_UAU_EXT.2.1).
 */
export const useLogin = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<LoginStep>("credentials");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const router = useRouter();

  const submitCredentials = async (phone: string, password: string): Promise<number> => {
    setLoading(true);
    setError(null);
    try {
      const ch = await withCaptcha(
        (captcha) => AuthService.login(phone, password, captcha),
        setChecking,
      );
      setChallenge(ch);
      setStep("second_factor");
      return ch.resendAfter ?? 0;
    } catch (err) {
      setError(apiErrorMessage(err));
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (code: string) => {
    if (!challenge) return;
    setLoading(true);
    setError(null);
    try {
      await AuthService.verifyLogin(challenge.challengeToken, code);
      router.replace(consumeReturnPath() ?? "/dashboard");
    } catch (err) {
      setError(apiErrorMessage(err));
      // پایان مهلت/تلاش‌ها → بازگشت به مرحله‌ی رمز
      if (axios.isAxiosError(err) && /دوباره وارد شوید/.test(String(err.response?.data?.message))) {
        setStep("credentials");
        setChallenge(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async (): Promise<number> => {
    if (!challenge) return 0;
    setError(null);
    try {
      const r = await AuthService.resendLoginCode(challenge.challengeToken);
      return r.resendAfter ?? 60;
    } catch (err) {
      setError(apiErrorMessage(err));
      const retry = axios.isAxiosError(err) ? Number(err.response?.data?.retryAfter) : 0;
      return retry > 0 ? retry : 0;
    }
  };

  const restart = () => {
    setStep("credentials");
    setChallenge(null);
    setError(null);
  };

  return {
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
  };
};
