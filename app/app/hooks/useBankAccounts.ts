import { useState, useCallback } from 'react';
import axios from 'axios';
import useSWR from 'swr';

export type BankAccountStatus = 'VERIFIED' | 'PENDING_INQUIRY' | 'REJECTED';

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string | null;
  cardNumber: string;
  cardBin: string;
  cardLast4: string;
  sheba: string | null;
  ownerName: string | null;
  depositStatus: string | null;
  depositStatusLabel: string | null;
  status: BankAccountStatus;
  statusMessage: string | null;
  isVerified: boolean;
  isDefault: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

/** نتیجه‌ی ثبت کارت: تأیید خودکار، یا ثبت و انتظار بررسی کارشناس (قطعی وب‌سرویس) */
export interface AddBankAccountResult {
  result: 'VERIFIED' | 'PENDING';
  message: string;
  account: BankAccount;
}

/** خطای ثبت کارت؛ code برای راهنمایی دقیق (OWNER_MISMATCH: کارت به نام کاربر نیست) */
export interface AddBankAccountError {
  message: string;
  code?: 'OWNER_MISMATCH' | 'ACCOUNT_BLOCKED' | string;
  status?: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function extractMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    return Array.isArray(msg) ? msg[0] : msg || fallback;
  }
  return 'خطای ناشناخته';
}

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
      throw new Error(extractMessage(err, 'خطا'));
    }
  };

  const remove = async (accountId: string) => {
    try {
      await axios.delete(`/api/user/bank-accounts/${accountId}`);
      await mutate();
      return true;
    } catch (err: unknown) {
      throw new Error(extractMessage(err, 'حذف کارت ناموفق بود'));
    }
  };

  return {
    accounts: data ?? [],
    loading: isLoading,
    error: error ? 'خطا در دریافت حساب‌های بانکی' : null,
    refetch,
    setDefault,
    remove,
  };
};

export const useAddBankAccount = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AddBankAccountError | null>(null);

  const submit = async (
    cardNumber: string,
  ): Promise<AddBankAccountResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/user/bank-accounts', { cardNumber });
      return res.data as AddBankAccountResult;
    } catch (err: unknown) {
      setError({
        message: extractMessage(err, 'خطا در ثبت کارت'),
        code: axios.isAxiosError(err) ? err.response?.data?.code : undefined,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, setError, submit };
};
