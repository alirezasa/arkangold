// app/app/hooks/useTrading.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import useSWR from "swr";

// ── Types ──
export interface GoldPriceData {
  metal: string;
  pricePerGramRial: number;
  pricePerGramToman: number;
  change24h?: number;
  source: string;
  fetchedAt: string;
  fromCache: boolean;
  /** توقف خرید/فروش اعلام‌شده از سوی منبع قیمت */
  disableBuy?: boolean;
  disableSell?: boolean;
}

/** حدود و نرخ‌های معامله طلای آب‌شده (از تنظیمات پنل ادمین) — مقادیر عددی به‌صورت رشته */
export interface TradeSideInfo {
  enabled: boolean;
  feePercent: string;
  taxPercent: string;
  dailyLimitGrams: string;
  monthlyLimitGrams: string;
  usedTodayGrams: string;
  usedThisMonthGrams: string;
  /** null یعنی بدون سقف */
  remainingTodayGrams: string | null;
  remainingThisMonthGrams: string | null;
}

export interface TradeInfo {
  serviceEnabled: boolean;
  priceAvailable: boolean;
  minGrams: string;
  maxGrams: string;
  spreadPercent: string;
  lockDurationSeconds: number;
  buy: TradeSideInfo;
  sell: TradeSideInfo;
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
  side: "BUY" | "SELL";
  amountGrams: number | string;
  pricePerGramToman: number | string;
  /** ارزش طلا (بدون کارمزد و مالیات) */
  totalToman: number | string;
  feeToman: number | string;
  taxToman: number | string;
  /** مبلغ نهایی پرداخت‌شده (خرید) یا واریزشده به کیف پول (فروش) */
  netToman: number | string;
  status: string;
  alreadyProcessed?: boolean;
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

// ── Hook: حدود و سقف‌های معامله (با هر معامله‌ی موفق باید refresh شود) ──
export const useTradeInfo = () => {
  const { data, isLoading, mutate } = useSWR<TradeInfo>(
    "/api/market/trade-info",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  );
  return { info: data ?? null, loading: isLoading, refresh: mutate };
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
  // تنها زمان فعلی را در state نگه می‌داریم
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;

    // آپدیت کردن زمان فعلی هر ۱ ثانیه
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // محاسبه زمان باقی‌مانده به صورت مشتق‌شده در زمان رندر
  const remaining = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : 0;

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
      setLock(null);
      try {
        const res = await axios.post("/api/market/lock-price", {
          side,
          amountGrams,
        });
        const data = res.data as PriceLockData;
        // ساعت گوشی کاربر ممکن است با سرور اختلاف داشته باشد؛ شمارش معکوس بر پایه‌ی
        // مدت اعتبار (نه زمان مطلق سرور) و با ۳ ثانیه حاشیه‌ی تأخیر شبکه محاسبه می‌شود
        const seconds = Number(data.expiresInSeconds);
        const local: PriceLockData =
          Number.isFinite(seconds) && seconds > 0
            ? {
                ...data,
                expiresAt: new Date(
                  Date.now() + Math.max(seconds - 3, 1) * 1000,
                ).toISOString(),
              }
            : data;
        setLock(local);
        return local;
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
