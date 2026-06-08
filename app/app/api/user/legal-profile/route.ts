import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const NEST_API_URL = 'http://localhost:5000';

function getToken() {
  return cookies().then((c) => c.get('accessToken')?.value);
}

// GET — دریافت پروفایل حقوقی
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const res = await axios.get(`${NEST_API_URL}/users/me/legal-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { message: error.response?.data?.message || 'خطا' },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}

// POST — ثبت/بروزرسانی اطلاعات شرکت
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const res = await axios.post(`${NEST_API_URL}/users/me/legal-profile`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as { message?: string | string[] } | undefined;
      const message = Array.isArray(data?.message) ? data.message[0] : data?.message || 'خطا';
      return NextResponse.json({ message }, { status: error.response?.status || 500 });
    }
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}