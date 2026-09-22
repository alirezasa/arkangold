// admin/app/api/admin/holograms/_lib.ts
//
// کمک‌کننده مشترک برای proxy routeهای هولوگرام — همان الگوی axios+cookie که در
// سایر route های admin/app/api/admin/* تکرار شده، اینجا فقط یک‌بار نوشته شده
// چون تعداد endpoint های هولوگرام زیاد است (مشابه app/app/api/_lib/proxy.ts).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios, { Method } from "axios";

const NEST = "http://localhost:5000";

export async function proxyAdmin(
  path: string,
  options: { method?: Method; data?: unknown; params?: Record<string, string> } = {},
) {
  try {
    const token = (await cookies()).get("adminAccessToken")?.value;
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const res = await axios({
      url: `${NEST}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      params: options.params,
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(
        { message: e.response?.data?.message || "خطا" },
        { status: e.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
