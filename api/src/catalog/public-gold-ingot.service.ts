// api/src/catalog/public-gold-ingot.service.ts
//
// API عمومی محصولات شمش طلا برای نمایش در سایت اصلی (arkan.gold).
// خروجی کامل و مستقل از اپ است: آدرس تصاویر مطلق، قیمت لحظه‌ای (تومان) و
// لینک خرید (buyUrl) که کاربر را به صفحه همان محصول در app.arkan.gold می‌برد؛
// اپ در صورت نیاز ابتدا ورود/ثبت‌نام و احراز هویت را می‌گیرد و سپس کاربر را
// به همان صفحه برمی‌گرداند.
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { CatalogService, GOLD_INGOT_CATEGORY_SLUG } from './catalog.service';

type CatalogProduct = Awaited<
  ReturnType<CatalogService['listProducts']>
>['data'][number];

// قیمت‌ها از قیمت لحظه‌ای طلا محاسبه می‌شوند؛ کش کوتاه فشار فراخوانی‌های
// پرتعداد صفحه اصلی سایت را از روی موتور قیمت برمی‌دارد
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 200;

export const PUBLIC_GOLD_INGOT_MAX_LIMIT = 50;

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function resolveApiPublicUrl() {
  return stripTrailingSlash(
    process.env.PUBLIC_API_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://api.arkan.gold'
        : 'http://localhost:5000'),
  );
}

function resolveAppUrl() {
  return stripTrailingSlash(
    process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://app.arkan.gold'
        : 'http://localhost:3000'),
  );
}

function roundToman(value: string | number | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toString() : null;
}

@Injectable()
export class PublicGoldIngotService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: Promise<unknown> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly config: SystemConfigService,
  ) {}

  list(params: { page: number; limit: number; inStock: boolean }) {
    const key = `list:${params.page}:${params.limit}:${params.inStock}`;
    return this.cached(key, () => this.buildList(params));
  }

  getBySlug(slug: string) {
    return this.cached(`detail:${slug}`, () => this.buildDetail(slug));
  }

  private async buildList(params: {
    page: number;
    limit: number;
    inStock: boolean;
  }) {
    const serviceEnabled = await this.isServiceEnabled();
    const base = {
      serviceEnabled,
      currency: 'TOMAN' as const,
      generatedAt: new Date().toISOString(),
    };

    if (!serviceEnabled) {
      return {
        ...base,
        data: [],
        page: params.page,
        limit: params.limit,
        total: 0,
        totalPages: 1,
      };
    }

    const result = await this.catalog.listProducts({
      page: params.page,
      limit: params.limit,
      categorySlug: GOLD_INGOT_CATEGORY_SLUG,
      inStock: params.inStock || undefined,
    });

    return {
      ...base,
      data: result.data.map((p) => this.toPublicProduct(p)),
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  private async buildDetail(slug: string) {
    // فقط محصولات دسته شمش از این API قابل دسترسی‌اند
    const [belongsToIngots, serviceEnabled] = await Promise.all([
      this.prisma.product.findFirst({
        where: { slug, category: { slug: GOLD_INGOT_CATEGORY_SLUG } },
        select: { id: true },
      }),
      this.isServiceEnabled(),
    ]);
    if (!belongsToIngots || !serviceEnabled) {
      throw new NotFoundException('محصول یافت نشد');
    }

    const product = await this.catalog.getProductBySlug(slug);
    const apiUrl = resolveApiPublicUrl();

    return {
      serviceEnabled,
      currency: 'TOMAN' as const,
      generatedAt: new Date().toISOString(),
      data: {
        ...this.toPublicProduct(product),
        packagingOptions: product.packagingOptions.map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description,
          imageUrl: this.absoluteUrl(o.imageUrl, apiUrl),
          priceToman: roundToman(o.priceToman),
          perUnit: o.perUnit,
          isDefault: o.isDefault,
          freeThresholdToman: roundToman(o.freeThresholdToman),
        })),
      },
    };
  }

  private toPublicProduct(p: CatalogProduct) {
    const apiUrl = resolveApiPublicUrl();
    const productBuyUrl = `${resolveAppUrl()}/dashboard/gold-ingot/${encodeURIComponent(p.slug)}`;
    const category = p.category as { name?: string; slug?: string } | null;

    const variants = p.variants
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        weightGrams: v.weightGrams,
        finalPriceToman: roundToman(v.finalPriceToman),
        inStock: v.inStock,
        buyUrl: `${productBuyUrl}?variant=${encodeURIComponent(v.id)}`,
      }))
      .sort((a, b) => Number(a.weightGrams) - Number(b.weightGrams));

    const weightRange = p.weightRange
      ? {
          minWeightGrams: p.weightRange.minWeightGrams,
          maxWeightGrams: p.weightRange.maxWeightGrams,
          stepGrams: p.weightRange.stepGrams,
          pricePerGramToman: roundToman(p.weightRange.pricePerGramToman),
          minPriceToman: roundToman(p.weightRange.minPriceToman),
          maxPriceToman: roundToman(p.weightRange.maxPriceToman),
        }
      : null;

    // محصول بازه‌وزنی موجودی تنوعی ندارد و همیشه قابل سفارش است
    const inStock = weightRange ? true : variants.some((v) => v.inStock);

    // بازه قیمت برای کارت محصول: از تنوع‌های موجود، و اگر هیچ‌کدام موجود
    // نبود از همه تنوع‌ها (تا قیمت مرجع همچنان نمایش داده شود)
    let priceFromToman: string | null = null;
    let priceToToman: string | null = null;
    if (weightRange) {
      priceFromToman = weightRange.minPriceToman;
      priceToToman = weightRange.maxPriceToman;
    } else {
      const pool = variants.some((v) => v.inStock)
        ? variants.filter((v) => v.inStock)
        : variants;
      const prices = pool
        .map((v) => Number(v.finalPriceToman))
        .filter((n) => Number.isFinite(n));
      if (prices.length) {
        priceFromToman = Math.min(...prices).toString();
        priceToToman = Math.max(...prices).toString();
      }
    }

    const images = p.images.map((img) => ({
      url: this.absoluteUrl(img.url, apiUrl),
      altText: img.altText ?? p.name,
      isPrimary: img.isPrimary,
    }));

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      specifications: p.specifications,
      purityKarat: p.purityKarat,
      pricingMode: p.pricingMode,
      livePricing: Boolean(p.purityKarat),
      category: category
        ? { name: category.name ?? null, slug: category.slug ?? null }
        : null,
      primaryImageUrl: this.absoluteUrl(p.primaryImageUrl, apiUrl),
      images,
      inStock,
      priceFromToman,
      priceToToman,
      weightRange,
      variants,
      buyUrl: productBuyUrl,
    };
  }

  private absoluteUrl(url: string | null | undefined, apiUrl: string) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  private isServiceEnabled() {
    return this.config.getBoolean('service.gold_ingot.enabled', true);
  }

  private cached<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      for (const [k, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(k);
      }
      if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.clear();
    }

    const value = factory();
    this.cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
    // خطا (مثلاً 404) کش نمی‌شود تا درخواست بعدی دوباره امتحان کند
    value.catch(() => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    });
    return value;
  }
}
