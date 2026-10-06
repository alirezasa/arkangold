// admin/app/utils/sensitive-query.ts
//
// FDP_ACC_EXT.1.1 — جستجو با موبایل/کد ملی نباید در URL درخواست‌ها بیاید (لاگ وب‌سرور و پراکسی،
// تاریخچه‌ی مرورگر، Referer). این interceptor پارامترهای حساس را از URL درخواست‌های axios به
// /api حذف و در سرآیند X-Arkan-Query (JSON با base64url) قرار می‌دهد؛ BFF همین سرآیند را به API
// می‌رساند و API آن را به‌جای query می‌خواند. کلید SWR (در حافظه) تغییری نمی‌کند.
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

export const SENSITIVE_QUERY_HEADER = "X-Arkan-Query";
export const SENSITIVE_QUERY_KEYS = ["search", "phone", "mobile", "nationalCode", "q"];

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function moveSensitiveParams(config: InternalAxiosRequestConfig) {
  if (!config.url || !config.url.startsWith("/api/")) return config;
  const url = new URL(config.url, "http://local");
  const moved: Record<string, string> = {};
  for (const key of SENSITIVE_QUERY_KEYS) {
    const v = url.searchParams.get(key);
    if (v !== null) {
      moved[key] = v;
      url.searchParams.delete(key);
    }
  }
  const params = config.params as Record<string, unknown> | undefined;
  if (params && typeof params === "object" && !(params instanceof URLSearchParams)) {
    const rest = { ...params };
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (typeof rest[key] === "string") {
        moved[key] = rest[key] as string;
        delete rest[key];
      }
    }
    config.params = rest;
  }
  if (!Object.keys(moved).length) return config;
  config.url = url.pathname + (url.search || "");
  config.headers.set(SENSITIVE_QUERY_HEADER, toBase64Url(JSON.stringify(moved)));
  return config;
}

const INSTALLED = Symbol.for("arkan.sensitiveQuery");

export function installSensitiveQueryGuard(instance: AxiosInstance) {
  const tagged = instance as AxiosInstance & { [INSTALLED]?: boolean };
  if (tagged[INSTALLED]) return;
  tagged[INSTALLED] = true;
  instance.interceptors.request.use(moveSensitiveParams);
}
