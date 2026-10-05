import { useCallback, useState } from 'react';
import axios from 'axios';
import useSWR from 'swr';

export type MobileVerificationStatus =
  | 'NOT_CHECKED'
  | 'VERIFIED'
  | 'MISMATCH'
  | 'UNAVAILABLE';

export interface MobileVerificationInfo {
  status: MobileVerificationStatus;
  phone: string;
  blocked: boolean;
  identityVerified: boolean;
  checkedAt: string | null;
  verifiedAt: string | null;
  title: string;
  description: string;
  steps: string[];
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function messageOf(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    return Array.isArray(msg) ? msg[0] : msg || fallback;
  }
  return 'خطای ناشناخته‌ای رخ داد';
}

/** تطبیق شاهکار شماره موبایل و تغییر شماره‌ی ناهمخوان */
export const useMobileVerification = () => {
  const { data, isLoading, mutate } = useSWR<MobileVerificationInfo>(
    '/api/user/mobile-verification',
    fetcher,
    { revalidateOnFocus: false },
  );

  const [busy, setBusy] = useState<null | 'recheck' | 'request' | 'confirm'>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    setBusy('recheck');
    setError(null);
    try {
      const res = await axios.post('/api/user/mobile-verification/recheck');
      await mutate(res.data, { revalidate: false });
      return res.data as MobileVerificationInfo & { message: string };
    } catch (err) {
      setError(messageOf(err, 'استعلام مجدد ناموفق بود'));
      return null;
    } finally {
      setBusy(null);
    }
  }, [mutate]);

  const requestChange = useCallback(async (phone: string) => {
    setBusy('request');
    setError(null);
    try {
      const res = await axios.post(
        '/api/user/mobile-verification/change-phone/request',
        { phone },
      );
      return res.data as { message: string; phone: string; expiresIn: number };
    } catch (err) {
      setError(messageOf(err, 'ثبت شماره‌ی جدید ناموفق بود'));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const confirmChange = useCallback(
    async (phone: string, code: string) => {
      setBusy('confirm');
      setError(null);
      try {
        const res = await axios.post(
          '/api/user/mobile-verification/change-phone/confirm',
          { phone, code },
        );
        await mutate();
        return res.data as { message: string; phone: string };
      } catch (err) {
        setError(messageOf(err, 'کد تأیید نادرست است'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [mutate],
  );

  return {
    info: data ?? null,
    loading: isLoading,
    busy,
    error,
    setError,
    recheck,
    requestChange,
    confirmChange,
    refetch: mutate,
  };
};
