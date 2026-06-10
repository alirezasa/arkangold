import { useState, useCallback } from 'react';
import axios from 'axios';
import useSWR from 'swr';

export interface WithdrawalItem {
  id: string;
  amountRial: number;
  amountRialFormatted: string;
  status: string;
  statusLabel: string;
  bankName: string;
  cardLast4: string;
  adminNotes: string | null;
  createdAt: string;
  canCancel: boolean;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useWithdrawals = (page = 1, limit = 10) => {
  const { data, isLoading, error, mutate } = useSWR<{
    data: WithdrawalItem[];
    meta: { total: number; page: number; totalPages: number };
  }>(`/api/finance/withdraw?page=${page}&limit=${limit}`, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    withdrawals: data?.data ?? [],
    meta: data?.meta ?? null,
    loading: isLoading,
    error: error ? 'خطا در دریافت درخواست‌ها' : null,
    refetch: useCallback(() => mutate(), [mutate]),
  };
};

export const useWithdrawalActions = (onSuccess?: () => void) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestWithdrawal = async (amountRial: number, bankAccountId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/finance/withdraw', {
        amountRial,
        bankAccountId,
      });
      onSuccess?.();
      return res.data as {
        withdrawalId: string;
        message: string;
        needsTwoApprovals: boolean;
        estimatedTime: string;
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا در ثبت درخواست');
      } else {
        setError('خطای ناشناخته');
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const cancelWithdrawal = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/api/finance/withdraw/${id}`);
      onSuccess?.();
      return true;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا در لغو درخواست');
      } else {
        setError('خطای ناشناخته');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, setError, requestWithdrawal, cancelWithdrawal };
};