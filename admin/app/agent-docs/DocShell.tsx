// admin/app/agent-docs/DocShell.tsx
"use client";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Printer } from "lucide-react";

export function DocShell({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  if (error) {
    return (
      <div className="doc-root">
        <div style={{ maxWidth: 420, margin: "80px auto", textAlign: "center", background: "#fff", padding: 32, borderRadius: 20 }}>
          <AlertCircle style={{ margin: "0 auto 12px", color: "#a3161c" }} size={40} />
          <p style={{ fontWeight: 800, marginBottom: 18 }}>{error}</p>
          <button className="doc-btn doc-btn--primary" onClick={() => router.back()}>
            بازگشت
          </button>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="doc-root">
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 100, color: "#330509" }}>
          <Loader2 className="animate-spin" size={30} />
        </div>
      </div>
    );
  }
  return (
    <div className="doc-root">
      <div className="doc-toolbar no-print">
        <button className="doc-btn doc-btn--primary" onClick={() => window.print()}>
          <Printer size={16} />
          چاپ یا ذخیره PDF
        </button>
        <button className="doc-btn doc-btn--ghost" onClick={() => router.back()}>
          <ArrowRight size={16} />
          بازگشت
        </button>
      </div>
      {children}
    </div>
  );
}

export const fa = (v: string | number | null | undefined, digits = 4) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("fa-IR", { maximumFractionDigits: digits });

export const faToman = (rial: string | number | null | undefined) =>
  rial == null ? "—" : Math.round(Number(rial) / 10).toLocaleString("fa-IR");

export const faDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function getMessage(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { message?: string } } };
  return typeof e?.response?.data?.message === "string" ? e.response.data.message : fallback;
}
