import { useState, useCallback } from "react";
import axios from "axios";
import useSWR from "swr";

// ── آدرس سرور NestJS برای نمایش تصاویر محصولات (فایل‌های استاتیک) ──
export const NEST_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN || "http://localhost:5000";

export function productImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${NEST_ORIGIN}${url}`;
}

// ── Types ──
export interface ProductImageItem {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
}

export interface ProductVariantItem {
  id: string;
  weightGrams: string;
  priceAdjustmentToman: string;
  finalPriceToman: string;
  stockQuantity: number;
  inStock: boolean;
  sku: string | null;
}

export interface WeightRangeInfo {
  minWeightGrams: string;
  maxWeightGrams: string;
  stepGrams: string;
  pricePerGramToman: string;
}

export type ProductPricingMode = "FIXED" | "WEIGHT_RANGE";

export interface ProductItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePriceToman: string;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  pricingMode: ProductPricingMode;
  category?: { id: string; name: string; slug: string } | null;
  images: ProductImageItem[];
  primaryImageUrl: string | null;
  weightRange: WeightRangeInfo | null;
  variants: ProductVariantItem[];
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  children?: CategoryItem[];
}

export type CartItemKind = "FIXED" | "WEIGHT_RANGE";

export interface CartItemDto {
  id: string;
  quantity: number;
  kind: CartItemKind;
  variantId: string | null;
  productId: string;
  productName: string;
  productSlug: string;
  weightGrams: string;
  unitPriceToman: string;
  lineTotalToman: string;
  priceBreakdown?: unknown;
  expiresInSeconds: number;
  stockQuantity: number | null;
  available: boolean;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  totalToman: number;
}

export interface ShopOrderItemDto {
  id: string;
  productName: string;
  productSlug: string;
  weightGrams: string;
  quantity: number;
  unitPriceToman: string;
  lineTotalToman: string;
}

export interface ShopOrderDto {
  id: string;
  status:
    | "PENDING_PAYMENT"
    | "PAID"
    | "PROCESSING"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED";
  totalToman: string;
  trackingCode: string | null;
  address?: {
    id: string;
    title?: string | null;
    fullAddress: string;
    province?: string | null;
    city?: string | null;
  };
  items: ShopOrderItemDto[];
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

// ── دسته‌بندی‌ها ──
export const useCategories = () => {
  const { data, isLoading, error } = useSWR<CategoryItem[]>(
    "/api/shop/categories",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { categories: data ?? [], loading: isLoading, error };
};

// ── لیست محصولات با فیلتر ──
export interface ProductsFilter {
  categoryId?: string;
  search?: string;
  inStock?: boolean;
  page?: number;
}

export const useProducts = (filter: ProductsFilter = {}) => {
  const qs = new URLSearchParams();
  if (filter.categoryId) qs.set("categoryId", filter.categoryId);
  if (filter.search) qs.set("search", filter.search);
  if (filter.inStock) qs.set("inStock", "true");
  qs.set("page", String(filter.page ?? 1));
  qs.set("limit", "20");

  const { data, isLoading, error } = useSWR(
    `/api/shop/products?${qs.toString()}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    products: (data?.data ?? []) as ProductItem[],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    loading: isLoading,
    error,
  };
};

// ── جزئیات یک محصول ──
export const useProduct = (slug: string | null) => {
  const { data, isLoading, error } = useSWR<ProductItem>(
    slug ? `/api/shop/products/${slug}` : null,
    fetcher,
  );
  return { product: data ?? null, loading: isLoading, error };
};

// ── سبد خرید ──
export const useCart = () => {
  const { data, isLoading, error, mutate } = useSWR<CartDto>(
    "/api/cart",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { cart: data ?? null, loading: isLoading, error, refresh: mutate };
};

// payload برای افزودن به سبد: یا variantId (محصول با تنوع ثابت)
// یا productId + weightGrams (محصول بازه‌وزنی)
export type AddToCartPayload =
  | { variantId: string; quantity: number }
  | { productId: string; weightGrams: number; quantity: number };

export const useAddToCart = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(async (payload: AddToCartPayload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("/api/cart/items", payload);
      return res.data as CartDto;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(
          Array.isArray(msg) ? msg[0] : msg || "خطا در افزودن به سبد خرید",
        );
      } else setError("خطای ناشناخته");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, add };
};

export const useUpdateCartItem = () => {
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (itemId: string, payload: { quantity?: number; weightGrams?: number }) => {
      setLoading(true);
      try {
        const res = await axios.patch(`/api/cart/items/${itemId}`, payload);
        return res.data as CartDto;
      } catch {
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const remove = useCallback(async (itemId: string) => {
    setLoading(true);
    try {
      const res = await axios.delete(`/api/cart/items/${itemId}`);
      return res.data as CartDto;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, update, remove };
};

// ── ثبت سفارش (checkout) ──
export const useCheckout = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = useCallback(async (addressId: string) => {
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const res = await axios.post(
        "/api/orders/shop",
        { addressId },
        { headers: { "idempotency-key": idempotencyKey } },
      );
      return res.data as ShopOrderDto;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ثبت سفارش");
      } else setError("خطای ناشناخته");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, checkout };
};

// ── پرداخت سفارش ──
export const usePayShopOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(async (orderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const res = await axios.post(
        `/api/orders/shop/${orderId}/pay`,
        { method: "WALLET" },
        { headers: { "idempotency-key": idempotencyKey } },
      );
      return res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const msg = e.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در پرداخت");
      } else setError("خطای ناشناخته");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, pay };
};

// ── تاریخچه سفارش‌ها ──
export const useShopOrders = (page = 1) => {
  const { data, isLoading, error, mutate } = useSWR(
    `/api/orders/shop?page=${page}&limit=20`,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    orders: (data?.data ?? []) as ShopOrderDto[],
    totalPages: data?.totalPages ?? 1,
    loading: isLoading,
    error,
    refresh: mutate,
  };
};

export const useShopOrder = (id: string | null) => {
  const { data, isLoading, error, mutate } = useSWR<ShopOrderDto>(
    id ? `/api/orders/shop/${id}` : null,
    fetcher,
  );
  return { order: data ?? null, loading: isLoading, error, refresh: mutate };
};

export const useCancelShopOrder = () => {
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`/api/orders/shop/${id}/cancel`);
      return res.data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, cancel };
};