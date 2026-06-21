import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const NEST_API_URL = 'http://localhost:5000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('accessToken')?.value;
}

export async function GET() {
  try {
    const token = await getToken();
    
    // بررسی وجود توکن
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // ارسال درخواست به بک‌اند به همراه هدر Authorization
    const res = await axios.get(`${NEST_API_URL}/wallet/deposit/config`, {
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