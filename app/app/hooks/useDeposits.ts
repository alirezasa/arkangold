// app/app/hooks/useDeposits.ts
import { useCallback, useState } from "react";
import axios from "axios";
import useSWR from "swr";

export type DepositStatus =
  | "PENDING_PAYMENT" | "RECEIPT_UPLOADED" | "UNDER_REVIEW"
  | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export type DepositMethod =
  | "LARGE_TRANSFER" | "CARD_TO_CARD" | "BANK_TRANSFER"
  | "ONLINE" | "TRACKING_ID" | "DIRECT";

export const DEPOSIT_METHOD_LABEL: Record<string, string> = {
  LARGE_TRANSFER: "واریز مبالغ بالا (پیش‌فاکتور)",
  CARD_TO_CARD: "کارت به کارت",
  BANK_TRANSFER: "حساب به حساب",
  ONLINE: "درگاه پرداخت",
  TRACKING_ID: "واریز شناسه‌دار",
  DIRECT: "واریز مستقیم",
};

export interface DepositSummary {
  id: string;
  requestNumber: string;
  amountRial: string;
  method?: DepositMethod;
  status: DepositStatus;
  statusLabel: string;
  depositTrackingId: string;
  proformaInvoiceId: string | null;
  receiptCount: number;
  createdAtJalali: string;
  expiresAtJalali: string;
}

export interface DepositDetail extends DepositSummary {
  method: DepositMethod;
  destination: {
    owner: string;
    bank: string;
    accountNumber: string;
    sheba: string;
    /** فقط کارت به کارت */
    card?: string;
    /** کارت/حساب مبدأ کاربر (کارت به کارت و حساب به حساب) */
    source?: { bankName: string; cardNumber: string; sheba: string | null };
  };
  proformaInvoiceNumber: string | null;
  rejectionReason: string | null;
  rejectionCount: number;
  canUploadReceipt: boolean;
  canCancel: boolean;
  createdAt: string;
  expiresAt: string;
  reviewedAtJalali: string | null;
  receipts: {
    id: string;
    fileName: string;
    fileSize: number;
    userNote: string | null;
    uploadedAtJalali: string;
  }[];
}

function errText(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const m = err.response?.data?.message;
    return Array.isArray(m) ? m[0] : m || fallback;
  }
  return fallback;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export function useDeposits(status?: DepositStatus) {
  const key = status
    ? `/api/wallet/deposits?status=${status}`
    : "/api/wallet/deposits";
  const { data, isLoading, mutate } = useSWR<{ items: DepositSummary[]; total: number }>(
    key,
    fetcher,
  );
  return {
    deposits: data?.items ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refresh: () => mutate(),
  };
}

export function useDeposit(id: string | null) {
  const { data, isLoading, mutate } = useSWR<DepositDetail>(
    id ? `/api/wallet/deposits/${id}` : null,
    fetcher,
  );
  return { deposit: data ?? null, loading: isLoading, refresh: () => mutate() };
}

export function useCreateDeposit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (amountRial: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<DepositDetail>(
        "/api/wallet/deposits",
        { amountRial },
        // تکرار درخواست در اثر کلیک دوباره یا قطع شبکه، درخواست دوم نمی‌سازد
        { headers: { "idempotency-key": crypto.randomUUID() } },
      );
      return res.data;
    } catch (err) {
      setError(errText(err, "ثبت درخواست واریز ناموفق بود"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error, setError };
}

/** ثبت واریز کارت به کارت / حساب به حساب پس از انجام واریز */
export function useCreateManualDeposit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: {
      method: "CARD_TO_CARD" | "BANK_TRANSFER";
      amountRial: number;
      sourceCardId: string;
      idempotencyKey: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.post<DepositDetail>(
          "/api/wallet/deposits/manual",
          {
            method: input.method,
            amountRial: input.amountRial,
            sourceCardId: input.sourceCardId,
          },
          // کلید ثابتِ همان فرم: تلاش مجدد پس از خطای آپلود، درخواست دوم نمی‌سازد
          { headers: { "idempotency-key": input.idempotencyKey } },
        );
        return res.data;
      } catch (err) {
        setError(errText(err, "ثبت درخواست واریز ناموفق بود"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { create, loading, error, setError };
}

export function useUploadReceipt() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (depositId: string, file: File, description?: string) => {
      setLoading(true);
      setError(null);
      setProgress(0);
      try {
        const form = new FormData();
        form.append("file", file);
        if (description) form.append("description", description);

        await axios.post(`/api/wallet/deposits/${depositId}/receipt`, form, {
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        });
        return true;
      } catch (err) {
        setError(errText(err, "ارسال فیش ناموفق بود"));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { upload, loading, progress, error, setError };
}

export function useCancelDeposit() {
  const [loading, setLoading] = useState(false);
  const cancel = useCallback(async (depositId: string) => {
    setLoading(true);
    try {
      await axios.post(`/api/wallet/deposits/${depositId}/cancel`);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);
  return { cancel, loading };
}
