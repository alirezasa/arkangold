import { useState, useCallback } from 'react';
import axios from 'axios';
import useSWR from 'swr';

// ── Types ──
export interface WalletData {
  id: string;
  cardNumber: string;
  rialBalance: number;
  goldBalanceGrams: number;
  holdRial: number;
  holdGrams: number;
  availableRial: number;
  availableGrams: number;
  stats: {
    todayDeposit: number;
    monthWithdrawal: number;
  };
}

export interface DepositConfig {
  online: {
    enabled: boolean;
    minAmount: number;
    maxAmount: number;
    dailyLimit: number;
  };
  cardToCard: {
    enabled: boolean;
    dailyLimit: number;
    minAmount: number;
    maxAmount: number;
    destinationCard: string;
    destinationCardFull: string;
    destinationOwner: string;
    processingTime: string;
  };
  bankTransfer: {
    enabled: boolean;
    dailyLimit: number;
    destinationAccount: string;
    destinationSheba: string;
    destinationOwner: string;
    processingTime: string;
  };
  trackingId: {
    enabled: boolean;
    dailyLimit: number;
    destinationAccount: string;
    destinationSheba: string;
    destinationOwner: string;
  };
  largeTransfer: {
    enabled: boolean;
    minAmount: number;
    destinationAccount: string;
    destinationSheba: string;
  };
  direct: {
    enabled: boolean;
    dailyLimit: number;
    destinationCard: string;
    destinationCardFull: string;
  };
}

export interface WithdrawalConfig {
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
  monthlyLimit: number;
  processingTime: string;
  usedToday: number;
  usedThisMonth: number;
  remainingToday: number;
  remainingThisMonth: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

// ── Hook: اطلاعات کیف پول ──
export const useWallet = () => {
  const { data, isLoading, error, mutate } = useSWR<WalletData>(
    '/api/wallet',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  );
  return {
    wallet: data ?? null,
    loading: isLoading,
    error: error ? 'خطا در دریافت اطلاعات کیف پول' : null,
    refresh: mutate,
  };
};

// ── Hook: تنظیمات واریز ──
export const useDepositConfig = () => {
  const { data, isLoading, error } = useSWR<DepositConfig>(
    '/api/wallet/deposit/config',
    fetcher,
    { revalidateOnFocus: false },
  );
  return { config: data ?? null, loading: isLoading, error };
};

// ── Hook: تنظیمات برداشت ──
export const useWithdrawalConfig = () => {
  const { data, isLoading, error, mutate } = useSWR<WithdrawalConfig>(
    '/api/wallet/withdrawal/config',
    fetcher,
    { revalidateOnFocus: false },
  );
  return { config: data ?? null, loading: isLoading, error, refresh: mutate };
};

// ── Hook: واریز کارت به کارت ──
export const useCardToCardDeposit = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = useCallback(async (sourceCardId: string, amount: number) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/wallet/deposit/card-to-card', { sourceCardId, amount });
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا در ثبت واریز');
      } else setError('خطای ناشناخته');
      return null;
    } finally { setLoading(false); }
  }, []);

  const confirm = useCallback(async (transactionId: string) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/wallet/deposit/card-to-card/confirm', { transactionId });
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا');
      } else setError('خطای ناشناخته');
      return null;
    } finally { setLoading(false); }
  }, []);

  return { loading, error, setError, initiate, confirm };
};

// ── Hook: واریز حساب به حساب ──
export const useBankTransferDeposit = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = useCallback(async (sourceCardId: string) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/wallet/deposit/bank-transfer', { sourceCardId });
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا');
      } else setError('خطای ناشناخته');
      return null;
    } finally { setLoading(false); }
  }, []);

  return { loading, error, setError, initiate };
};

// ── Hook: واریز شناسه‌دار ──
export const useTrackingIdDeposit = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTrackingInfo = useCallback(async (sourceCardId: string) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/wallet/deposit/tracking-id', { sourceCardId });
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا');
      } else setError('خطای ناشناخته');
      return null;
    } finally { setLoading(false); }
  }, []);

  return { loading, error, setError, getTrackingInfo };
};

// ── Hook: واریز مبالغ بالا ──
export const useLargeTransferDeposit = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = useCallback(async (amount: number) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/wallet/deposit/large-transfer', { amount });
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا');
      } else setError('خطای ناشناخته');
      return null;
    } finally { setLoading(false); }
  }, []);

  return { loading, error, setError, initiate };
};

// ── Hook: برداشت ──
export const useWithdrawal = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (bankAccountId: string, amountRial: number) => {
    setLoading(true); setError(null);
    try {
      const res = await axios.post('/api/wallet/withdrawal/request', { bankAccountId, amountRial });
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || 'خطا در ثبت برداشت');
      } else setError('خطای ناشناخته');
      return null;
    } finally { setLoading(false); }
  }, []);

  return { loading, error, setError, request };
};