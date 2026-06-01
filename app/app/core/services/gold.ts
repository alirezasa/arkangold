export interface GoldPriceResponse {
  success: boolean;
  source: string;
  price: number;
  change24h: number;
  updatedAt: string;
}

export async function fetchGoldPrice() {
  const response = await fetch("/api/gold");

  if (!response.ok) {
    throw new Error("خطا در دریافت قیمت");
  }

  return response.json();
}