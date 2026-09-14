// app/app/api/support/tickets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../_lib/api';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  const res = await proxyToApi(`/tickets${qs}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await proxyToApi('/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
