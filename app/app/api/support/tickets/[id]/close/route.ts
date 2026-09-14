// app/app/api/support/tickets/[id]/close/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi(`/tickets/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
