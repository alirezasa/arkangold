import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateProductVariantDto,
  UpdateProductVariantDto,
  GetProductsQueryDto,
} from '@arkan-gold/shared';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  // ══════════════════════════════════════════
  // دسته‌بندی‌ها
  // ══════════════════════════════════════════
  async listCategories() {
    return this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: { children: true },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('دسته‌بندی والد یافت نشد');
    }
    const slug = await this.generateUniqueSlug(
      dto.slug || dto.name,
      'productCategory',
    );
    return this.prisma.productCategory.create({ data: { ...dto, slug } });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    return this.prisma.productCategory.update({ where: { id }, data: dto });
  }

  // ══════════════════════════════════════════
  // محصولات (عمومی)
  // ══════════════════════════════════════════
  async listProducts(query: GetProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            basePriceRial: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.inStock
        ? { variants: { some: { stockQuantity: { gt: 0 } } } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { variants: true, category: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((p) => this.toProductDto(p)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: { variants: true, category: true },
    });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('محصول یافت نشد');
    }
    return this.toProductDto(product);
  }

  // ══════════════════════════════════════════
  // محصولات (ادمین)
  // ══════════════════════════════════════════
  async createProduct(dto: CreateProductDto) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');

    const slug = await this.generateUniqueSlug(dto.slug || dto.name, 'product');

    return this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        slug,
        description: dto.description,
        basePriceRial: dto.basePriceRial, // حل مشکل unsafe call با پاس دادن مستقیم مقدار
        seoTitle: dto.seoTitle,
        seoDesc: dto.seoDesc,
      },
      include: { variants: true },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto, // Prisma خود مقادیر undefined را نادیده گرفته و عدد/رشته را به Decimal تبدیل می‌کند
      },
      include: { variants: true },
    });
  }

  async addVariant(productId: string, dto: CreateProductVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    if (dto.sku) {
      const existing = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (existing)
        throw new ConflictException('این SKU قبلاً استفاده شده است');
    }

    return this.prisma.productVariant.create({
      data: {
        productId,
        weightGrams: dto.weightGrams,
        priceAdjustment: dto.priceAdjustment ?? 0,
        stockQuantity: dto.stockQuantity,
        sku: dto.sku,
      },
    });
  }

  async updateVariant(id: string, dto: UpdateProductVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
    });
    if (!variant) throw new NotFoundException('تنوع محصول یافت نشد');

    if (dto.sku && dto.sku !== variant.sku) {
      const existing = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (existing)
        throw new ConflictException('این SKU قبلاً استفاده شده است');
    }

    return this.prisma.productVariant.update({
      where: { id },
      data: {
        ...dto,
      },
    });
  }

  // ══════════════════════════════════════════
  // helpers
  // ══════════════════════════════════════════
  private async generateUniqueSlug(
    base: string,
    model: 'product' | 'productCategory',
  ): Promise<string> {
    let slug = base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) slug = `item-${Date.now().toString(36)}`;

    let candidate = slug;
    let counter = 1;

    // خط کامنت eslint در اینجا حذف شد تا ارور برطرف شود
    while (true) {
      const exists =
        model === 'product'
          ? await this.prisma.product.findUnique({ where: { slug: candidate } })
          : await this.prisma.productCategory.findUnique({
              where: { slug: candidate },
            });
      if (!exists) return candidate;
      candidate = `${slug}-${++counter}`;
    }
  }

  private toProductDto(p: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    basePriceRial: string | number | { toString(): string };
    status: string;
    variants: {
      id: string;
      weightGrams: string | number | { toString(): string };
      priceAdjustment: string | number | { toString(): string };
      stockQuantity: number;
      sku: string | null;
    }[];
    category?: unknown;
  }) {
    const baseRial = Number(p.basePriceRial);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      basePriceToman: (baseRial / 10).toString(),
      status: p.status,
      category: p.category,
      variants: p.variants.map((v) => {
        const weight = Number(v.weightGrams);
        const adjustment = Number(v.priceAdjustment);

        return {
          id: v.id,
          weightGrams: weight.toString(),
          priceAdjustmentToman: (adjustment / 10).toString(),
          finalPriceToman: ((baseRial + adjustment) / 10).toString(),
          stockQuantity: v.stockQuantity,
          inStock: v.stockQuantity > 0,
          sku: v.sku,
        };
      }),
    };
  }
}
