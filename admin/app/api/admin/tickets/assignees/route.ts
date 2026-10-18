// admin/app/api/admin/tickets/assignees/route.ts — کارشناسان قابل ارجاع تیکت (tickets.assign)
import { NextResponse } from 'next/server';
import { proxyToApi } from '../../../_lib/api';

export async function GET() {
  const res = await proxyToApi('/admin/tickets/assignees');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
