import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

const API = 'http://localhost:5000';

async function getToken() {
  const c = await cookies();
  return c.get('accessToken')?.value;
}

export async function GET() {
  try {
    const token = await getToken();
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const res = await axios.get(`${API}/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json({ message: e.response?.data?.message || 'خطا' }, { status: e.response?.status || 500 });
    return NextResponse.json({ message: 'خطای سرور' }, { status: 500 });
  }
}