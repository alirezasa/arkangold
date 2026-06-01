import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://api.talasea.ir/api/market/getGoldPrice",
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "خطا در دریافت قیمت طلا" },
        { status: 500 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      source: "talasea",
      price: Number(data.price),
      change24h: Number(data.change24h),
      fee: data.fee,
      disableBuy: data.disableBuy,
      disableSell: data.disableSell,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "خطا در ارتباط با سرویس طلا",
      },
      { status: 500 }
    );
  }
}