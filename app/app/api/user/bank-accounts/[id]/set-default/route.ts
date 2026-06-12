import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";

const NEST_API_URL = "http://localhost:5000";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }  // 🔁 تغییر نوع به Promise
) {
  try {
    // ✅ ابتدا params را await کنید
    const { id } = await params;

    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    // 🔧 حالا از id بجای params.id استفاده کنید
    const res = await axios.patch(
      `${NEST_API_URL}/users/me/bank-accounts/${id}/set-default`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { message: error.response?.data?.message || "خطا" },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}