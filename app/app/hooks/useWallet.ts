import { useCallback } from "react";
import axios from "axios";
import useSWR from "swr";

export interface WalletData {
  cardNumber: string;
  goldBalanceGrams: number;
  rialBalance: number;
  frozenRial: number;
  frozenGrams: number;
  availableRial: number;
  availableGrams: number;
  holds: {
    id: string;
    type: string;
    amountRial: number | null;
    amountGrams: number | null;
    expiresAt: string;
  }[];
}

export interface Transaction {
  id: string;
  type: string;
  amountGrams: number | null;
  amountRial: number | null;
  pricePerGram: number | null;
  feeAmount: number | null;
  taxAmount: number | null;
  status: string;
  description: string | null;
  createdAt: string;
}

export interface TransactionMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LimitsGuide {
  deposit: {
    gateway: {
      min: number;
      max: number;
      minFormatted: string;
      maxFormatted: string;
      description: string;
      notes: string[];
    };
    sheba: {
      min: number;
      minFormatted: string;
      description: string;
      platformSheba: string;
      platformBank: string;
      notes: string[];
      warning: string;
    };
  };
  withdrawal: {
    min: number;
    minFormatted: string;
    monthlyLimit: number;
    monthlyLimitFormatted: string;
    monthlyUsed: number;
    monthlyUsedFormatted: string;
    monthlyRemaining: number;
    monthlyRemainingFormatted: string;
    approvalThreshold: number;
    approvalThresholdFormatted: string;
    notes: string[];
  };
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useWallet = () => {
  const { data, isLoading, error, mutate } = useSWR<WalletData>(
    "/api/wallet",
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    wallet: data ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت کیف پول" : null,
    refetch: useCallback(() => mutate(), [mutate]),
  };
};

export const useTransactions = (page = 1, limit = 20, type?: string) => {
  const key = `/api/wallet/transactions?page=${page}&limit=${limit}${type ? `&type=${type}` : ""}`;
  const { data, isLoading, error } = useSWR<{
    data: Transaction[];
    meta: TransactionMeta;
  }>(key, fetcher, { revalidateOnFocus: false });

  return {
    transactions: data?.data ?? [],
    meta: data?.meta ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت تراکنش‌ها" : null,
  };
};

export const useLimitsGuide = () => {
  const { data, isLoading, error } = useSWR<LimitsGuide>(
    "/api/wallet/limits",
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    limits: data ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت سقف‌ها" : null,
  };
};
