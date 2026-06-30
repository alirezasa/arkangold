"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import axios from "axios";
import useSWR from "swr";

// ── Types ──
export interface GoldPriceData {
  metal: string;
  pricePerGramRial: number;
  pricePerGramToman: number;
  source: string;
  fetchedAt: string;
  fromCache: boolean;
}

export interface PriceLockData {
  lockId: string;
  metal: string;
  side: "BUY" | "SELL";
  amountGrams: number;
  lockedPrice: number;
  lockedPriceToman: number;
  totalRial: number;
  totalToman: number;
  feeRial: number;
  feeToman: number;
  feePercent: number;
  taxRial: number;
  taxToman: number;
  totalPayableRial: number;
  totalPayableToman: number;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface OrderResult {
  orderId: string;
  transactionId: string;
  side: "BUY" | "SELL";
  amountGrams: number;
  pricePerGramToman: number;
  totalToman: number;
  feeToman: number;
  taxToman: number;
  netReceiveToman: number;
  status: string;
  message: string;
}

export interface PriceHistoryPoint {
  time: string;
  priceRial: number;
  priceToman: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

// ── Hook: قیمت لحظه‌ای (هر ۳۰ ثانیه) ──
export const useMarketPrice = () => {
  const { data, error, isLoading, mutate } = useSWR<GoldPriceData>(
    "/api/market/price",
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );
  return {
    price: data ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت قیمت" : null,
    refresh: mutate,
  };
};

// ── Hook: تاریخچه قیمت ──
export const usePriceHistory = (hours = 24) => {
  const { data, isLoading, error } = useSWR<PriceHistoryPoint[]>(
    `/api/market/price/history?hours=${hours}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 300_000 },
  );
  return { history: data ?? [], loading: isLoading, error };
};

// ── Hook: تایمر Countdown ──
export const useCountdown = (expiresAt: string | null) => {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }

    const calc = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(diff);
      if (diff === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    calc();
    intervalRef.current = setInterval(calc, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [expiresAt]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return { remaining, formatted: `${mm}:${ss}`, expired: remaining === 0 };
};

// ── Hook: قفل قیمت ──
export const usePriceLock = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<PriceLockData | null>(null);

  const lockPrice = useCallback(
    async (side: "BUY" | "SELL", amountGrams: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.post("/api/market/lock-price", {
          side,
          amountGrams,
        });
        setLock(res.data);
        return res.data as PriceLockData;
      } catch (e: unknown) {
        if (axios.isAxiosError(e)) {
          const msg = e.response?.data?.message;
          setError(Array.isArray(msg) ? msg[0] : msg || "خطا در قفل قیمت");
        } else setError("خطای ناشناخته");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clearLock = useCallback(() => {
    setLock(null);
    setError(null);
  }, []);

  return { loading, error, setError, lock, lockPrice, clearLock };
};

// ── Hook: ثبت سفارش ──
export const useCreateOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useCallback(async (lockId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("/api/market/orders", { lockId });
      return res.data as OrderResult;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ثبت سفارش");
      } else setError("خطای ناشناخته");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, createOrder };
};

// ── Hook: تاریخچه سفارشات ──
export const useUserOrders = (page = 1) => {
  const { data, isLoading, error, mutate } = useSWR(
    `/api/market/orders?page=${page}&limit=20`,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    orders: data?.data ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    loading: isLoading,
    error,
    refresh: mutate,
  };
};
