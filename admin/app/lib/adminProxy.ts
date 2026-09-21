// admin/app/lib/adminProxy.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios, { type AxiosRequestConfig } from "axios";

export const NEST =
  process.env.NEST_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? "https://api.arkan.gold"
    : "http://localhost:5000");

export async function adminProxy(
  path: string,
  config: AxiosRequestConfig = {},
): Promise<NextResponse> {
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const res = await axios({
      url: `${NEST}${path}`,
      method: config.method ?? "GET",
      data: config.data,
      params: config.params,
      headers: { ...config.headers, Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(
        { message: e.response?.data?.message ?? "خطا" },
        { status: e.response?.status ?? 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
