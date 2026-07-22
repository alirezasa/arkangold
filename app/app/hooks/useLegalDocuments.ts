// app/app/hooks/useLegalDocuments.ts
import { useState, useCallback } from "react";
import axios from "axios";
import useSWR from "swr";

export interface LegalDocument {
  id: string;
  type: "INTRODUCTION_LETTER" | "ARTICLES_OF_ASSOCIATION" | "OTHER";
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

export const DOC_TYPES: {
  key: LegalDocument["type"];
  label: string;
  required: boolean;
}[] = [
  { key: "INTRODUCTION_LETTER", label: "معرفی‌نامه نماینده", required: true },
  { key: "ARTICLES_OF_ASSOCIATION", label: "اساسنامه شرکت", required: true },
  { key: "OTHER", label: "سایر مدارک", required: false },
];

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const useLegalDocuments = () => {
  const { data, mutate, isLoading } = useSWR<LegalDocument[]>(
    "/api/user/legal-profile/documents",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { documents: data ?? [], loading: isLoading, refetch: () => mutate() };
};

export const useUploadLegalDocument = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File, type: string) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await axios.post(
        "/api/user/legal-profile/documents",
        formData,
      );
      return res.data as LegalDocument;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در آپلود فایل");
      } else setError("خطای ناشناخته");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { upload, loading, error, setError };
};

export const useRemoveLegalDocument = () => {
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await axios.delete(`/api/user/legal-profile/documents/${id}`);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { remove, loading };
};

export const useRequestLegalUpgrade = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/user/legal-profile/request-upgrade");
      return true;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ثبت درخواست");
      } else setError("خطای ناشناخته");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading, error, setError };
};
