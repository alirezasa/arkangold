import { useState, useCallback } from 'react';
import axios from 'axios';
import useSWR from 'swr';

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string | null;
  cardNumber: string;
  cardLast4: string;
  sheba: string | null;
  isVerified: boolean;
  isDefault: boolean;
  createdAt: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useBankAccounts = () => {
  const { data, isLoading, error, mutate } = useSWR<BankAccount[]>(
    '/api/user/bank-accounts',
    fetcher,
    { revalidateOnFocus: false },
  );

  const refetch = useCallback(() => mutate(), [mutate]);

  const setDefault = async (accountId: string) => {
    try {
      await axios.patch(`/api/user/bank-accounts/${accountId}/set-default`);
      await mutate();
      return true;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        throw new Error(Array.isArray(msg) ? msg[0] : msg || 'خطا');
      }
      throw new Error('خطای ناشناخته');
    }
  };

  return {
    accounts: data ?? [],
    loading: isLoading,
    error: error ? 'خطا در دریافت حساب‌های بانکی' : null,
    refetch,
    setDefault,
  };
};

export const useAddBankAccount = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (formData: {
    cardNumber: string;
    sheba: string;
    bankName: string;
    accountNumber?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/user/bank-accounts', formData);
      return res.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا در ثبت حساب');
      } else {
        setError('خطای ناشناخته');
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, setError, submit };
};