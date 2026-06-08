import { useCallback, useState } from "react";
import axios from "axios";
import useSWR from "swr";

export interface IdentityData {
  firstName: string | null;
  lastName: string | null;
  nationalCode: string | null;
  birthDate: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW" | null;
  verifiedAt: string | null;
}

export interface LegalProfileData {
  id: string;
  companyName: string;
  nationalId: string;
  economicCode: string | null;
  registrationNumber: string | null;
  representativeId: string | null;
  verified: boolean;
}

export interface ProfilePageData {
  id: string;
  phone: string;
  type: "REAL" | "LEGAL";
  status: string;
  referralCode: string;
  identity: IdentityData | null;
  legalProfile: LegalProfileData | null;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useProfilePage = () => {
  const { data, isLoading, error, mutate } = useSWR<ProfilePageData>(
    "/api/user/profile",
    fetcher,
    { revalidateOnFocus: false },
  );

  const refetch = useCallback(() => mutate(), [mutate]);

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت پروفایل" : null,
    refetch,
  };
};

export const useLegalProfileForm = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (formData: {
    companyName: string;
    nationalId: string;
    economicCode?: string;
    registrationNumber?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/user/legal-profile", formData);
      setSuccess(true);
      return true;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ثبت اطلاعات");
      } else {
        setError("خطای ناشناخته");
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, success, submit };
};
