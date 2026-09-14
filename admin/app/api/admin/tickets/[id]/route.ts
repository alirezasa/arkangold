// admin/app/api/admin/tickets/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await proxyToApi(`/admin/tickets/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
