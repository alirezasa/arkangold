import { useState, useCallback } from 'react';
import axios from 'axios';
import useSWR from 'swr';

export interface ShebaDepositInfo {
  platformSheba: string;
  platformBankName: string;
  minAmount: number;
  minAmountFormatted: string;
  hasVerifiedCard: boolean;
  verifiedCards: {
    id: string;
    bankName: string;
    cardLast4: string;
    isDefault: boolean;
  }[];
  instructions: { step: number; text: string }[];
  warnings: string[];
}

export interface ValidateResult {
  valid: boolean;
  amountRial: number;
  amountFormatted: string;
  limits: {
    min: number;
    max: number;
    minFormatted: string;
    maxFormatted: string;
  };
  message: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useShebaDepositInfo = () => {
  const { data, isLoading, error } = useSWR<ShebaDepositInfo>(
    '/api/finance/deposit/sheba-info',
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    info: data ?? null,
    loading: isLoading,
    error: error ? 'خطا در دریافت اطلاعات' : null,
  };
};

export const useDepositActions = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);

  const validateAmount = useCallback(async (amountRial: number) => {
    setLoading(true);
    setError(null);
    setValidateResult(null);
    try {
      const res = await axios.post('/api/finance/deposit/validate', { amountRial });
      setValidateResult(res.data as ValidateResult);
      return res.data as ValidateResult;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا در اعتبارسنجی');
      } else {
        setError('خطای ناشناخته');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, validateResult, validateAmount };
};