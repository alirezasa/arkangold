import axios from "axios";
import useSWR from "swr";

export type AppServiceKey = "meltedGold" | "goldIngot" | "jewelry";

export type AppServicesConfig = Record<AppServiceKey, { enabled: boolean }>;

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

/**
 * وضعیت فعال/غیرفعال خدمات صفحه اصلی (طلای آب‌شده، شمش طلا، زیورآلات)
 * که از پنل ادمین (تنظیمات سیستم ← service.*.enabled) مدیریت می‌شود.
 */
export const useAppServices = () => {
  const { data, isLoading, error } = useSWR<AppServicesConfig>(
    "/api/app-config/services",
    fetcher,
    { refreshInterval: 60_000 },
  );

  return {
    services: data ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت وضعیت خدمات" : null,
    /** تا زمان دریافت وضعیت، null برمی‌گرداند */
    isEnabled: (key: AppServiceKey): boolean | null =>
      data ? data[key]?.enabled !== false : null,
  };
};
