// app/app/api/_lib/proxy.ts
// کمکی مشترک BFF — توکن از کوکی HttpOnly خوانده می‌شود و هرگز به کلاینت نمی‌رسد.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios, { type AxiosRequestConfig } from "axios";

export const NEST = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function getAccessToken() {
  return (await cookies()).get("accessToken")?.value;
}

export function errorResponse(e: unknown) {
  if (axios.isAxiosError(e)) {
    return NextResponse.json(
      { message: e.response?.data?.message ?? "خطا در ارتباط با سرور" },
      { status: e.response?.status ?? 500 },
    );
  }
  return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
}

export async function proxy(
  path: string,
  config: AxiosRequestConfig = {},
): Promise<NextResponse> {
  const token = await getAccessToken();
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
    return errorResponse(e);
  }
}
