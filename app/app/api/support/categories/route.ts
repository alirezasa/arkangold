// app/app/api/support/categories/route.ts
import { NextResponse } from 'next/server';
import { proxyToApi } from '../_lib/api';

export async function GET() {
  const res = await proxyToApi('/tickets/meta/categories');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
