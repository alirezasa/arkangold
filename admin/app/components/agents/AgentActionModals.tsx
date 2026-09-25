// admin/app/components/agents/AgentActionModals.tsx
//
// عملیات مدیریتی روی نماینده: تحویل امانی، عودت، ثبت دریافت وجه، اصلاحیه،
// تغییر وضعیت و حساب‌های ورود.
"use client";
import { useMemo, useState } from "react";
import axios from "axios";
import { Loader2, PackagePlus, Trash2, Undo2, HandCoins, Scale, Power, UserPlus, KeyRound } from "lucide-react";
import {
  Alert,
  Field,
  Modal,
  SETTLEMENT_METHOD_FA,
  faNum,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
  tomanToRial,
} from "./ui";

interface AgentLite {
  id: string;
  code: string;
  name: string;
  balanceRial?: string;
}

// ═══════════════════════════ تحویل امانی ═══════════════════════════

interface AllocRow {
  code: string;
  factorySerialNumber: string;
  weightGrams: string;
  purityKarat: "K18" | "K24";
  premiumToman: string;
}

export function AllocateModal({
  agent,
  onClose,
  onDone,
}: {
  agent: AgentLite;
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [defaults, setDefaults] = useState({ weightGrams: "1", purityKarat: "K24" as "K18" | "K24", premiumToman: "0", mintedAt: "" });
  const [paste, setPaste] = useState("");
  const [rows, setRows] = useState<AllocRow[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFromPaste = () => {
    setError(null);
    const tokens = paste
      .split(/[\s,،;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const invalid = tokens.filter((t) => !/^\d{8}$/.test(t));
    if (invalid.length) return setError(`کدهای نامعتبر (باید ۸ رقم باشند): ${invalid.join("، ")}`);
    const existing = new Set(rows.map((r) => r.code));
    const fresh = [...new Set(tokens)].filter((t) => !existing.has(t));
    setRows((prev) => [
      ...prev,
      ...fresh.map((code) => ({
        code,
        factorySerialNumber: "",
        weightGrams: defaults.weightGrams,
        purityKarat: defaults.purityKarat,
        premiumToman: defaults.premiumToman,
      })),
    ]);
    setPaste("");
  };

  const totalGrams = useMemo(() => rows.reduce((s, r) => s + (Number(r.weightGrams) || 0), 0), [rows]);
  const update = (i: number, patch: Partial<AllocRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setError(null);
    if (!rows.length) return setError("حداقل یک کد هولوگرام اضافه کنید");
    const bad = rows.find((r) => !(Number(r.weightGrams) > 0));
    if (bad) return setError(`وزن شمش ${bad.code} معتبر نیست`);
    setBusy(true);
    try {
      const res = await axios.post<{ message: string; voucherNumber: string }>(`/api/admin/agents/${agent.id}/allocate`, {
        note: note.trim() || undefined,
        items: rows.map((r) => ({
          code: r.code,
          weightGrams: Number(r.weightGrams),
          purityKarat: r.purityKarat,
          factorySerialNumber: r.factorySerialNumber.trim() || undefined,
          mintedAt: defaults.mintedAt || undefined,
          premiumRial: r.premiumToman ? tomanToRial(r.premiumToman) : 0,
        })),
      });
      await onDone(`${res.data.message} — حواله ${res.data.voucherNumber}`);
    } catch (err) {
      setError(getErrorMessage(err, "تحویل شمش ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`تحویل امانی شمش به «${agent.name}»`} onClose={onClose} wide>
      <Alert
        kind="info"
        text="کدهای هولوگرام آزاد (تخصیص‌نیافته) را وارد کنید. مشخصات هر شمش (وزن، عیار، سریال و اجرت) ثبت و شمش به موجودی امانی نماینده منتقل می‌شود. سند حسابداری انتقال از خزانه به «موجودی امانی نزد نمایندگان» به‌صورت خودکار صادر می‌شود."
      />
      {error && <Alert kind="error" text={error} />}

      <div className="rounded-xl bg-gray-50 p-3 grid gap-3 sm:grid-cols-4">
        <Field label="وزن پیش‌فرض (گرم)">
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={defaults.weightGrams}
            onChange={(e) => setDefaults((d) => ({ ...d, weightGrams: e.target.value }))}
            className={`${inputCls} text-left`}
            dir="ltr"
          />
        </Field>
        <Field label="عیار پیش‌فرض">
          <select
            value={defaults.purityKarat}
            onChange={(e) => setDefaults((d) => ({ ...d, purityKarat: e.target.value as "K18" | "K24" }))}
            className={inputCls}
          >
            <option value="K24">۲۴ عیار</option>
            <option value="K18">۱۸ عیار</option>
          </select>
        </Field>
        <Field label="اجرت هر شمش (تومان)">
          <input
            type="number"
            min={0}
            step={10000}
            value={defaults.premiumToman}
            onChange={(e) => setDefaults((d) => ({ ...d, premiumToman: e.target.value }))}
            className={`${inputCls} text-left`}
            dir="ltr"
          />
        </Field>
        <Field label="تاریخ ضرب (اختیاری)">
          <input
            type="date"
            value={defaults.mintedAt}
            onChange={(e) => setDefaults((d) => ({ ...d, mintedAt: e.target.value }))}
            className={inputCls}
            dir="ltr"
          />
        </Field>
      </div>

      <div className="flex gap-2 items-end">
        <Field label="کدهای هولوگرام (با فاصله، کاما یا خط جدید؛ اسکنر بارکد هم پشتیبانی می‌شود)">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={2}
            className={`${inputCls} font-mono text-left`}
            dir="ltr"
            placeholder="12345678 23456789 ..."
          />
        </Field>
        <button type="button" onClick={addFromPaste} className={secondaryBtn}>
          افزودن
        </button>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto max-h-72">
          <table className="admin-table w-full min-w-[640px]">
            <thead>
              <tr>
                <th>کد</th>
                <th>سریال کارخانه</th>
                <th>وزن (گرم)</th>
                <th>عیار</th>
                <th>اجرت (تومان)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code}>
                  <td className="font-mono font-bold">{r.code}</td>
                  <td>
                    <input
                      value={r.factorySerialNumber}
                      onChange={(e) => update(i, { factorySerialNumber: e.target.value })}
                      className="w-32 px-2 py-1 rounded-lg border border-gray-200 text-[12px]"
                      dir="ltr"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={r.weightGrams}
                      onChange={(e) => update(i, { weightGrams: e.target.value })}
                      className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-[12px]"
                      dir="ltr"
                    />
                  </td>
                  <td>
                    <select
                      value={r.purityKarat}
                      onChange={(e) => update(i, { purityKarat: e.target.value as "K18" | "K24" })}
                      className="px-2 py-1 rounded-lg border border-gray-200 text-[12px] bg-white"
                    >
                      <option value="K24">۲۴</option>
                      <option value="K18">۱۸</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={r.premiumToman}
                      onChange={(e) => update(i, { premiumToman: e.target.value })}
                      className="w-28 px-2 py-1 rounded-lg border border-gray-200 text-[12px]"
                      dir="ltr"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-red-500"
                      aria-label="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] font-bold text-gray-600">
        جمع: {faNum(rows.length)} شمش · {faNum(totalGrams, 4)} گرم
      </p>
      <Field label="توضیحات حواله (اختیاری)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} maxLength={500} />
      </Field>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
        ثبت حواله تحویل امانی
      </button>
    </Modal>
  );
}

// ═══════════════════════════ عودت ═══════════════════════════

export function ReturnModal({
  agent,
  codes,
  onClose,
  onDone,
}: {
  agent: AgentLite;
  codes: string[];
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await axios.post<{ message: string; voucherNumber: string }>(`/api/admin/agents/${agent.id}/return`, {
        codes,
        note: note.trim() || undefined,
      });
      await onDone(`${res.data.message} — حواله ${res.data.voucherNumber}`);
    } catch (err) {
      setError(getErrorMessage(err, "عودت شمش ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`عودت ${faNum(codes.length)} شمش از «${agent.name}»`} onClose={onClose}>
      <Alert kind="info" text="شمش‌های انتخاب‌شده از موجودی امانی نماینده خارج و به خزانه (وضعیت تخصیص‌نیافته) برمی‌گردند و سند برگشت صادر می‌شود." />
      {error && <Alert kind="error" text={error} />}
      <p className="font-mono text-[12px] text-gray-600 break-words" dir="ltr">
        {codes.join("  ")}
      </p>
      <Field label="توضیحات (اختیاری)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Undo2 className="w-4 h-4" />}
        ثبت حواله عودت
      </button>
    </Modal>
  );
}

// ═══════════════════════════ تسویه (ثبت مستقیم یا اعلام نماینده) ═══════════════════════════

export function SettlementModal({
  endpoint,
  title,
  balanceRial,
  intro,
  submitLabel,
  onClose,
  onDone,
}: {
  endpoint: string;
  title: string;
  balanceRial?: string;
  intro: string;
  submitLabel: string;
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [amountToman, setAmountToman] = useState(
    balanceRial && Number(balanceRial) > 0 ? String(Math.round(Number(balanceRial) / 10)) : "",
  );
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const amountRial = tomanToRial(amountToman || "0");
    if (!(amountRial >= 10000)) return setError("مبلغ معتبر وارد کنید (حداقل ۱٬۰۰۰ تومان)");
    if (method !== "CASH" && !referenceNumber.trim()) return setError("شماره پیگیری/مرجع پرداخت را وارد کنید");
    setBusy(true);
    try {
      const res = await axios.post<{ settlementNumber: string }>(endpoint, {
        amountRial,
        method,
        referenceNumber: referenceNumber.trim() || undefined,
        paidAt: paidAt || undefined,
        note: note.trim() || undefined,
      });
      await onDone(`تسویه ${res.data.settlementNumber} ثبت شد`);
    } catch (err) {
      setError(getErrorMessage(err, "ثبت تسویه ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <Alert kind="info" text={intro} />
      {balanceRial !== undefined && (
        <p className="text-[12px] text-gray-600">
          بدهی فعلی: <b className={Number(balanceRial) > 0 ? "text-red-600" : "text-green-700"}>{toman(balanceRial)} تومان</b>
        </p>
      )}
      {error && <Alert kind="error" text={error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="مبلغ (تومان)">
          <input
            type="number"
            min={1000}
            step={1000}
            value={amountToman}
            onChange={(e) => setAmountToman(e.target.value)}
            className={`${inputCls} text-left`}
            dir="ltr"
          />
        </Field>
        <Field label="روش پرداخت">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {Object.entries(SETTLEMENT_METHOD_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="شماره پیگیری / مرجع">
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="تاریخ پرداخت">
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
      </div>
      {amountToman && <p className="text-[11px] text-gray-500">معادل {faNum(tomanToRial(amountToman))} ریال</p>}
      <Field label="توضیحات (اختیاری)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} maxLength={500} />
      </Field>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <HandCoins className="w-4 h-4" />}
        {submitLabel}
      </button>
    </Modal>
  );
}

// ═══════════════════════════ اصلاحیه ═══════════════════════════

export function AdjustmentModal({
  agent,
  onClose,
  onDone,
}: {
  agent: AgentLite;
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("DECREASE");
  const [amountToman, setAmountToman] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const amountRial = tomanToRial(amountToman || "0");
    if (!(amountRial > 0)) return setError("مبلغ معتبر وارد کنید");
    if (reason.trim().length < 10) return setError("شرح اصلاحیه باید حداقل ۱۰ کاراکتر باشد");
    setBusy(true);
    try {
      const res = await axios.post<{ message: string; number: string }>(`/api/admin/agents/${agent.id}/adjustments`, {
        direction,
        amountRial,
        reason: reason.trim(),
      });
      await onDone(`${res.data.message} — ${res.data.number}`);
    } catch (err) {
      setError(getErrorMessage(err, "ثبت اصلاحیه ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`اصلاحیه حساب «${agent.name}»`} onClose={onClose}>
      <Alert
        kind="warn"
        text={
          "اصلاحیه برای موارد خارج از فروش/تسویه است و سند حسابداری مستقل دارد:\n• کاهش بدهی (پاداش، اصلاح حق‌العمل): بدهکار «هزینه حق‌العمل نمایندگان» / بستانکار «دریافتنی از نمایندگان»\n• افزایش بدهی (جریمه، کسری): بدهکار «دریافتنی از نمایندگان» / بستانکار «درآمد متفرقه نمایندگان»"
        }
      />
      {error && <Alert kind="error" text={error} />}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["DECREASE", "کاهش بدهی نماینده"],
            ["INCREASE", "افزایش بدهی نماینده"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setDirection(k)}
            className={`py-2.5 rounded-xl text-[12px] font-bold border-2 ${
              direction === k ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="مبلغ (تومان)">
        <input
          type="number"
          min={1}
          value={amountToman}
          onChange={(e) => setAmountToman(e.target.value)}
          className={`${inputCls} text-left`}
          dir="ltr"
        />
      </Field>
      <Field label="شرح (در صورتحساب نماینده و سند درج می‌شود)">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} />
      </Field>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Scale className="w-4 h-4" />}
        ثبت اصلاحیه
      </button>
    </Modal>
  );
}

// ═══════════════════════════ وضعیت ═══════════════════════════

export function StatusModal({
  agent,
  current,
  onClose,
  onDone,
}: {
  agent: AgentLite;
  current: string;
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [status, setStatus] = useState(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await axios.patch(`/api/admin/agents/${agent.id}/status`, { status, reason: reason.trim() || undefined });
      await onDone("وضعیت نماینده به‌روزرسانی شد");
    } catch (err) {
      setError(getErrorMessage(err, "تغییر وضعیت ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`تغییر وضعیت «${agent.name}»`} onClose={onClose}>
      <Alert
        kind="info"
        text={
          "• فعال: امکان فروش، اعلام واریز و دریافت شمش.\n• تعلیق: نماینده فقط مشاهده می‌کند؛ فروش و اعلام واریز بسته است.\n• خاتمه همکاری: پس از عودت همه‌ی شمش‌ها و تعیین تکلیف تسویه‌های در انتظار؛ حساب‌های ورود غیرفعال می‌شوند."
        }
      />
      {error && <Alert kind="error" text={error} />}
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
        <option value="ACTIVE">فعال</option>
        <option value="SUSPENDED">تعلیق</option>
        <option value="TERMINATED">خاتمه همکاری</option>
      </select>
      <Field label="دلیل (در یادداشت نماینده ثبت می‌شود)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
      </Field>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Power className="w-4 h-4" />}
        ذخیره وضعیت
      </button>
    </Modal>
  );
}

// ═══════════════════════════ حساب ورود ═══════════════════════════

export function AccountModal({
  agent,
  onClose,
  onDone,
}: {
  agent: AgentLite;
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [f, setF] = useState({ username: "", password: "", fullName: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{3,31}$/.test(f.username))
      return setError("نام کاربری: حرف انگلیسی در ابتدا، ۴ تا ۳۲ کاراکتر (حرف، عدد، _ . -)");
    if (f.password.length < 12 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password))
      return setError("رمز عبور حداقل ۱۲ کاراکتر و ترکیبی از حروف انگلیسی و عدد");
    if (f.fullName.trim().length < 3) return setError("نام کامل کاربر را وارد کنید");
    if (f.phone && !/^09\d{9}$/.test(f.phone)) return setError("شماره موبایل معتبر نیست");
    setBusy(true);
    try {
      await axios.post(`/api/admin/agents/${agent.id}/accounts`, {
        username: f.username,
        password: f.password,
        fullName: f.fullName.trim(),
        phone: f.phone || undefined,
      });
      await onDone(`حساب ورود «${f.username}» ساخته شد. نماینده با همین نام کاربری و رمز از صفحه‌ی ورود پنل وارد می‌شود.`);
    } catch (err) {
      setError(getErrorMessage(err, "ساخت حساب ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`حساب ورود جدید برای «${agent.name}»`} onClose={onClose}>
      <Alert
        kind="info"
        text="این حساب با نقش «نماینده فروش» ساخته می‌شود و فقط به پرتال همین نماینده (موجودی امانی، ثبت فروش، تسویه و صورتحساب) دسترسی دارد."
      />
      {error && <Alert kind="error" text={error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام کاربری (انگلیسی)">
          <input value={f.username} onChange={(e) => setF((p) => ({ ...p, username: e.target.value.trim() }))} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="رمز عبور اولیه">
          <input value={f.password} onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="نام و نام خانوادگی کاربر">
          <input value={f.fullName} onChange={(e) => setF((p) => ({ ...p, fullName: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="موبایل (اختیاری)">
          <input
            value={f.phone}
            onChange={(e) => setF((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
            className={`${inputCls} text-left`}
            dir="ltr"
          />
        </Field>
      </div>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        ساخت حساب ورود
      </button>
    </Modal>
  );
}

export function ResetPasswordModal({
  agentId,
  account,
  onClose,
  onDone,
}: {
  agentId: string;
  account: { id: string; username: string };
  onClose: () => void;
  onDone: (msg: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      return setError("رمز عبور حداقل ۱۲ کاراکتر و ترکیبی از حروف انگلیسی و عدد");
    setBusy(true);
    try {
      await axios.patch(`/api/admin/agents/${agentId}/accounts/${account.id}`, { newPassword: password });
      await onDone(`رمز عبور «${account.username}» تغییر کرد و نشست‌های فعال او باطل شد`);
    } catch (err) {
      setError(getErrorMessage(err, "تغییر رمز ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`تعیین رمز جدید برای ${account.username}`} onClose={onClose}>
      {error && <Alert kind="error" text={error} />}
      <Field label="رمز عبور جدید">
        <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
      </Field>
      <button type="button" onClick={() => void submit()} disabled={busy} className={`${primaryBtn} w-full py-3`} style={primaryBtnStyle}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        ذخیره رمز جدید
      </button>
    </Modal>
  );
}
