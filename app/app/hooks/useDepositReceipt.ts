// app/app/hooks/useDepositReceipt.ts
import { useState, useCallback } from "react";
import axios from "axios";

export const useSubmitDepositReceipt = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (file: File, transactionId: string, proformaId?: string, description?: string) => {
      setLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("transactionId", transactionId);
        if (proformaId) formData.append("proformaId", proformaId);
        if (description) formData.append("description", description);

        const res = await axios.post("/api/wallet/deposit-receipts", formData);
        return res.data;
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const msg = err.response?.data?.message;
          setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ارسال فیش واریزی");
        } else {
          setError("خطای ناشناخته");
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, setError, submit };
};