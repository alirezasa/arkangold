import { useState, useCallback } from "react";
import axios from "axios";
import useSWR from "swr";

export interface AddressItem {
  id: string;
  title?: string | null;
  fullAddress: string;
  city?: string | null;
  province?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  isDefault: boolean;
}

export interface PhysicalDeliveryConfig {
  minGrams: number;
  maxGrams: number;
  feePerGramToman: string;
  processingTime: string;
}

export interface PhysicalDeliveryRequestItem {
  id: string;
  amountGrams: string;
  feeToman: string;
  status: "PENDING" | "APPROVED" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  trackingCode: string | null;
  adminNotes: string | null;
  address: AddressItem;
  shippings: unknown[];
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useAddresses = () => {
  const { data, isLoading, error, mutate } = useSWR<AddressItem[]>(
    "/api/user/addresses",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { addresses: data ?? [], loading: isLoading, error, refresh: mutate };
};

export const usePhysicalDeliveryConfig = () => {
  const { data, isLoading, error } = useSWR<PhysicalDeliveryConfig>(
    "/api/physical-delivery/config",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { config: data ?? null, loading: isLoading, error };
};

export const usePhysicalDeliveryRequests = (page = 1) => {
  const { data, isLoading, error, mutate } = useSWR(
    `/api/physical-delivery?page=${page}&limit=20`,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    requests: (data?.data ?? []) as PhysicalDeliveryRequestItem[],
    totalPages: data?.totalPages ?? 1,
    loading: isLoading,
    error,
    refresh: mutate,
  };
};

export const useCreatePhysicalDelivery = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (payload: { addressId: string; amountGrams: number }) => {
      setLoading(true);
      setError(null);
      try {
        // کلید یکتای idempotency برای جلوگیری از ثبت تکراری روی retry/دابل‌کلیک
        const idempotencyKey =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;

        const res = await axios.post("/api/physical-delivery", payload, {
          headers: { "idempotency-key": idempotencyKey },
        });
        return res.data;
      } catch (e: unknown) {
        if (axios.isAxiosError(e)) {
          const msg = e.response?.data?.message;
          setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ثبت درخواست");
        } else setError("خطای ناشناخته");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, setError, create };
};

export const useCancelPhysicalDelivery = () => {
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`/api/physical-delivery/${id}/cancel`);
      return res.data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, cancel };
};
