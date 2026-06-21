import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';
const NEST = 'http://localhost:5000';
async function tok() { return (await cookies()).get('accessToken')?.value; }

export async function POST(req: Request) {
  try {
    const token = await tok();
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const res = await axios.post(`${NEST}/wallet/deposit/tracking-id`, body, {
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
