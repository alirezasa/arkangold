import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const NEST_API_URL = 'http://localhost:5000';

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get('accessToken')?.value;
}

// POST /api/wallet/deposit/card-to-card → initiate
export async function POST(request: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const res = await axios.post(
      `${NEST_API_URL}/wallet/deposit/card-to-card/initiate`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );
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