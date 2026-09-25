// app/app/dashboard/components/documents/InvoiceDocument.tsx
// فاکتور فروش — A4 Landscape به‌خاطر ۱۱ ستون جدول اقلام طلا.

import React from "react";
import type { InvoiceDocument } from "./document.types";
import { Num, fa, faGrouped, rialToToman } from "./document.utils";

const KARAT_LABEL: Record<string, string> = { K18: "۱۸", K24: "۲۴" };

export default function InvoiceDocumentView({ doc }: { doc: InvoiceDocument }) {
  const { company, customer } = doc;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(doc.verifyUrl)}`;
  const hasGold = doc.items.some((i) => i.weightGrams || i.purityKarat);

  return (
    <div className="doc-sheet doc-sheet--landscape">
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
            <div className="doc-head__sub">نام تجاری: {company.brandName}</div>
          </div>
        </div>

        <div className="doc-title">فاکتور فروش کالا</div>

        <div className="doc-meta">
          <div className="doc-meta__row">
            <span className="doc-meta__label">شماره فاکتور</span>
            <span className="doc-meta__value"><Num>{doc.invoiceNumberFa}</Num></span>
          </div>
          <div className="doc-meta__row">
            <span className="doc-meta__label">تاریخ</span>
            <span className="doc-meta__value">{doc.issuedAtJalali}</span>
          </div>
          <div className="doc-meta__row">
            <span className="doc-meta__label">شناسه ملی</span>
            <span className="doc-meta__value"><Num>{fa(company.nationalId)}</Num></span>
          </div>
        </div>
      </header>

      <div className="doc-rule" />

      <div className="doc-parties">
        <section className="doc-party">
          <div className="doc-party__head">مشخصات فروشنده</div>
          <div className="doc-party__body">
            <div className="doc-field">
              <span className="doc-field__k">نام</span>
              <span className="doc-field__v">{company.legalName}</span>
            </div>
            <div className="doc-field">
              <span className="doc-field__k">شماره ثبت</span>
              <span className="doc-field__v">
                <Num>{fa(company.registrationNumber)}</Num>
                {company.economicCode && (
                  <> · کد اقتصادی <Num>{fa(company.economicCode)}</Num></>
                )}
              </span>
            </div>
            <div className="doc-field">
              <span className="doc-field__k">نشانی</span>
              <span className="doc-field__v">{company.address}</span>
            </div>
            <div className="doc-field">
              <span className="doc-field__k">تماس</span>
              <span className="doc-field__v">
                <Num>{fa(company.phone)}</Num>
                {company.postalCode && (
                  <> · کدپستی <Num>{fa(company.postalCode)}</Num></>
                )}
              </span>
            </div>
          </div>
        </section>

        <section className="doc-party">
          <div className="doc-party__head">مشخصات خریدار</div>
          <div className="doc-party__body">
            <div className="doc-field">
              <span className="doc-field__k">
                {customer.isLegal ? "نام شرکت" : "نام"}
              </span>
              <span className="doc-field__v">{customer.displayName}</span>
            </div>
            <div className="doc-field">
              <span className="doc-field__k">
                {customer.isLegal ? "شناسه ملی" : "کد ملی"}
              </span>
              <span className="doc-field__v">
                <Num>{fa(customer.nationalId ?? "—")}</Num>
                {customer.economicCode && (
                  <> · کد اقتصادی <Num>{fa(customer.economicCode)}</Num></>
                )}
              </span>
            </div>
            <div className="doc-field">
              <span className="doc-field__k">نشانی</span>
              <span className="doc-field__v">{customer.address ?? "—"}</span>
            </div>
            <div className="doc-field">
              <span className="doc-field__k">تماس</span>
              <span className="doc-field__v">
                <Num>{fa(customer.phone)}</Num>
                {customer.postalCode && (
                  <> · کدپستی <Num>{fa(customer.postalCode)}</Num></>
                )}
              </span>
            </div>
          </div>
        </section>
      </div>

      <table className="doc-table">
        <thead>
          <tr>
            <th style={{ width: "3%" }}>ردیف</th>
            <th style={{ width: "7%" }}>کد کالا</th>
            <th style={{ width: "22%" }}>شرح کالا / خدمات</th>
            {hasGold && <th style={{ width: "5%" }}>عیار</th>}
            {hasGold && <th style={{ width: "7%" }}>وزن (گرم)</th>}
            <th style={{ width: "6%" }}>مقدار</th>
            <th style={{ width: "5%" }}>واحد</th>
            <th style={{ width: "10%" }}>مبلغ واحد</th>
            <th style={{ width: "9%" }}>اجرت ساخت</th>
            <th style={{ width: "8%" }}>کارمزد و سود</th>
            <th style={{ width: "7%" }}>تخفیف</th>
            <th style={{ width: "9%" }}>مالیات</th>
            <th style={{ width: "11%" }}>جمع کل</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it) => (
            <tr key={it.rowNo}>
              <td><Num>{fa(it.rowNo)}</Num></td>
              <td><Num>{it.productCode ?? "—"}</Num></td>
              <td className="is-title">{it.title}</td>
              {hasGold && (
                <td>{it.purityKarat ? KARAT_LABEL[it.purityKarat] ?? "—" : "—"}</td>
              )}
              {hasGold && (
                <td><Num>{it.weightGrams ? fa(it.weightGrams) : "—"}</Num></td>
              )}
              <td><Num>{fa(Number(it.quantity))}</Num></td>
              <td>{it.unit}</td>
              <td><Num>{faGrouped(it.unitPriceRial)}</Num></td>
              <td><Num>{faGrouped(it.makingRial)}</Num></td>
              <td><Num>{faGrouped(it.feeRial)}</Num></td>
              <td><Num>{faGrouped(it.discountRial)}</Num></td>
              <td>
                <Num>{faGrouped(it.taxRial)}</Num>
                {Number(it.taxRate) > 0 && (
                  <div style={{ fontSize: 8, color: "var(--doc-muted)" }}>
                    <Num>{fa(it.taxRate)}</Num>٪
                  </div>
                )}
              </td>
              <td style={{ fontWeight: 800 }}>
                <Num>{faGrouped(it.totalRial)}</Num>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-summary">
        <div className="doc-notes">
          <div><b>شرایط و توضیحات</b></div>
          <div>روش پرداخت: {doc.paymentMethod ?? "کیف پول تومانی آرکان گلد"}</div>
          {doc.discountCode && Number(doc.discountRial) > 0 && (
            <div>
              کد تخفیف اعمال‌شده: <b dir="ltr">{doc.discountCode}</b> — مبلغ
              تخفیف:{" "}
              <Num>{faGrouped(doc.discountCodeRial ?? doc.discountRial)}</Num>{" "}
              ریال
            </div>
          )}
          {Number(doc.packagingWaivedRial ?? 0) > 0 && (
            <div>
              بسته‌بندی رایگان (هدیه خرید): <Num>{faGrouped(doc.packagingWaivedRial ?? 0)}</Num>{" "}
              ریال در ستون تخفیف لحاظ شده است
            </div>
          )}
          <div>
            کلیه مبالغ به <b>ریال</b> است. معادل تومانی صرفاً جهت اطلاع درج شده است.
          </div>
          <div>
            این فاکتور به‌صورت الکترونیکی صادر شده و اصالت آن از طریق کد QR قابل استعلام است.
          </div>
          {doc.cancelReason && (
            <div style={{ color: "#a3161c", fontWeight: 800 }}>
              دلیل ابطال: {doc.cancelReason}
            </div>
          )}
        </div>

        <div className="doc-totals">
          <div className="doc-totals__row">
            <span>جمع کل</span>
            <span><Num>{faGrouped(doc.subtotalRial)}</Num> ریال</span>
          </div>
          <div className="doc-totals__row">
            <span>تخفیف</span>
            <span>(<Num>{faGrouped(doc.discountRial)}</Num>) ریال</span>
          </div>
          <div className="doc-totals__row">
            <span>کارمزد و سود</span>
            <span><Num>{faGrouped(doc.feeRial)}</Num> ریال</span>
          </div>
          <div className="doc-totals__row">
            <span>مالیات و عوارض</span>
            <span><Num>{faGrouped(doc.taxRial)}</Num> ریال</span>
          </div>
          <div className="doc-totals__row doc-totals__row--final">
            <span>قابل پرداخت</span>
            <span><Num>{faGrouped(doc.totalRial)}</Num> ریال</span>
          </div>
          <div
            className="doc-totals__row"
            style={{ fontSize: 9.5, color: "var(--doc-muted)" }}
          >
            <span>معادل تومان</span>
            <span><Num>{rialToToman(doc.totalRial)}</Num> تومان</span>
          </div>
        </div>
      </div>

      <div className="doc-words">
        <b>مبلغ به حروف:</b> {doc.totalInWords}
      </div>

      <div className="doc-foot">
        <div className="doc-qr">
          <img src={qrSrc} alt="استعلام اصالت فاکتور" width={64} height={64} />
          <div className="doc-qr__hash"><Num>{doc.contentHash.slice(0, 16)}</Num></div>
        </div>
        <div className="doc-sign-box">امضای خریدار</div>
        <div className="doc-seal">
          مهر و امضای فروشنده
          {company.sealImagePath && (
            <img src={company.sealImagePath} alt="" className="doc-seal__img" />
          )}
        </div>
      </div>

      <footer className="doc-contact">
        <span>{company.address}</span>
        <span>{company.website}</span>
      </footer>
    </div>
  );
}
