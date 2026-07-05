import axios from "axios";
import useSWR from "swr";

export type TxCategory =
  | "buy"
  | "sell"
  | "deposit"
  | "withdrawal"
  | "fee"
  | "shop"
  | "physical"
  | "other";
export type TxStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface TransactionItem {
  id: string;
  type: string;
  category: TxCategory;
  title: string;
  status: TxStatus;
  amountGrams: string | null;
  amountRial: string | null;
  amountToman: string | null;
  pricePerGramToman: string | null;
  feeToman: string | null;
  taxToman: string | null;
  sign: "plus" | "minus";
  createdAt: string;
  description?: string;
}

export interface TransactionsResponse {
  data: TransactionItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TransactionsSummary {
  monthDepositRial: number;
  monthWithdrawalRial: number;
  todayBuyGoldGrams: number;
  todaySellGoldGrams: number;
  totalCount: number;
}

export type TxFilter = "ALL" | "BUY_GOLD" | "SELL_GOLD" | "DEPOSIT" | "WITHDRAWAL";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

// ── هوک: تاریخچه تراکنش‌ها با فیلتر و صفحه‌بندی ──
export const useTransactions = (page: number, filter: TxFilter = "ALL") => {
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (filter !== "ALL") qs.set("type", filter);

  const { data, isLoading, error, mutate } = useSWR<TransactionsResponse>(
    `/api/transactions?${qs.toString()}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    transactions: data?.data ?? [],
    page: data?.page ?? page,
    totalPages: data?.totalPages ?? 1,
    total: data?.total ?? 0,
    loading: isLoading,
    error: error ? "خطا در دریافت تراکنش‌ها" : null,
    refresh: mutate,
  };
};

// ── هوک: خلاصه آماری ──
export const useTransactionsSummary = () => {
  const { data, isLoading, error } = useSWR<TransactionsSummary>(
    "/api/transactions/summary",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { summary: data ?? null, loading: isLoading, error };
};

// ── هوک: جزئیات یک تراکنش ──
export const useTransactionDetail = (id: string | null) => {
  const { data, isLoading, error } = useSWR<TransactionItem>(
    id ? `/api/transactions/${id}` : null,
    fetcher,
  );
  return { transaction: data ?? null, loading: isLoading, error };
};