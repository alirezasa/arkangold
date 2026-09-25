// admin/app/components/agents/AgentFormModal.tsx
"use client";
import { useState } from "react";
import axios from "axios";
import { Loader2, Save } from "lucide-react";
import {
  Alert,
  COMMISSION_TYPE_FA,
  Field,
  Modal,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  tomanToRial,
} from "./ui";

export interface AgentFormValue {
  id?: string;
  code?: string;
  name: string;
  managerName: string;
  nationalCode: string | null;
  phone: string;
  email: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  contractNumber: string | null;
  contractStartAt: string | null;
  contractEndAt: string | null;
  commissionType: string;
  commissionValue: string;
  creditLimitRial: string | null;
  notes: string | null;
}

const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

/** فرم ایجاد/ویرایش نماینده — مبالغ در فرم به تومان و در API به ریال */
export default function AgentFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: AgentFormValue;
  onClose: () => void;
  onSaved: (agent: { id: string; code: string; name: string }) => void | Promise<void>;
}) {
  const isEdit = !!initial?.id;
  const [f, setF] = useState({
    name: initial?.name ?? "",
    managerName: initial?.managerName ?? "",
    nationalCode: initial?.nationalCode ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    province: initial?.province ?? "",
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    postalCode: initial?.postalCode ?? "",
    contractNumber: initial?.contractNumber ?? "",
    contractStartAt: toDateInput(initial?.contractStartAt),
    contractEndAt: toDateInput(initial?.contractEndAt),
    commissionType: initial?.commissionType ?? "PERCENT",
    // درصد همان مقدار؛ مبالغ ریالی به تومان نمایش داده می‌شوند
    commissionValue: initial
      ? initial.commissionType === "PERCENT"
        ? String(Number(initial.commissionValue))
        : String(Number(initial.commissionValue) / 10)
      : "1",
    creditLimitToman: initial?.creditLimitRial ? String(Number(initial.creditLimitRial) / 10) : "",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.name.trim().length < 2) return setError("نام نماینده/فروشگاه را وارد کنید");
    if (f.managerName.trim().length < 3) return setError("نام مدیر/مسئول را وارد کنید");
    if (!/^09\d{9}$/.test(f.phone)) return setError("شماره موبایل نماینده معتبر نیست");
    if (f.nationalCode && !/^\d{10}$/.test(f.nationalCode)) return setError("کد ملی باید ۱۰ رقم باشد");
    const cv = Number(f.commissionValue);
    if (!Number.isFinite(cv) || cv < 0) return setError("مقدار حق‌العمل معتبر نیست");
    if (f.commissionType === "PERCENT" && cv > 50) return setError("درصد حق‌العمل حداکثر ۵۰٪ است");

    const payload: Record<string, unknown> = {
      name: f.name.trim(),
      managerName: f.managerName.trim(),
      phone: f.phone,
      commissionType: f.commissionType,
      commissionValue: f.commissionType === "PERCENT" ? cv : Math.round(cv * 10),
      creditLimitRial: f.creditLimitToman ? tomanToRial(f.creditLimitToman) : null,
    };
    const optional: (keyof typeof f)[] = [
      "nationalCode",
      "email",
      "province",
      "city",
      "address",
      "postalCode",
      "contractNumber",
      "notes",
    ];
    for (const k of optional) if (f[k]) payload[k] = String(f[k]).trim();
    if (f.contractStartAt) payload.contractStartAt = f.contractStartAt;
    if (f.contractEndAt) payload.contractEndAt = f.contractEndAt;
    if (!isEdit && payload.creditLimitRial === null) delete payload.creditLimitRial;

    setSaving(true);
    try {
      const res = isEdit
        ? await axios.patch(`/api/admin/agents/${initial?.id}`, payload)
        : await axios.post("/api/admin/agents", payload);
      await onSaved(res.data as { id: string; code: string; name: string });
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره نماینده"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? `ویرایش نماینده ${initial?.code ?? ""}` : "تعریف نماینده جدید"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert kind="error" text={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام نمایندگی / فروشگاه *">
            <input value={f.name} onChange={set("name")} className={inputCls} maxLength={120} />
          </Field>
          <Field label="نام مدیر / مسئول *">
            <input value={f.managerName} onChange={set("managerName")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="موبایل *">
            <input
              value={f.phone}
              onChange={(e) => setF((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
              className={`${inputCls} text-left`}
              dir="ltr"
              placeholder="09xxxxxxxxx"
            />
          </Field>
          <Field label="کد ملی مدیر">
            <input
              value={f.nationalCode}
              onChange={(e) => setF((p) => ({ ...p, nationalCode: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
              className={`${inputCls} text-left`}
              dir="ltr"
            />
          </Field>
          <Field label="استان">
            <input value={f.province} onChange={set("province")} className={inputCls} />
          </Field>
          <Field label="شهر">
            <input value={f.city} onChange={set("city")} className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="نشانی">
              <input value={f.address} onChange={set("address")} className={inputCls} />
            </Field>
          </div>
          <Field label="کد پستی">
            <input value={f.postalCode} onChange={set("postalCode")} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
          <Field label="ایمیل">
            <input value={f.email} onChange={set("email")} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
        </div>

        <div className="rounded-xl bg-gray-50 p-4 space-y-3">
          <p className="text-[12px] font-black text-gray-700">قرارداد و شرایط مالی</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="شماره قرارداد">
              <input value={f.contractNumber} onChange={set("contractNumber")} className={inputCls} />
            </Field>
            <Field label="شروع قرارداد">
              <input type="date" value={f.contractStartAt} onChange={set("contractStartAt")} className={inputCls} dir="ltr" />
            </Field>
            <Field label="پایان قرارداد">
              <input type="date" value={f.contractEndAt} onChange={set("contractEndAt")} className={inputCls} dir="ltr" />
            </Field>
            <Field label="نوع حق‌العمل (کمیسیون)">
              <select value={f.commissionType} onChange={set("commissionType")} className={inputCls}>
                {Object.entries(COMMISSION_TYPE_FA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={f.commissionType === "PERCENT" ? "درصد حق‌العمل" : "مبلغ حق‌العمل (تومان)"}
              hint={
                f.commissionType === "PERCENT"
                  ? "از مبلغ کل فروش هر شمش کسر می‌شود"
                  : f.commissionType === "PER_GRAM"
                    ? "ضرب در وزن شمش فروخته‌شده"
                    : "برای هر شمش فروخته‌شده"
              }
            >
              <input
                type="number"
                min={0}
                step={f.commissionType === "PERCENT" ? 0.1 : 1000}
                value={f.commissionValue}
                onChange={set("commissionValue")}
                className={`${inputCls} text-left`}
                dir="ltr"
              />
            </Field>
            <Field label="سقف بدهی مجاز (تومان)" hint="خالی = بدون سقف؛ با رسیدن بدهی به سقف، ثبت فروش متوقف می‌شود">
              <input
                type="number"
                min={0}
                step={100000}
                value={f.creditLimitToman}
                onChange={set("creditLimitToman")}
                className={`${inputCls} text-left`}
                dir="ltr"
              />
            </Field>
          </div>
        </div>

        <Field label="یادداشت داخلی">
          <textarea value={f.notes} onChange={set("notes")} className={inputCls} rows={2} maxLength={1000} />
        </Field>

        <button type="submit" disabled={saving} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "ذخیره تغییرات" : "ایجاد نماینده"}
        </button>
      </form>
    </Modal>
  );
}
