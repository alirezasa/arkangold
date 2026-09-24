import axios from "axios";
import useSWR from "swr";

export type ReferralTrigger = "SIGNUP" | "IDENTITY_VERIFIED";

export interface ReferralInvitee {
  id: string;
  phone: string | null;
  name: string | null;
  joinedAt: string;
  identityVerified: boolean;
  rewarded: boolean;
  rewardedAt: string | null;
  rewardRial: string;
  rewardGrams: string;
}

export interface MyReferralsResponse {
  referralCode: string;
  settings: {
    enabled: boolean;
    trigger: ReferralTrigger;
    rewardRial: string;
    rewardMg: string;
  };
  stats: {
    totalInvites: number;
    verifiedInvites: number;
    rewardedInvites: number;
    pendingInvites: number;
    totalRewardRial: string;
    totalRewardGrams: string;
  };
  invitees: ReferralInvitee[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

// ── هوک: کد/لینک دعوت، آمار و لیست دوستان دعوت‌شده ──
export const useMyReferrals = (page: number) => {
  const { data, isLoading, error } = useSWR<MyReferralsResponse>(
    `/api/referrals/me?page=${page}&limit=20`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? "خطا در دریافت اطلاعات دعوت از دوستان" : null,
  };
};

/** لینک دعوت — صفحه ثبت‌نام با کد دعوت از پیش پرشده */
export function buildInviteLink(origin: string, code: string) {
  return `${origin}/register?ref=${encodeURIComponent(code)}`;
}
