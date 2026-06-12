import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const API = 'http://localhost:5000';

export async function POST(request: Request) {
  try {
    const c = await cookies();
    const token = c.get('accessToken')?.value;
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const res = await axios.post(`${API}/finance/deposit/gateway/validate`, body, {
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