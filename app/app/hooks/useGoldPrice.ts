"use client";

import useSWR from "swr";
import { fetchGoldPrice } from "@/app/core/services/gold";

export function useGoldPrice() {
  const { data, error, isLoading, mutate } = useSWR(
    "gold-price",
    fetchGoldPrice,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  return {
    data,
    loading: isLoading,
    error,
    refresh: mutate,
  };
}