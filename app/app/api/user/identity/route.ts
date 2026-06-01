import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const NEST_API_URL = 'http://localhost:5000';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const res = await axios.post(`${NEST_API_URL}/users/me/identity`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const data = error.response?.data as { message?: string | string[] } | undefined;
      const message = Array.isArray(data?.message)
        ? data.message[0]
        : data?.message || 'خطا در ارسال اطلاعات';

      return NextResponse.json({ message }, { status });
    }
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}
