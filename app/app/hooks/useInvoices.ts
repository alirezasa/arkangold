// app/app/hooks/useInvoices.ts
import axios from "axios";
import useSWR from "swr";
import type { InvoiceDocument } from "@/app/dashboard/components/documents/document.types";

export interface InvoiceSummary {
  id: string;
  kind: "INVOICE" | "PROFORMA";
  invoiceNumber: string;
  invoiceNumberFa: string;
  status: string;
  totalRial: string;
  sourceType: string;
  issuedAtJalali: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export function useInvoices(kind?: "INVOICE" | "PROFORMA") {
  const key = kind ? `/api/invoices?kind=${kind}` : "/api/invoices";
  const { data, isLoading, mutate } = useSWR<{ items: InvoiceSummary[]; total: number }>(
    key,
    fetcher,
  );
  return {
    invoices: data?.items ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refresh: () => mutate(),
  };
}

export function useInvoice(id: string | null) {
  const { data, isLoading } = useSWR<InvoiceDocument>(
    id ? `/api/invoices/${id}` : null,
    fetcher,
  );
  return { invoice: data ?? null, loading: isLoading };
}

/** صفحه چاپ در تب جدید — layout داشبورد را دور می‌زند */
export function openInvoicePrint(invoiceId: string) {
  window.open(`/invoice/${invoiceId}/print`, "_blank", "noopener,noreferrer");
}
