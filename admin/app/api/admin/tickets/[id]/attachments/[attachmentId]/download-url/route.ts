// admin/app/api/admin/tickets/[id]/attachments/[attachmentId]/download-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { proxyToApi } from '../../../../../../_lib/api';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  const res = await proxyToApi(
    `/admin/tickets/${id}/attachments/${attachmentId}/download-url`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
