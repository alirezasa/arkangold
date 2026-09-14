// admin/app/api/admin/ticket-categories/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const res = await proxyToApi(`/admin/ticket-categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await proxyToApi(`/admin/ticket-categories/${id}`, { method: 'DELETE' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
