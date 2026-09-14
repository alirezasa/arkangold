// admin/app/api/admin/tickets/dashboard/route.ts
import { NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function GET() {
  const res = await proxyToApi('/admin/tickets/dashboard');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
