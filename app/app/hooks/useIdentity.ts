import { useState } from 'react';
import axios from 'axios';

export interface IdentityFormData {
  firstName: string;
  lastName: string;
  nationalCode: string;
  birthDate: string; // YYYY-MM-DD
}

export type IdentityStatus = 'VERIFIED' | 'MANUAL_REVIEW' | 'PENDING' | null;

export const useIdentity = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<IdentityStatus>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const submitIdentity = async (data: IdentityFormData): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setResultStatus(null);
    setResultMessage(null);

    try {
      const res = await axios.post('/api/user/identity', data);
      const { status, message } = res.data as { status: IdentityStatus; message: string };
      setResultStatus(status);
      setResultMessage(message);
      return true;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as { message?: string } | undefined;

        // خطای 503: وب‌سرویس ثبت احوال در دسترس نیست
        if (status === 503) {
          setResultStatus('MANUAL_REVIEW');
          setResultMessage(
            data?.message ||
              'بعداً می‌توانید احراز هویت را تکمیل کنید. اطلاعات شما ذخیره شد.',
          );
          return true; // اجازه ادامه
        }

        // خطای 409: قبلاً تایید شده
        if (status === 409) {
          setResultStatus('VERIFIED');
          setResultMessage(data?.message || 'هویت شما قبلاً تایید شده است');
          return true;
        }

        setError(data?.message || 'خطا در ارسال اطلاعات');
      } else {
        setError('خطای ناشناخته‌ای رخ داد');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, setError, resultStatus, resultMessage, submitIdentity };
};
