// admin/app/agent-docs/statement/page.tsx
// صورتحساب چاپی نماینده در یک بازه (مدیریت: ?agentId=… — نماینده: ?scope=agent)
"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { DocShell, faDateTime, faToman, getMessage } from "../DocShell";

interface Row {
  id: string;
  type: string;
  debitRial: string;
  creditRial: string;
  balanceAfterRial: string;
  description: string;
  referenceNumber: string | null;
  createdAt: string;
}
interface Statement {
  agent: { code: string; name: string };
  openingBalanceRial: string;
  totalDebitRial: string;
  totalCreditRial: string;
  closingBalanceRial: string;
  data: Row[];
  totalPages: number;
}

const TYPE_FA: Record<string, string> = { SALE: "فروش", SALE_VOID: "ابطال فروش", SETTLEMENT: "تسویه", ADJUSTMENT: "اصلاحیه" };

export default function StatementPrintPage() {
  const [doc, setDoc] = useState<(Statement & { from: string | null; to: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const base = q.get("scope") === "agent" ? "/api/agent-portal/statement" : `/api/admin/agents/${q.get("agentId") ?? ""}/statement`;
    const from = q.get("from");
    const to = q.get("to");
    const load = async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      let first: Statement | null = null;
      const rows: Row[] = [];
      for (let p = 1; p <= 50; p++) {
        params.set("page", String(p));
        const res = await axios.get<Statement>(`${base}?${params.toString()}`);
        first ??= res.data;
        rows.push(...res.data.data);
        if (p >= res.data.totalPages) break;
      }
      if (first) setDoc({ ...first, data: rows, from, to });
    };
    load().catch((err) => setError(getMessage(err, "صورتحساب در دسترس نیست")));
  }, []);

  return (
    <DocShell loading={!doc && !error} error={error}>
      {doc && (
        <div className="doc-sheet doc-sheet--portrait">
          <div className="doc-head">
            <div className="doc-head__brand">
              <div>
                <div className="doc-head__legal">آرکان گلد — صورتحساب نماینده</div>
                <div className="doc-head__sub">
                  {doc.agent.name} ({doc.agent.code})
                </div>
              </div>
            </div>
            <div className="doc-meta">
              <div className="doc-meta__row">
                <span className="doc-meta__label">از تاریخ</span>
                <span className="doc-meta__value">{doc.from ? new Date(doc.from).toLocaleDateString("fa-IR") : "ابتدا"}</span>
              </div>
              <div className="doc-meta__row">
                <span className="doc-meta__label">تا تاریخ</span>
                <span className="doc-meta__value">{doc.to ? new Date(doc.to).toLocaleDateString("fa-IR") : "امروز"}</span>
              </div>
              <div className="doc-meta__row">
                <span className="doc-meta__label">تاریخ چاپ</span>
                <span className="doc-meta__value">{faDateTime(new Date().toISOString())}</span>
              </div>
            </div>
          </div>
          <div className="doc-rule" />
          <table className="doc-table">
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>نوع</th>
                <th>مرجع</th>
                <th>شرح</th>
                <th>بدهکار</th>
                <th>بستانکار</th>
                <th>مانده</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="is-title">مانده ابتدای دوره</td>
                <td><b>{faToman(doc.openingBalanceRial)}</b></td>
              </tr>
              {doc.data.map((r) => (
                <tr key={r.id}>
                  <td>{faDateTime(r.createdAt)}</td>
                  <td>{TYPE_FA[r.type] ?? r.type}</td>
                  <td dir="ltr">{r.referenceNumber ?? "—"}</td>
                  <td className="is-title">{r.description}</td>
                  <td>{Number(r.debitRial) ? faToman(r.debitRial) : ""}</td>
                  <td>{Number(r.creditRial) ? faToman(r.creditRial) : ""}</td>
                  <td>{faToman(r.balanceAfterRial)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="is-title">جمع گردش دوره</td>
                <td><b>{faToman(doc.totalDebitRial)}</b></td>
                <td><b>{faToman(doc.totalCreditRial)}</b></td>
                <td><b>{faToman(doc.closingBalanceRial)}</b></td>
              </tr>
            </tbody>
          </table>
          <ul className="doc-clauses">
            <li>مبالغ به تومان است. مانده‌ی مثبت: بدهی نماینده به شرکت؛ مانده‌ی منفی: بستانکاری نماینده.</li>
            <li>بدهکار = سهم شرکت از فروش (پس از کسر حق‌العمل) و اصلاحیه‌های افزایشی؛ بستانکار = تسویه‌های تأییدشده، ابطال فروش و اصلاحیه‌های کاهشی.</li>
          </ul>
          <div className="doc-foot" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 28 }}>
            <div className="doc-seal">امضای واحد مالی<div className="doc-sign-box" /></div>
            <div className="doc-seal">امضای نماینده<div className="doc-sign-box" /></div>
          </div>
        </div>
      )}
    </DocShell>
  );
}
