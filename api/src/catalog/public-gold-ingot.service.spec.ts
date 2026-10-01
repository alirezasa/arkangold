import { NotFoundException } from '@nestjs/common';
import { PublicGoldIngotService } from './public-gold-ingot.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemConfigService } from '../system-config/system-config.service';
import type { CatalogService } from './catalog.service';

const product = {
  id: 'p1',
  name: 'شمش ۱ گرمی',
  slug: 'ingot-1g',
  description: 'توضیحات کامل',
  shortDescription: 'خلاصه',
  specifications: [{ label: 'عیار', value: '۹۹۵' }],
  basePriceToman: '0',
  status: 'ACTIVE',
  pricingMode: 'FIXED',
  hasPricingFormula: true,
  purityKarat: '24',
  category: { id: 'c1', name: 'شمش طلا', slug: 'gold-ingot' },
  images: [
    {
      id: 'i1',
      url: '/uploads/products/a.webp',
      altText: null,
      isPrimary: true,
    },
  ],
  primaryImageUrl: '/uploads/products/a.webp',
  weightRange: null,
  variants: [
    {
      id: 'v2',
      weightGrams: '2',
      priceAdjustmentToman: '0',
      finalPriceToman: '20000000.4',
      stockQuantity: 0,
      inStock: false,
      sku: null,
    },
    {
      id: 'v1',
      weightGrams: '1',
      priceAdjustmentToman: '0',
      finalPriceToman: '10000000.6',
      stockQuantity: 3,
      inStock: true,
      sku: 'G1',
    },
  ],
};

describe('PublicGoldIngotService (API عمومی شمش)', () => {
  const env = { ...process.env };
  let catalog: { listProducts: jest.Mock; getProductBySlug: jest.Mock };
  let prisma: { product: { findFirst: jest.Mock } };
  let config: { getBoolean: jest.Mock };
  let service: PublicGoldIngotService;

  beforeEach(() => {
    process.env.PUBLIC_API_URL = 'https://api.arkan.gold/';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.arkan.gold';
    catalog = {
      listProducts: jest.fn().mockResolvedValue({
        data: [product],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      }),
      getProductBySlug: jest.fn().mockResolvedValue({
        ...product,
        packagingOptions: [
          {
            id: 'box',
            name: 'جعبه',
            description: null,
            imageUrl: '/uploads/packaging/box.webp',
            priceToman: '50000',
            perUnit: true,
            isDefault: true,
            freeThresholdToman: null,
          },
        ],
      }),
    };
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    };
    config = { getBoolean: jest.fn().mockResolvedValue(true) };
    service = new PublicGoldIngotService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
      config as unknown as SystemConfigService,
    );
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('فقط دسته شمش را می‌خواند و آدرس تصویر و لینک خرید را مطلق می‌سازد', async () => {
    const res = await service.list({ page: 1, limit: 20, inStock: false });

    expect(catalog.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ categorySlug: 'gold-ingot' }),
    );
    const item = res.data[0];
    expect(item.primaryImageUrl).toBe(
      'https://api.arkan.gold/uploads/products/a.webp',
    );
    expect(item.images[0].altText).toBe(product.name);
    expect(item.buyUrl).toBe(
      'https://app.arkan.gold/dashboard/gold-ingot/ingot-1g',
    );
    // تنوع‌ها بر اساس وزن مرتب و هر کدام لینک خرید مخصوص خود را دارند
    expect(item.variants.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(item.variants[0].buyUrl).toBe(
      'https://app.arkan.gold/dashboard/gold-ingot/ingot-1g?variant=v1',
    );
    expect(item.variants[0]).not.toHaveProperty('stockQuantity');
    // بازه قیمت فقط از تنوع‌های موجود، با گرد شدن به تومان
    expect(item.inStock).toBe(true);
    expect(item.priceFromToman).toBe('10000001');
    expect(item.priceToToman).toBe('10000001');
  });

  it('با غیرفعال بودن خدمت شمش، لیست خالی و جزئیات ۴۰۴ برمی‌گردد', async () => {
    config.getBoolean.mockResolvedValue(false);

    const res = await service.list({ page: 1, limit: 20, inStock: false });
    expect(res.serviceEnabled).toBe(false);
    expect(res.data).toEqual([]);
    expect(catalog.listProducts).not.toHaveBeenCalled();

    await expect(service.getBySlug('ingot-1g')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('محصول خارج از دسته شمش در جزئیات یافت نمی‌شود', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getBySlug('ring')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(catalog.getProductBySlug).not.toHaveBeenCalled();
  });

  it('جزئیات شامل طرح‌های بسته‌بندی با تصویر مطلق است و نتیجه کش می‌شود', async () => {
    const first = await service.getBySlug('ingot-1g');
    await service.getBySlug('ingot-1g');

    expect(first.data.packagingOptions[0].imageUrl).toBe(
      'https://api.arkan.gold/uploads/packaging/box.webp',
    );
    expect(catalog.getProductBySlug).toHaveBeenCalledTimes(1);
  });
});
