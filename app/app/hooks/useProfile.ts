import { useState, useEffect } from "react";
import axios from "axios";

export interface UserProfile {
  id: string;
  phone: string;
  identity: {
    firstName: string;
    lastName: string;
    status: "VERIFIED" | "MANUAL_REVIEW" | "PENDING" | null;
  } | null;
  // سایر فیلدهایی که از بک‌اند می‌آیند...
}

export const useProfile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get("/api/user");
        setProfile(res.data);
      } catch (err) {
        setError("خطا در دریافت اطلاعات کاربری");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  return { profile, loading, error };
};
