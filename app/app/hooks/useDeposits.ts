// app/app/hooks/useDeposits.ts
import { useCallback, useState } from "react";
import axios from "axios";
import useSWR from "swr";

export type DepositStatus =
  | "PENDING_PAYMENT" | "RECEIPT_UPLOADED" | "UNDER_REVIEW"
  | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export interface DepositSummary {
  id: string;
  requestNumber: string;
  amountRial: string;
  status: DepositStatus;
  statusLabel: string;
  depositTrackingId: string;
  proformaInvoiceId: string | null;
  receiptCount: number;
  createdAtJalali: string;
  expiresAtJalali: string;
}

export interface DepositDetail extends DepositSummary {
  method: string;
  destination: {
    owner: string;
    bank: string;
    accountNumber: string;
    sheba: string;
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
