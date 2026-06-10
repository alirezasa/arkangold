import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const API = 'http://localhost:5000';

async function getToken() {
  const c = await cookies();
  return c.get('accessToken')?.value;
}

export async function GET(request: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const res = await axios.get(
      `${API}/finance/withdrawals?page=${searchParams.get('page') || 1}&limit=${searchParams.get('limit') || 10}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json({ message: e.response?.data?.message || 'خطا' }, { status: e.response?.status || 500 });
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const res = await axios.post(`${API}/finance/withdraw`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const d = e.response?.data as { message?: string | string[] } | undefined;
      const msg = Array.isArray(d?.message) ? d.message[0] : d?.message || 'خطا';
      return NextResponse.json({ message: msg }, { status: e.response?.status || 500 });
    }
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}