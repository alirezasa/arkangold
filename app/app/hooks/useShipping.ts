"use client";
// دفترچه‌ی آدرس، فهرست استان‌ها و گزینه‌های ارسال سبد خرید
import { useCallback, useState } from "react";
import axios from "axios";
import useSWR from "swr";
import type { AddressItem } from "./usePhysicalDelivery";

export interface Province {
  code: string;
  name: string;
  capital: string;
  cities: string[];
}

export type ShippingMethodType = "POST" | "COURIER" | "EXPRESS" | "PICKUP";
export type ShippingFeePayment = "PREPAID" | "ON_DELIVERY" | "CUSTOMER_CHOICE";

export interface ShippingOption {
  methodId: string;
  code: string;
  name: string;
  type: ShippingMethodType;
  description: string | null;
  carrierName: string | null;
  zoneName: string;
  available: boolean;
  unavailableReason: string | null;
  /** هزینه‌ی تعرفه (تومان) */
  feeToman: string;
  free: boolean;
  freeAboveToman: string | null;
  feePayment: ShippingFeePayment;
  /** مبلغی که در صورت پیش‌پرداخت به سفارش افزوده می‌شود (تومان) */
  prepaidChargeToman: string;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  pickupAddress: string | null;
  pickupHours: string | null;
}

export interface ShippingOptionsResponse {
  enabled: boolean;
  addressId: string;
  provinceResolved?: boolean;
  weightGrams: number;
  options: ShippingOption[];
}

export type AddressInput = {
  title: string;
  provinceCode: string;
  city: string;
  postalCode: string;
  fullAddress: string;
  plaque: string;
  unit: string;
  receiverName: string;
  receiverPhone: string;
  isDefault?: boolean;
};

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export function apiError(e: unknown, fallback = "خطا در انجام عملیات") {
  if (axios.isAxiosError(e)) {
    const msg = (e.response?.data as { message?: string | string[] } | undefined)?.message;
    return (Array.isArray(msg) ? msg[0] : msg) || fallback;
  }
  return fallback;
}

export const useProvinces = () => {
  const { data, isLoading } = useSWR<Province[]>("/api/shipping/provinces", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60 * 60 * 1000,
  });
  return { provinces: data ?? [], loading: isLoading };
};

/** گزینه‌های ارسال سبد خرید فعلی برای یک آدرس (null = هنوز آدرسی انتخاب نشده) */
export const useShippingOptions = (addressId: string | null) => {
  const { data, isLoading, error, mutate } = useSWR<ShippingOptionsResponse>(
    addressId ? `/api/shipping/options?addressId=${encodeURIComponent(addressId)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    data: data ?? null,
    loading: isLoading,
    error: error
      ? apiError(error, "خطا در دریافت روش‌های ارسال")
      : data?.provinceResolved === false
        ? "استان این آدرس مشخص نیست؛ از «مدیریت آدرس‌ها» آدرس را ویرایش و استان را انتخاب کنید"
        : null,
    refresh: mutate,
  };
};

/** عملیات دفترچه‌ی آدرس */
export const useAddressActions = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(apiError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(
    (input: AddressInput, id?: string) =>
      run(async () =>
        (id
          ? await axios.patch<AddressItem>(`/api/user/addresses/${id}`, input)
          : await axios.post<AddressItem>("/api/user/addresses", input)
        ).data,
      ),
    [run],
  );
  const remove = useCallback(
    (id: string) => run(async () => (await axios.delete(`/api/user/addresses/${id}`)).data),
    [run],
  );
  const setDefault = useCallback(
    (id: string) => run(async () => (await axios.post(`/api/user/addresses/${id}/default`)).data),
    [run],
  );

  return { busy, error, setError, save, remove, setDefault };
};

export function formatAddressLine(a: Pick<AddressItem, "province" | "city" | "fullAddress" | "plaque" | "unit">) {
  return [
    a.province,
    a.city,
    a.fullAddress,
    a.plaque ? `پلاک ${a.plaque}` : null,
    a.unit ? `واحد ${a.unit}` : null,
  ]
    .filter(Boolean)
    .join("، ");
}

export function etaLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const f = (n: number) => n.toLocaleString("fa-IR");
  if (min === 0 && (max ?? 0) <= 1) return "همان روز تا ۱ روز کاری";
  if (min != null && max != null && max !== min) return `${f(min)} تا ${f(max)} روز کاری`;
  return `${f((max ?? min)!)} روز کاری`;
}
