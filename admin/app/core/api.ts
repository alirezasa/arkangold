import axios from "axios";

export const adminApi = axios.create({
  baseURL: "/",
  headers: { "Content-Type": "application/json" },
});

adminApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await axios.post("/api/admin-auth/logout");
      } finally {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);
