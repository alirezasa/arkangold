// admin/app/invoices/[id]/print/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { AlertCircle, ArrowRight, Loader2, Printer } from "lucide-react";
import InvoiceDocumentView from "../../components/InvoiceDocument";
import ProformaDocument from "../../components/ProformaDocument";
import type { InvoiceDocument } from "../../components/document.types";

export default function AdminInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<InvoiceDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // نماینده‌ی فروش فاکتور فروش‌های خودش را از مسیر پرتال نمایندگی می‌گیرد
    const scope = new URLSearchParams(window.location.search).get("scope");
    const url =
      scope === "agent"
        ? `/api/agent-portal/invoices/${id}`
        : `/api/admin/invoices/${id}`;
    axios
      .get<InvoiceDocument>(url)
      .then((res) => {
        if (!cancelled) setDoc(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.message
          : null;
        setError(typeof msg === "string" ? msg : "این سند در دسترس نیست");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="doc-root">
        <div
          style={{
            maxWidth: 420,
            margin: "80px auto",
            textAlign: "center",
            background: "#fff",
            padding: 32,
            borderRadius: 20,
          }}
        >
          <AlertCircle
            style={{ margin: "0 auto 12px", color: "#a3161c" }}
            size={40}
          />
          <p style={{ fontWeight: 800, marginBottom: 18 }}>{error}</p>
          <button
            className="doc-btn doc-btn--primary"
            onClick={() => router.back()}
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="doc-root">
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: 100,
            color: "#330509",
          }}
        >
          <Loader2 className="animate-spin" size={30} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        doc.orientation === "landscape"
          ? "doc-root doc-page--landscape"
          : "doc-root"
      }
    >
      <div className="doc-toolbar no-print">
        <button
          className="doc-btn doc-btn--primary"
          onClick={() => window.print()}
        >
          <Printer size={16} />
          چاپ یا ذخیره PDF
        </button>
        <button className="doc-btn doc-btn--ghost" onClick={() => router.back()}>
          <ArrowRight size={16} />
          بازگشت
        </button>
        <span style={{ fontSize: 12, color: "#6b6459", marginRight: "auto" }}>
          در پنجره چاپ، اندازه کاغذ روی A4 و مقیاس روی «اندازه واقعی» باشد.
        </span>
      </div>

      {doc.kind === "PROFORMA" ? (
        <ProformaDocument doc={doc} />
      ) : (
        <InvoiceDocumentView doc={doc} />
      )}
    </div>
  );
}
