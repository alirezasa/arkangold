// app/app/dashboard/components/documents/ProformaDocument.tsx
// پیش‌فاکتور واریز — سند نامه‌ای خطاب به بانک، A4 Portrait.

import React from "react";
import type { InvoiceDocument } from "./document.types";
import {
  Num, fa, faGrouped, formatSheba, formatTrackingId, rialToToman,
} from "./document.utils";

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  ISSUED: { cls: "doc-badge--pending", label: "در انتظار پرداخت" },
  CONSUMED: { cls: "doc-badge--approved", label: "واریز تایید شده" },
  EXPIRED: { cls: "doc-badge--rejected", label: "منقضی شده" },
  CANCELLED: { cls: "doc-badge--rejected", label: "باطل شده" },
};

export default function ProformaDocument({ doc }: { doc: InvoiceDocument }) {
  const { company, customer, extra } = doc;
  const badge = STATUS_STYLE[doc.status] ?? STATUS_STYLE.ISSUED;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(doc.verifyUrl)}`;

  return (
    <div className="doc-sheet doc-sheet--portrait">
      {doc.status === "CANCELLED" && <div className="doc-watermark">باطل شد</div>}

      <header className="doc-head">
        <div className="doc-head__brand">
          {company.logoPath && (
            <img src={company.logoPath} alt="" className="doc-head__logo" />
          )}
          <div>
            <div className="doc-head__legal">
              {company.legalName}
              {company.companyType && ` (${company.companyType})`}
            </div>
            <div className="doc-head__sub">
              نام تجاری: {company.brandName} · شماره ثبت:{" "}
              <Num>{fa(company.registrationNumber)}</Num>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div className="doc-title">پیش‌فاکتور واریز وجه</div>
          <div style={{ marginTop: 7 }}>
            <span className={`doc-badge ${badge.cls}`}>{badge.label}</span>
          </div>
        </div>
      </header>

      <div className="doc-rule" />

      <div className="doc-meta" style={{ marginRight: "auto", width: "68mm" }}>
        <div className="doc-meta__row">
          <span className="doc-meta__label">شماره پیش‌فاکتور</span>
          <span className="doc-meta__value">
            <Num>{doc.invoiceNumberFa}</Num>
          </span>
        </div>
        <div className="doc-meta__row">
          <span className="doc-meta__label">تاریخ صدور</span>
          <span className="doc-meta__value">{doc.issuedAtJalali}</span>
        </div>
        <div className="doc-meta__row">
          <span className="doc-meta__label">مهلت اعتبار</span>
          <span className="doc-meta__value">{doc.expiresAtJalali ?? "—"}</span>
        </div>
        <div className="doc-meta__row">
          <span className="doc-meta__label">شناسه ملی شرکت</span>
          <span className="doc-meta__value">
            <Num>{fa(company.nationalId)}</Num>
          </span>
        </div>
        {company.economicCode && (
          <div className="doc-meta__row">
            <span className="doc-meta__label">کد اقتصادی</span>
            <span className="doc-meta__value">
              <Num>{fa(company.economicCode)}</Num>
            </span>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, lineHeight: 2.1, marginTop: 12 }}>
        بدین‌وسیله به استحضار می‌رساند شرکت <b>{company.legalName}</b> به شناسه ملی{" "}
        <b><Num>{fa(company.nationalId)}</Num></b> در چارچوب فعالیت‌های قانونی خود در
        حوزه خرید و فروش طلا، این پیش‌فاکتور را بنا به درخواست مشتری ذیل صادر نموده است:
      </p>

      <table className="doc-table">
        <thead>
          <tr>
            <th style={{ width: "26%" }}>
              {customer.isLegal ? "نام شرکت" : "نام و نام خانوادگی"}
            </th>
            <th style={{ width: "17%" }}>
              {customer.isLegal ? "شناسه ملی" : "کد ملی"}
            </th>
            <th style={{ width: "25%" }}>مبلغ درخواستی</th>
            <th>موضوع</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="is-title" style={{ textAlign: "center" }}>
              {customer.displayName}
            </td>
            <td><Num>{fa(customer.nationalId ?? "—")}</Num></td>
            <td>
              <div style={{ fontWeight: 900, fontSize: 12 }}>
                <Num>{faGrouped(doc.totalRial)}</Num> ریال
              </div>
              <div style={{ fontSize: 9, color: "var(--doc-muted)", marginTop: 2 }}>
                (معادل <Num>{rialToToman(doc.totalRial)}</Num> تومان)
              </div>
              <div style={{ fontSize: 9, marginTop: 4, lineHeight: 1.7 }}>
                {doc.totalInWords}
              </div>
            </td>
            <td className="is-title" style={{ fontSize: 9.5, lineHeight: 1.85 }}>
              {extra?.subject}
            </td>
          </tr>
        </tbody>
      </table>

      {/* تنها عنصری که سند روی آن جسور است */}
      <section className="doc-tracking">
        <div className="doc-tracking__head">شناسه واریز اختصاصی</div>
        <div className="doc-tracking__value">
          <Num>{formatTrackingId(extra?.depositTrackingId ?? "")}</Num>
        </div>
        <div className="doc-tracking__hint">
          این شناسه را حتماً در فیلد «شناسه پایا» وارد کنید
        </div>
      </section>

      <table className="doc-table" style={{ marginTop: 9 }}>
        <tbody>
          <tr>
            <td style={{ width: "30%", background: "var(--doc-gold-soft)", fontWeight: 800 }}>
              نام صاحب حساب
            </td>
            <td className="is-title">{extra?.destination.owner}</td>
          </tr>
          {extra?.destination.bank && (
            <tr>
              <td style={{ background: "var(--doc-gold-soft)", fontWeight: 800 }}>
                بانک مقصد
              </td>
              <td className="is-title">{extra.destination.bank}</td>
            </tr>
          )}
          <tr>
            <td style={{ background: "var(--doc-gold-soft)", fontWeight: 800 }}>
              شماره شبای مقصد
            </td>
            <td className="is-title" style={{ fontWeight: 900, letterSpacing: 1 }}>
              <Num>{formatSheba(extra?.destination.sheba ?? "")}</Num>
            </td>
          </tr>
          {extra?.destination.accountNumber && (
            <tr>
              <td style={{ background: "var(--doc-gold-soft)", fontWeight: 800 }}>
                شماره حساب
              </td>
              <td className="is-title">
                <Num>{fa(extra.destination.accountNumber)}</Num>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ol className="doc-clauses">
        {extra?.legalClauses.map((c, i) => <li key={i}>{c}</li>)}
      </ol>

      <div className="doc-foot">
        <div className="doc-qr">
          <img src={qrSrc} alt="استعلام اصالت سند" width={70} height={70} />
          <div className="doc-qr__hash">
            <Num>{doc.contentHash.slice(0, 16)}</Num>
          </div>
        </div>
        <div />
        <div className="doc-seal">
          با تشکر — {company.legalName}
          {company.sealImagePath && (
            <img src={company.sealImagePath} alt="مهر و امضا" className="doc-seal__img" />
          )}
        </div>
      </div>

      <footer className="doc-contact">
        <span>دفتر مرکزی: {company.address}</span>
        {company.postalCode && (
          <span>کدپستی: <Num>{fa(company.postalCode)}</Num></span>
        )}
        {company.phone && <span>تلفن: <Num>{fa(company.phone)}</Num></span>}
        <span>{company.website}</span>
      </footer>
    </div>
  );
}
