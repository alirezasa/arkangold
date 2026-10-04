// admin/app/(dashboard)/shop/shipping-methods/page.tsx
//
// مراجع ارسال سفارش (پست، پیک، پست خصوصی، تحویل حضوری) و قواعد هر کدام.
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Plus, Truck } from "lucide-react";
import {
  ActionButton,
  Alert,
  Empty,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type MethodType = "POST" | "COURIER" | "EXPRESS" | "PICKUP";
interface Method {
  id: string;
  code: string;
  name: string;
  type: MethodType;
  description: string | null;
  trackingUrlTemplate: string | null;
  requiresTrackingCode: boolean;
  requiresDeliveryCode: boolean;
  courierLinkEnabled: boolean;
  estimatedDays: number | null;
  contactPhone: string | null;
  isActive: boolean;
  sortOrder: number;
  shipmentCount: number;
}

const TYPE_FA: Record<MethodType, string> = {
  POST: "پست",
  COURIER: "پیک",
  EXPRESS: "پست خصوصی / باربری",
  PICKUP: "تحویل حضوری",
};

const yes = (b: boolean) => (b ? "✓" : "—");

export default function ShippingMethodsPage() {
  const { data, isLoading, mutate } = useSWR<Method[]>("/api/admin/shop-orders/shipping-methods", fetcher);
  const [edit, setEdit] = useState<Method | "new" | null>(null);
  const can = usePerm();

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={Truck}
        title="مراجع ارسال سفارش"
        subtitle="روش‌هایی که هنگام «ثبت ارسال» سفارش قابل انتخاب‌اند. برای هر مرجع تعیین کنید کد رهگیری الزامی باشد، تحویل فقط با کد تحویل مشتری ثبت شود و لینک ثبت تحویل برای پیک پیامک شود."
        actions={
          can("shop.manage") ? (
            <ActionButton onClick={() => setEdit("new")}>
              <Plus className="w-4 h-4" /> مرجع جدید
            </ActionButton>
          ) : undefined
        }
      />
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <Empty text="مرجع ارسالی تعریف نشده است" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>نام</th>
                <th>نوع</th>
                <th>کد رهگیری الزامی</th>
                <th>کد تحویل مشتری</th>
                <th>لینک پیک</th>
                <th>زمان تحویل</th>
                <th>تعداد ارسال</th>
                <th>وضعیت</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <p className="font-bold">{m.name}</p>
                    <p className="text-[10px] text-gray-400" dir="ltr">
                      {m.code}
                    </p>
                  </td>
                  <td>{TYPE_FA[m.type]}</td>
                  <td>{yes(m.requiresTrackingCode)}</td>
                  <td>{yes(m.requiresDeliveryCode)}</td>
                  <td>{yes(m.courierLinkEnabled)}</td>
                  <td>{m.estimatedDays != null ? `${m.estimatedDays.toLocaleString("fa-IR")} روز` : "—"}</td>
                  <td>{m.shipmentCount.toLocaleString("fa-IR")}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${m.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {m.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td>
                    {can("shop.manage") && (
                      <button type="button" onClick={() => setEdit(m)} className="text-emerald-700 font-bold text-[12px]">
                        ویرایش
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {edit && (
        <MethodModal
          method={edit === "new" ? null : edit}
          onClose={() => {
            setEdit(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function MethodModal({ method, onClose }: { method: Method | null; onClose: () => void }) {
  const [f, setF] = useState({
    code: method?.code ?? "",
    name: method?.name ?? "",
    type: (method?.type ?? "POST") as MethodType,
    description: method?.description ?? "",
    trackingUrlTemplate: method?.trackingUrlTemplate ?? "",
    requiresTrackingCode: method?.requiresTrackingCode ?? false,
    requiresDeliveryCode: method?.requiresDeliveryCode ?? true,
    courierLinkEnabled: method?.courierLinkEnabled ?? false,
    estimatedDays: method?.estimatedDays != null ? String(method.estimatedDays) : "",
    contactPhone: method?.contactPhone ?? "",
    isActive: method?.isActive ?? true,
    sortOrder: String(method?.sortOrder ?? 0),
  });
  const act = useAction();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    const body = {
      ...(method ? {} : { code: f.code }),
      name: f.name,
      type: f.type,
      description: f.description || null,
      trackingUrlTemplate: f.trackingUrlTemplate || null,
      requiresTrackingCode: f.requiresTrackingCode,
      requiresDeliveryCode: f.requiresDeliveryCode,
      courierLinkEnabled: f.courierLinkEnabled,
      estimatedDays: f.estimatedDays ? Number(f.estimatedDays) : null,
      contactPhone: f.contactPhone || null,
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder) || 0,
    };
    const ok = await act.run(() =>
      method ? api.patch(`/api/admin/shop-orders/shipping-methods/${method.id}`, body) : api.post("/api/admin/shop-orders/shipping-methods", body),
    );
    if (ok) onClose();
  };

  const check = (k: "requiresTrackingCode" | "requiresDeliveryCode" | "courierLinkEnabled" | "isActive", label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-[12px]">
      <input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} className="mt-1" />
      <span>
        <span className="font-bold">{label}</span>
        {hint && <span className="block text-gray-400">{hint}</span>}
      </span>
    </label>
  );

  return (
    <Modal title={method ? `ویرایش ${method.name}` : "مرجع ارسال جدید"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام">
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="کد (انگلیسی)">
            <input value={f.code} disabled={!!method} onChange={(e) => set("code", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
          <Field label="نوع">
            <select value={f.type} onChange={(e) => set("type", e.target.value as MethodType)} className={inputCls}>
              {Object.entries(TYPE_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="زمان تخمینی تحویل (روز)">
            <input value={f.estimatedDays} onChange={(e) => set("estimatedDays", e.target.value.replace(/\D/g, ""))} className={inputCls} />
          </Field>
        </div>
        <Field label="توضیح">
          <input value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
        </Field>
        <Field label="نشانی رهگیری" hint="با {code} به‌جای کد رهگیری، مثلاً https://example.com/track?code={code}">
          <input value={f.trackingUrlTemplate} onChange={(e) => set("trackingUrlTemplate", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تلفن پشتیبانی مرجع (اختیاری)">
            <input value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
          <Field label="ترتیب نمایش">
            <input value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value.replace(/\D/g, ""))} className={inputCls} />
          </Field>
        </div>
        <div className="space-y-2">
          {check("requiresTrackingCode", "کد رهگیری مرسوله الزامی است")}
          {check("requiresDeliveryCode", "تحویل فقط با کد تحویل مشتری", "هنگام ارسال کد ۶ رقمی برای مشتری پیامک می‌شود و تحویل بدون آن ثبت نمی‌شود")}
          {check("courierLinkEnabled", "ارسال لینک ثبت تحویل برای پیک", "موبایل پیک هنگام ارسال الزامی می‌شود")}
          {check("isActive", "فعال")}
        </div>
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} onClick={() => void save()}>
          ذخیره
        </ActionButton>
      </div>
    </Modal>
  );
}
