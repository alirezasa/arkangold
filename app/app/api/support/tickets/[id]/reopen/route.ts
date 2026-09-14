// app/app/api/support/tickets/[id]/reopen/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await proxyToApi(`/tickets/${id}/reopen`, { method: 'POST' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
