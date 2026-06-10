import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const API = 'http://localhost:5000';

export async function GET() {
  try {
    const c = await cookies();
    const token = c.get('accessToken')?.value;
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const res = await axios.get(`${API}/finance/deposit/sheba-info`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json(
        { message: e.response?.data?.message || 'خطا' },
        { status: e.response?.status || 500 },
      );
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}