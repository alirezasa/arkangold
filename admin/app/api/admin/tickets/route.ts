// admin/app/api/admin/tickets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../_lib/api';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  const res = await proxyToApi(`/admin/tickets${qs}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
