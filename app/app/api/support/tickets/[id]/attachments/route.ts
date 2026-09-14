// app/app/api/support/tickets/[id]/attachments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();

  const res = await proxyToApi(`/tickets/${id}/attachments`, {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
