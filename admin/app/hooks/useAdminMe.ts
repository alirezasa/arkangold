// admin/app/hooks/useAdminMe.ts
"use client";
import useSWR from "swr";
import axios from "axios";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export interface AdminMe {
  id: string;
  username: string;
  fullName: string;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  role: { key: string; name: string };
  permissions: string[];
}

export const useAdminMe = () => {
  const { data, error, isLoading } = useSWR<AdminMe>("/api/admin-auth/me", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { me: data ?? null, loading: isLoading, error };
};