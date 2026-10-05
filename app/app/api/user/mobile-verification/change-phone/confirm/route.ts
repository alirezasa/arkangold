import { NextResponse } from "next/server";
import axios from "axios";
import { NEST, errorResponse, getAccessToken } from "@/app/api/_lib/proxy";

/**
 * تأیید کد پیامکی شماره‌ی جدید. API همه‌ی نشست‌های قبلی (که شماره‌ی قدیمی را در توکن
 * دارند) را باطل و نشست تازه صادر می‌کند؛ این‌جا کوکی‌ها با توکن‌های جدید جایگزین می‌شوند
 * تا کاربر بدون ورود مجدد ادامه دهد.
 */
export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { phone?: string; code?: string };
    const res = await axios.post(
      `${NEST}/users/me/mobile-verification/change-phone/confirm`,
      { phone: body.phone, code: body.code },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const { accessToken, refreshToken, expiresIn, refreshExpiresIn, message, phone } =
      res.data as {
        accessToken: string;
        refreshToken: string;
        expiresIn?: number;
        refreshExpiresIn?: number;
        message: string;
        phone: string;
      };

    const response = NextResponse.json({ success: true, message, phone });
    response.cookies.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: Number(expiresIn) || 15 * 60,
      path: "/",
    });
    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: Number(refreshExpiresIn) || 7 * 24 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
