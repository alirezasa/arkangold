import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const NEST_API_URL = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const res = await axios.get(`${NEST_API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { message: error.response?.data?.message || 'خطا در دریافت پروفایل' },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}
