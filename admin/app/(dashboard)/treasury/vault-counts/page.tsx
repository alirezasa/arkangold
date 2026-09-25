// admin/app/(dashboard)/treasury/vault-counts/page.tsx — شمارش فیزیکی خزانه (انبارگردانی)
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Scale } from "lucide-react";
import {
  ASSET_FA,
  ActionButton,
  Alert,
  Field,
  Num,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Count {
  id: string;
  countNumber: string;
  assetType: string;
  bookGrams: string;
  countedGrams: string;
  differenceGrams: string;
  note: string | null;
  createdAt: string;
}

export default function VaultCountsPage() {
  const can = usePerm();
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR<{ data: Count[]; page: number; totalPages: number }>(`/api/admin/treasury/vault-counts?page=${page}`, fetcher);
  const [assetType, setAssetType] = useState("MELTED_GOLD");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const act = useAction();
  const save = async () => {
    const ok = await act.run(
      () => api.post("/api/admin/treasury/vault-counts", { assetType, countedGrams: counted, note: note || undefined }),
      `وزن شمارش‌شده‌ی ${ASSET_FA[assetType]}: ${counted} گرم — مغایرت با دفاتر به‌صورت خودکار سند می‌خورد. ادامه می‌دهید؟`,
    );
    if (ok) {
      setCounted("");
      setNote("");
      void mutate();
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Scale}
        title="شمارش فیزیکی خزانه"
        subtitle="وزن واقعی موجودی خزانه (طلای آب‌شده به گرم ۷۵۰، شمش به وزن فیزیکی) را ثبت کنید. کسری به هزینه‌ی «کسری و ضایعات طلا» و کسری پوشش منتقل می‌شود تا جبران شود؛ اضافی به «سایر درآمدها»."
      />
      {can("treasury.vault_count") && (
        <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="نوع موجودی">
              <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className={inputCls}>
                <option value="MELTED_GOLD">طلای آب‌شده (گرم ۷۵۰)</option>
                <option value="BULLION">شمش (وزن فیزیکی)</option>
              </select>
            </Field>
            <Field label="وزن شمارش‌شده (گرم)">
              <input value={counted} onChange={(e) => setCounted(e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="توضیحات / اعضای کمیته شمارش">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {act.error && <Alert kind="error" text={act.error} />}
          {act.success && <Alert kind="success" text={act.success} />}
          <ActionButton onClick={save} busy={act.busy} disabled={counted === ""}>
            ثبت شمارش
          </ActionButton>
        </div>
      )}
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>نوع</th>
                  <th>دفتری</th>
                  <th>شمارش</th>
                  <th>مغایرت</th>
                  <th>توضیحات</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id}>
                    <Num bold>{c.countNumber}</Num>
                    <td>{ASSET_FA[c.assetType]}</td>
                    <Num>{grams(c.bookGrams)}</Num>
                    <Num>{grams(c.countedGrams)}</Num>
                    <Num bold>
                      <span className={Number(c.differenceGrams) < 0 ? "text-red-600" : Number(c.differenceGrams) > 0 ? "text-green-700" : ""}>
                        {grams(c.differenceGrams)}
                      </span>
                    </Num>
                    <td>{c.note}</td>
                    <td>{faDateTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
