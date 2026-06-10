import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const API = 'http://localhost:5000';

export async function GET(request: Request) {
  try {
    const c = await cookies();
    const token = c.get('accessToken')?.value;
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams({
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      ...(searchParams.get('type') ? { type: searchParams.get('type')! } : {}),
    });

    const res = await axios.get(`${API}/wallet/transactions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json({ message: e.response?.data?.message || 'خطا' }, { status: e.response?.status || 500 });
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}