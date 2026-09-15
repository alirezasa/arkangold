// admin/app/api/admin/tickets/[id]/priority/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../../_lib/api';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const res = await proxyToApi(`/admin/tickets/${id}/priority`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
