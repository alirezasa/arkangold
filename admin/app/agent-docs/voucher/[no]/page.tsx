// admin/app/agent-docs/voucher/[no]/page.tsx
// حواله‌ی تحویل امانی / عودت / تحویل شمش خریداری‌شده (فروش قطعی) / تحویل شمش به شرکت (فروش نماینده به شرکت)
// — قابل چاپ و امضا توسط تحویل‌دهنده و تحویل‌گیرنده
"use client";
import { use, useEffect, useState } from "react";
import axios from "axios";
import { DocShell, fa, faDateTime, getMessage } from "../../DocShell";

interface Voucher {
  voucherNumber: string;
  type: "ALLOCATION" | "RETURN" | "PURCHASE" | "BUYBACK";
  createdAt: string;
  note: string | null;
  performedBy: string | null;
  journalEntryId: string | null;
  agent: { code: string; name: string; managerName: string; phone: string; nationalCode: string | null; address: string | null; city: string | null };
  count: number;
  totalGrams: string;
  items: { code: string; productName: string | null; purityKarat: string | null; factorySerialNumber: string | null; weightGrams: string }[];
}

export default function VoucherPrintPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = use(params);
  const [doc, setDoc] = useState<Voucher | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scope = new URLSearchParams(window.location.search).get("scope");
    const url =
      scope === "agent"
        ? `/api/agent-portal/vouchers/${encodeURIComponent(no)}`
        : `/api/admin/agents/vouchers/${encodeURIComponent(no)}`;
    axios
      .get<Voucher>(url)
      .then((r) => setDoc(r.data))
      .catch((err) => setError(getMessage(err, "این حواله در دسترس نیست")));
  }, [no]);

  // شرکت تحویل‌دهنده است: تحویل امانی و تحویل شمش خریداری‌شده
  const isAllocation = doc?.type === "ALLOCATION" || doc?.type === "PURCHASE";
  const title =
    doc?.type === "PURCHASE"
      ? "حواله تحویل شمش فروخته‌شده به نماینده (بیع قطعی)"
      : doc?.type === "BUYBACK"
        ? "حواله تحویل شمش نماینده به شرکت (خرید از نماینده)"
        : doc?.type === "ALLOCATION"
          ? "حواله تحویل امانی شمش به نماینده"
          : "حواله عودت شمش از نماینده به خزانه";

  return (
    <DocShell loading={!doc && !error} error={error}>
      {doc && (
        <div className="doc-sheet doc-sheet--portrait">
          <div className="doc-head">
            <div className="doc-head__brand">
              <div>
                <div className="doc-head__legal">آرکان گلد</div>
                <div className="doc-head__sub">{title}</div>
              </div>
            </div>
            <div className="doc-meta">
              <div className="doc-meta__row">
                <span className="doc-meta__label">شماره حواله</span>
                <span className="doc-meta__value" dir="ltr">{doc.voucherNumber}</span>
              </div>
              <div className="doc-meta__row">
                <span className="doc-meta__label">تاریخ</span>
                <span className="doc-meta__value">{faDateTime(doc.createdAt)}</span>
              </div>
              <div className="doc-meta__row">
                <span className="doc-meta__label">ثبت‌کننده</span>
                <span className="doc-meta__value">{doc.performedBy ?? "—"}</span>
              </div>
            </div>
          </div>
          <div className="doc-rule" />
          <div className="doc-parties">
            <div className="doc-party">
              <div className="doc-party__head">{isAllocation ? "تحویل‌دهنده" : "تحویل‌گیرنده"}</div>
              <div className="doc-party__body">خزانه شرکت آرکان گلد</div>
            </div>
            <div className="doc-party">
              <div className="doc-party__head">نماینده</div>
              <div className="doc-party__body">
                <div className="doc-field"><span className="doc-field__k">نام:</span><span className="doc-field__v">{doc.agent.name} ({doc.agent.code})</span></div>
                <div className="doc-field"><span className="doc-field__k">مسئول:</span><span className="doc-field__v">{doc.agent.managerName}</span></div>
                <div className="doc-field"><span className="doc-field__k">کد ملی:</span><span className="doc-field__v">{doc.agent.nationalCode ?? "—"}</span></div>
                <div className="doc-field"><span className="doc-field__k">تلفن:</span><span className="doc-field__v" dir="ltr">{doc.agent.phone}</span></div>
                <div className="doc-field"><span className="doc-field__k">نشانی:</span><span className="doc-field__v">{[doc.agent.city, doc.agent.address].filter(Boolean).join("، ") || "—"}</span></div>
              </div>
            </div>
          </div>
          <table className="doc-table">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>کد هولوگرام</th>
                <th>شرح</th>
                <th>عیار</th>
                <th>سریال کارخانه</th>
                <th>وزن (گرم)</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((i, idx) => (
                <tr key={i.code}>
                  <td>{(idx + 1).toLocaleString("fa-IR")}</td>
                  <td dir="ltr">{i.code}</td>
                  <td className="is-title">{i.productName ?? "شمش طلا"}</td>
                  <td>{i.purityKarat === "K18" ? "۱۸" : "۲۴"}</td>
                  <td dir="ltr">{i.factorySerialNumber ?? "—"}</td>
                  <td>{fa(i.weightGrams)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="is-title">جمع: {doc.count.toLocaleString("fa-IR")} شمش</td>
                <td><b>{fa(doc.totalGrams)}</b></td>
              </tr>
            </tbody>
          </table>
          {doc.note && <div className="doc-notes" style={{ marginTop: 10 }}>توضیحات: {doc.note}</div>}
          <ul className="doc-clauses">
            {doc.type === "PURCHASE" ? (
              <>
                <li>شمش‌های فوق طبق صورتحساب فروش صادرشده به نام نماینده، به‌صورت قطعی به نماینده فروخته و تحویل شد و ملک نماینده است.</li>
                <li>نماینده تعداد، وزن درج‌شده، سلامت بسته‌بندی و هولوگرام را بررسی کرد؛ ادعای کسری یا ایراد ظاهری پس از تأیید رسید پذیرفته نیست (بند ۶-۳ قرارداد).</li>
                <li>مسئولیت تلف، سرقت یا آسیب از لحظه‌ی تحویل با نماینده است. نماینده هنگام فروش به مشتری، صورتحساب را خودش صادر می‌کند و فروش را برای ثبت اصالت در پنل ثبت می‌کند.</li>
              </>
            ) : doc.type === "BUYBACK" ? (
              <>
                <li>شمش‌های فوق از نماینده (فروشنده) تحویل گرفته شد و پس از بازرسی، با بهای تأییدشده وارد موجودی خزانه‌ی شرکت گردید.</li>
                <li>نماینده صورتحساب الکترونیک فروش را به نام شرکت در سامانه مؤدیان صادر می‌کند.</li>
              </>
            ) : isAllocation ? (
              <>
                <li>شمش‌های فوق به‌صورت امانی و متعلق به شرکت آرکان گلد در اختیار نماینده قرار گرفت و تا زمان فروش به مشتری نهایی، مالکیت آن با شرکت است.</li>
                <li>فروش فقط از طریق پنل نمایندگی و با ثبت مشخصات هویتی خریدار مجاز است؛ با ثبت فروش، همان شمش به قیمت نمایندگی به نماینده فروخته و صورتحساب آن به نام نماینده صادر می‌شود.</li>
                <li>نماینده مسئول نگهداری، تطبیق کد هولوگرام و تسویه‌ی بدهی طبق قرارداد و الحاقیه‌ی امانت است.</li>
              </>
            ) : (
              <li>شمش‌های فوق از نماینده تحویل گرفته شد و از موجودی امانی نماینده کسر گردید.</li>
            )}
            {doc.journalEntryId && <li>شناسه سند حسابداری: <span dir="ltr">{doc.journalEntryId}</span></li>}
          </ul>
          <div className="doc-foot" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 28 }}>
            <div className="doc-seal">امضا و مهر تحویل‌دهنده<div className="doc-sign-box" /></div>
            <div className="doc-seal">امضا و اثر انگشت تحویل‌گیرنده<div className="doc-sign-box" /></div>
          </div>
        </div>
      )}
    </DocShell>
  );
}
