// admin/app/(dashboard)/accounting/chart-of-accounts/page.tsx — سرفصل حساب‌ها
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { BookOpen, Lock, Pencil, Plus } from "lucide-react";
import {
  ACCOUNT_TYPE_FA,
  ActionButton,
  Alert,
  CsvButton,
  Field,
  Modal,
  Num,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  downloadCsv,
  fetcher,
  grams,
  inputCls,
  signedToman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  parentId: string | null;
  parentCode: string | null;
  hasChildren: boolean;
  isSystem: boolean;
  isActive: boolean;
  allowManualEntry: boolean;
  balanceRial: string;
  balanceGrams: string;
  totalBalanceRial: string;
  totalBalanceGrams: string;
}

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

function AccountForm({ account, accounts, onDone }: { account?: AccountRow; accounts: AccountRow[]; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(account?.name ?? "");
  const [parentCode, setParentCode] = useState("");
  const [description, setDescription] = useState(account?.description ?? "");
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [allowManual, setAllowManual] = useState(account?.allowManualEntry ?? true);
  const act = useAction();
  const parent = accounts.find((a) => a.code === parentCode);

  const save = async () => {
    const ok = await act.run(() =>
      account
        ? api.patch(`/api/admin/accounting/accounts/${account.id}`, {
            ...(account.isSystem ? {} : { name, isActive, allowManualEntry: allowManual }),
            description,
          })
        : api.post("/api/admin/accounting/accounts", {
            code,
            name,
            type: parent?.type,
            parentCode: parentCode || undefined,
            description: description || undefined,
            allowManualEntry: allowManual,
          }),
    );
    if (ok) onDone();
  };

  return (
    <div className="space-y-3">
      {!account && (
        <>
          <Field label="حساب والد (کل)" hint="حساب جدید زیرمجموعه‌ی این حساب و هم‌نوع آن خواهد بود">
            <select value={parentCode} onChange={(e) => setParentCode(e.target.value)} className={inputCls}>
              <option value="">انتخاب کنید</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="کد حساب" hint={parent ? `باید با ${parent.code} شروع شود، مثلاً ${parent.code}01` : undefined}>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={inputCls} dir="ltr" />
          </Field>
        </>
      )}
      {(!account || !account.isSystem) && (
        <Field label="نام حساب">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="مثلاً بانک ملت — جاری ۱۲۳۴" />
        </Field>
      )}
      <Field label="توضیحات">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} rows={2} />
      </Field>
      {(!account || !account.isSystem) && (
        <div className="flex flex-wrap gap-4 text-[12px] font-bold text-gray-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allowManual} onChange={(e) => setAllowManual(e.target.checked)} />
            ثبت سند دستی روی این حساب مجاز است
          </label>
          {account && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              فعال
            </label>
          )}
        </div>
      )}
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy}>
        ذخیره
      </ActionButton>
    </div>
  );
}

export default function ChartOfAccountsPage() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<AccountRow[]>("/api/admin/accounting/accounts", fetcher);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ edit?: AccountRow } | null>(null);

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (a) => (!type || a.type === type) && (!search || a.code.includes(search) || a.name.includes(search)),
      ),
    [data, type, search],
  );
  const depth = (a: AccountRow) => {
    let d = 0;
    let p = a.parentId;
    while (p && d < 5) {
      d++;
      p = data?.find((x) => x.id === p)?.parentId ?? null;
    }
    return d;
  };

  const exportCsv = () =>
    downloadCsv(
      "chart-of-accounts.csv",
      ["کد", "نام", "نوع", "والد", "مانده ریالی (ریال)", "مانده گرمی", "مانده تجمیعی (ریال)", "فعال"],
      rows.map((a) => [a.code, a.name, ACCOUNT_TYPE_FA[a.type], a.parentCode, a.balanceRial, a.balanceGrams, a.totalBalanceRial, a.isActive ? "بله" : "خیر"]),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BookOpen}
        title="سرفصل حساب‌ها"
        subtitle="حساب‌های کل سیستم ثابت‌اند؛ برای هر بانک، صندوق، نوع هزینه یا طرف حساب می‌توانید حساب معین زیرمجموعه تعریف کنید. حساب‌های قفل‌دار کنترلی‌اند و فقط از مسیر عملیات سیستمی تغییر می‌کنند."
        actions={
          <>
            <CsvButton onClick={exportCsv} />
            {can("accounting.manage") && (
              <ActionButton onClick={() => setModal({})}>
                <Plus className="w-4 h-4" /> حساب معین جدید
              </ActionButton>
            )}
          </>
        }
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <div className="flex flex-wrap gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
            <option value="">همه‌ی گروه‌ها</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_FA[t]}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجوی کد یا نام"
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
          />
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>کد</th>
                <th>نام حساب</th>
                <th>گروه</th>
                <th>مانده (تومان)</th>
                <th>مانده (گرم)</th>
                <th>مانده با زیرحساب‌ها (تومان)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={a.isActive ? "" : "opacity-50"}>
                  <Num bold>{a.code}</Num>
                  <td style={{ paddingRight: `${depth(a) * 18 + 8}px` }}>
                    <Link href={`/accounting/chart-of-accounts/${a.id}`} className="font-bold text-gray-800 hover:underline">
                      {a.name}
                    </Link>
                    {!a.allowManualEntry && <Lock className="inline w-3 h-3 mr-1 text-gray-400" aria-label="حساب کنترلی" />}
                    {a.description && <p className="text-[10px] text-gray-400 max-w-md">{a.description}</p>}
                  </td>
                  <td>{ACCOUNT_TYPE_FA[a.type]}</td>
                  <Num>{signedToman(a.balanceRial)}</Num>
                  <Num>{Number(a.balanceGrams) ? grams(a.balanceGrams) : "—"}</Num>
                  <Num>{a.hasChildren ? signedToman(a.totalBalanceRial) : "—"}</Num>
                  <td>
                    {can("accounting.manage") && (
                      <button type="button" onClick={() => setModal({ edit: a })} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="ویرایش">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {modal && (
        <Modal title={modal.edit ? `ویرایش ${modal.edit.code} — ${modal.edit.name}` : "تعریف حساب معین"} onClose={() => setModal(null)}>
          <AccountForm
            account={modal.edit}
            accounts={data ?? []}
            onDone={() => {
              setModal(null);
              void mutate();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
