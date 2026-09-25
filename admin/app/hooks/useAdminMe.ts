// admin/app/hooks/useAdminMe.ts
"use client";
import useSWR from "swr";
import axios from "axios";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export interface AdminMe {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  createdBy: string | null;
  activeSessions: number;
  currentSessionId: string | null;
  role: { key: string; name: string; description?: string | null };
  permissions: string[];
  permissionDetails: { key: string; group: string; description: string | null }[];
  /** اگر حساب متعلق به یک نماینده فروش باشد */
  agent: {
    id: string;
    code: string;
    name: string;
    status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  } | null;
}

export const ADMIN_ME_KEY = "/api/admin-auth/me";

export const useAdminMe = () => {
  const { data, error, isLoading, mutate } = useSWR<AdminMe>(
    ADMIN_ME_KEY,
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  return { me: data ?? null, loading: isLoading, error, mutate };
};
