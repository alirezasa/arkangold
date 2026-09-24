import { useCallback } from "react";
import axios from "axios";
import useSWR from "swr";

export type NotificationLevel = "INFO" | "SUCCESS" | "WARNING" | "PROMO";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  level: NotificationLevel;
  publishedAt: string;
  readAt: string | null;
}

interface NotificationsResponse {
  unreadCount: number;
  items: NotificationItem[];
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

/** اعلان‌های زنگوله که ادمین از پنل «اعلان‌های کاربران» درج می‌کند */
export const useNotifications = () => {
  const { data, isLoading, error, mutate } = useSWR<NotificationsResponse>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 60_000 },
  );

  const markRead = useCallback(
    async (id: string) => {
      // به‌روزرسانی خوش‌بینانه: بلافاصله خوانده‌شده نمایش داده شود
      await mutate(
        async (current) => {
          await axios.post(`/api/notifications/${id}/read`);
          return current;
        },
        {
          optimisticData: (current) =>
            current
              ? {
                  unreadCount: Math.max(
                    0,
                    current.unreadCount -
                      (current.items.some((i) => i.id === id && !i.readAt) ? 1 : 0),
                  ),
                  items: current.items.map((i) =>
                    i.id === id && !i.readAt
                      ? { ...i, readAt: new Date().toISOString() }
                      : i,
                  ),
                }
              : { unreadCount: 0, items: [] },
          rollbackOnError: true,
          revalidate: true,
        },
      );
    },
    [mutate],
  );

  const markAllRead = useCallback(async () => {
    await mutate(
      async (current) => {
        await axios.post("/api/notifications/read-all");
        return current;
      },
      {
        optimisticData: (current) =>
          current
            ? {
                unreadCount: 0,
                items: current.items.map((i) =>
                  i.readAt ? i : { ...i, readAt: new Date().toISOString() },
                ),
              }
            : { unreadCount: 0, items: [] },
        rollbackOnError: true,
        revalidate: true,
      },
    );
  }, [mutate]);

  return {
    items: data?.items ?? [],
    unreadCount: data?.unreadCount ?? 0,
    loading: isLoading,
    error: error ? "خطا در دریافت اعلان‌ها" : null,
    markRead,
    markAllRead,
  };
};
