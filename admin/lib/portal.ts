// admin/lib/portal.ts
//
// یک برنامه‌ی Next روی دو دامنه:
//   admin.arkan.gold  → پنل مدیریت (کارشناسان)
//   panel.arkan.gold  → پنل نمایندگان فروش
// دامنه‌های پنل نمایندگان با NEXT_PUBLIC_AGENT_PANEL_HOSTS (جداشده با کاما) قابل تغییر است؛
// هر دامنه‌ای که با «panel.» شروع شود هم پنل نمایندگان حساب می‌شود (مثلاً panel.localhost در توسعه).

export type Portal = "admin" | "agent";

const DEFAULT_AGENT_HOSTS = ["panel.arkan.gold", "panel.localhost"];

function agentHosts(): string[] {
  const env = process.env.NEXT_PUBLIC_AGENT_PANEL_HOSTS;
  if (!env) return DEFAULT_AGENT_HOSTS;
  return env
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function portalFromHost(host: string | null | undefined): Portal {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!h) return "admin";
  return agentHosts().includes(h) || h.startsWith("panel.") ? "agent" : "admin";
}

/** دامنه‌ی درخواست (پشت پراکسی لیارا x-forwarded-host مقدم است) */
export function requestHost(headers: Headers): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

export function portalFromHeaders(headers: Headers): Portal {
  return portalFromHost(requestHost(headers));
}

/** صفحه‌ی اصلی هر پنل پس از ورود */
export const PORTAL_HOME: Record<Portal, string> = {
  admin: "/",
  agent: "/agent-portal",
};

/** مسیرهایی که حساب نماینده در پنل نمایندگان می‌بیند */
export const AGENT_PORTAL_PATHS = ["/agent-portal", "/agent-docs", "/profile", "/invoices"];

export const PORTAL_LABEL: Record<Portal, string> = {
  admin: "پنل مدیریت",
  agent: "پنل نمایندگان",
};
