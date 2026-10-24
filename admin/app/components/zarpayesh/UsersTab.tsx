// admin/app/components/zarpayesh/UsersTab.tsx
//
// کاربران سکو در سامانه ناظر (AddPlatformUsers / EditPlatformUsers / GetUserBalance) و استعلام‌های پایه
// (Typelist، Vaultlist، PayTypelist، states، cities، TxnFollowup)
"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  ActionButton,
  Alert,
  Badge,
  Empty,
  Field,
  Pagination,
  Spinner,
  Table,
  api,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import { API, Json, Section, SingleUserPicker, USER_STATUS } from "./shared";

interface ZpUser {
  userId: string;
  status: string;
  registeredAt: string | null;
  lastSyncedAt: string | null;
  fkCity: number;
  lastError: string | null;
  lastErrorCode: string | null;
  fullName: string;
  phone: string;
  nationalCode: string;
}

export default function UsersTab() {
  return (
    <div className="space-y-4">
      <UserTools />
      <UsersList />
      <Lookups />
    </div>
  );
}

function UserTools() {
  const can = usePerm();
  const [user, setUser] = useState<{ id: string; phone: string } | null>(null);
  const [fkState, setFkState] = useState("");
  const [fkCity, setFkCity] = useState("");
  const [output, setOutput] = useState<unknown>(undefined);
  const a = useAction();
  const states = useSWR<{ id: number; title: string }[]>(user ? `${API}/lookup/states` : null, fetcher);
  const cities = useSWR<{ id: number; title: string }[]>(fkState ? `${API}/lookup/cities?fkstate=${fkState}` : null, fetcher);
  const call = (fn: () => Promise<{ data: unknown }>, confirm?: string) =>
    a.run(async () => {
      const res = await fn();
      setOutput(res.data);
      return res;
    }, confirm);
  return (
    <Section title="ابزار کاربر">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="کاربر">
          <SingleUserPicker value={user} onChange={(u) => { setUser(u); setOutput(undefined); }} />
        </Field>
        <Field label="استان (states)">
          <select className={inputCls} value={fkState} onChange={(e) => { setFkState(e.target.value); setFkCity(""); }} disabled={!user}>
            <option value="">—</option>
            {(states.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="شهر (cities → fkCity)" hint="اختیاری؛ ۰ یعنی نامشخص">
          <select className={inputCls} value={fkCity} onChange={(e) => setFkCity(e.target.value)} disabled={!fkState}>
            <option value="">—</option>
            {(cities.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {user && (
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary" busy={a.busy} onClick={() => call(() => api.get(`${API}/users/${user.id}/preview`))}>
            پیش‌نمایش داده‌ی ارسالی
          </ActionButton>
          <ActionButton variant="secondary" busy={a.busy} onClick={() => call(() => api.get(`${API}/users/${user.id}/balance`))}>
            موجودی در سامانه ناظر (GetUserBalance)
          </ActionButton>
          {can("zarpayesh.manage") && (
            <>
              <ActionButton busy={a.busy} onClick={() => call(() => api.post(`${API}/users/${user.id}/register`), "کاربر در سامانه ناظر ثبت شود؟")}>
                ثبت (AddPlatformUsers)
              </ActionButton>
              <ActionButton
                variant="secondary"
                busy={a.busy}
                onClick={() => call(() => api.post(`${API}/users/${user.id}/edit`, fkCity ? { fkCity: Number(fkCity) } : {}))}
              >
                ویرایش (EditPlatformUsers)
              </ActionButton>
            </>
          )}
        </div>
      )}
      {a.error && <Alert kind="error" text={a.error} />}
      {output !== undefined && <Json value={output} />}
    </Section>
  );
}

function UsersList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data } = useSWR<{ data: ZpUser[]; totalPages: number }>(
    `${API}/users?page=${page}&limit=20${status ? `&status=${status}` : ""}`,
    fetcher,
  );
  return (
    <Section
      title="کاربران ثبت‌شده در سامانه ناظر"
      actions={
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">همه</option>
          <option value="REGISTERED">ثبت‌شده</option>
          <option value="FAILED">ناموفق</option>
          <option value="PENDING">ثبت‌نشده</option>
        </select>
      }
    >
      {!data ? (
        <Spinner />
      ) : data.data.length === 0 ? (
        <Empty text="هنوز کاربری ثبت نشده است" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>کاربر</th>
              <th>موبایل</th>
              <th>کد ملی</th>
              <th>وضعیت</th>
              <th>ثبت</th>
              <th>آخرین همگام‌سازی</th>
              <th>خطا</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((u) => (
              <tr key={u.userId}>
                <td>{u.fullName || "—"}</td>
                <td dir="ltr">{u.phone}</td>
                <td dir="ltr">{u.nationalCode}</td>
                <td>
                  <Badge map={USER_STATUS} value={u.status} />
                </td>
                <td>{faDateTime(u.registeredAt)}</td>
                <td>{faDateTime(u.lastSyncedAt)}</td>
                <td className="text-red-600 text-[11px]">{u.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
    </Section>
  );
}

const LOOKUPS = [
  { key: "types", label: "Typelist — فلزات" },
  { key: "vaults", label: "Vaultlist — خزانه‌ها" },
  { key: "pay-types", label: "PayTypelist — ابزار پرداخت" },
  { key: "states", label: "states — استان‌ها" },
];

function Lookups() {
  const [out, setOut] = useState<unknown>(undefined);
  const [src, setSrc] = useState("");
  const a = useAction();
  const get = (url: string) =>
    a.run(async () => {
      const res = await api.get(url);
      setOut(res.data);
      return { data: { message: "دریافت شد" } };
    });
  return (
    <Section title="استعلام‌های زنده از سامانه ناظر">
      <div className="flex flex-wrap gap-2">
        {LOOKUPS.map((l) => (
          <ActionButton key={l.key} variant="secondary" busy={a.busy} onClick={() => get(`${API}/lookup/${l.key}`)}>
            {l.label}
          </ActionButton>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          dir="ltr"
          className={`${inputCls} max-w-xs`}
          placeholder="srcTrackingNumber"
          value={src}
          onChange={(e) => setSrc(e.target.value.replace(/[^\d]/g, ""))}
        />
        <ActionButton variant="secondary" busy={a.busy} disabled={!src} onClick={() => get(`${API}/followup/${src}`)}>
          TxnFollowup
        </ActionButton>
      </div>
      {a.error && <Alert kind="error" text={a.error} />}
      {out !== undefined && <Json value={out} />}
    </Section>
  );
}
