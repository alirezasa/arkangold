// admin/app/(dashboard)/accounting/reconciliation/page.tsx — مغایرت‌گیری دفاتر
"use client";
import useSWR from "swr";
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Alert, Num, PageHeader, Spinner, Table, cardStyle, faDateTime, fetcher, grams, secondaryBtn, signedToman } from "@/app/components/finance/ui";

interface Rec {
  generatedAt: string;
  trialBalanced: boolean;
  allOk: boolean;
  checks: {
    key: string;
    label: string;
    unit: "RIAL" | "GRAM";
    ledger: string;
    subsidiary: string;
    difference: string;
    ok: boolean;
    hint: string;
  }[];
  integrityIssues: { code: string; name: string; storedRial: string; ledgerRial: string; storedGrams: string; ledgerGrams: string }[];
}

const fmt = (unit: string, v: string) => (unit === "GRAM" ? `${grams(v)} گرم` : `${signedToman(v)} تومان`);

export default function ReconciliationPage() {
  const { data, isLoading, mutate, isValidating } = useSWR<Rec>("/api/admin/accounting/reports/reconciliation", fetcher);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShieldCheck}
        title="مغایرت‌گیری دفاتر"
        subtitle="تطبیق دفتر کل با دفاتر معین و موجودی‌های عملیاتی: کیف پول کاربران، نمایندگان، شمش‌های امانی، شرکای فروش، تأمین‌کنندگان و طلای در راه؛ و سلامت مانده‌های ذخیره‌شده‌ی حساب‌ها"
        actions={
          <button type="button" onClick={() => void mutate()} className={secondaryBtn} disabled={isValidating}>
            <RefreshCw className={`w-4 h-4 ${isValidating ? "animate-spin" : ""}`} /> بررسی مجدد
          </button>
        }
      />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <Alert
            kind={data.allOk ? "success" : "warn"}
            text={
              data.allOk
                ? `همه‌ی دفاتر با هم مطابقت دارند (${faDateTime(data.generatedAt)})`
                : "مغایرت یافت شد — ردیف‌های قرمز را بررسی کنید. مغایرت‌های قدیمی معمولاً مربوط به عملیات پیش از راه‌اندازی دفتر کل است و با سند اصلاحی/افتتاحیه رفع می‌شود."
            }
          />
          <div className="rounded-2xl p-4" style={cardStyle}>
            <Table>
              <thead>
                <tr>
                  <th></th>
                  <th>کنترل</th>
                  <th>دفتر کل</th>
                  <th>دفتر معین / عملیاتی</th>
                  <th>اختلاف</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{data.trialBalanced ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}</td>
                  <td className="font-bold">تراز آزمایشی (جمع بدهکار = جمع بستانکار)</td>
                  <td colSpan={3}>{data.trialBalanced ? "متوازن" : "نامتوازن"}</td>
                </tr>
                {data.checks.map((c) => (
                  <tr key={c.key} className={c.ok ? "" : "bg-red-50/50"}>
                    <td>{c.ok ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}</td>
                    <td>
                      <p className="font-bold">{c.label}</p>
                      <p className="text-[10px] text-gray-400">{c.hint}</p>
                    </td>
                    <Num>{fmt(c.unit, c.ledger)}</Num>
                    <Num>{fmt(c.unit, c.subsidiary)}</Num>
                    <Num bold>{c.ok ? "—" : fmt(c.unit, c.difference)}</Num>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {data.integrityIssues.length > 0 && (
            <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
              <p className="font-black text-[13px] text-red-600">مانده‌ی ذخیره‌شده‌ی این حساب‌ها با جمع سطرهای دفتر برابر نیست</p>
              <Table>
                <thead>
                  <tr>
                    <th>حساب</th>
                    <th>مانده ذخیره‌شده</th>
                    <th>جمع سطرها</th>
                    <th>گرم ذخیره‌شده</th>
                    <th>گرم سطرها</th>
                  </tr>
                </thead>
                <tbody>
                  {data.integrityIssues.map((i) => (
                    <tr key={i.code}>
                      <td>
                        {i.code} — {i.name}
                      </td>
                      <Num>{signedToman(i.storedRial)}</Num>
                      <Num>{signedToman(i.ledgerRial)}</Num>
                      <Num>{grams(i.storedGrams)}</Num>
                      <Num>{grams(i.ledgerGrams)}</Num>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
