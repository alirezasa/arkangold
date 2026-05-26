import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'با موفقیت خارج شدید' });
  
  // پاک کردن کوکی اکسس توکن از مرورگر
  response.cookies.delete('accessToken');
  
  return response;
}