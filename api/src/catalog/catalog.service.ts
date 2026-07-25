import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  ProductPricingMode as PrismaProductPricingMode,
} from '../generated/prisma/client';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateProductVariantDto,
  UpdateProductVariantDto,
  GetProductsQueryDto,
  ProductPricingMode as SharedProductPricingMode,
} from '@arkan-gold/shared';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

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

      if (!parent) {
        throw new NotFoundException('دسته‌بندی والد یافت نشد');
      }
    }

    const slug = await this.generateUniqueSlug(
      dto.slug || dto.name,
      'productCategory',
    );

    return this.prisma.productCategory.create({
      data: {
        ...dto,
        slug,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('دسته‌بندی والد یافت نشد');
      }
    }

    return this.prisma.productCategory.update({
      where: { id },
      data: dto,
    });
  }

  async listProducts(query: GetProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            name: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
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
        ? {
            variants: {
              some: {
                stockQuantity: { gt: 0 },
              },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          variants: true,
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((item) => this.toProductDto(item)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        variants: true,
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('محصول یافت نشد');
    }

    return this.toProductDto(product);
  }

  async createProduct(dto: CreateProductDto) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    const slug = await this.generateUniqueSlug(dto.slug || dto.name, 'product');
    const pricingMode = dto.pricingMode ?? SharedProductPricingMode.FIXED;

    this.validateWeightRangeFields(pricingMode, {
      minWeightGrams: dto.minWeightGrams,
      maxWeightGrams: dto.maxWeightGrams,
      weightStepGrams: dto.weightStepGrams ?? 0.1,
      pricePerGramRial: dto.pricePerGramRial,
    });

    return this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        slug,
        description: dto.description,
        basePriceRial: dto.basePriceRial,
        seoTitle: dto.seoTitle,
        seoDesc: dto.seoDesc,
        pricingMode: this.toPrismaPricingMode(pricingMode),
        minWeightGrams:
          pricingMode === SharedProductPricingMode.WEIGHT_RANGE
            ? dto.minWeightGrams
            : null,
        maxWeightGrams:
          pricingMode === SharedProductPricingMode.WEIGHT_RANGE
            ? dto.maxWeightGrams
            : null,
        weightStepGrams:
          pricingMode === SharedProductPricingMode.WEIGHT_RANGE
            ? (dto.weightStepGrams ?? 0.1)
            : null,
        pricePerGramRial:
          pricingMode === SharedProductPricingMode.WEIGHT_RANGE
            ? dto.pricePerGramRial
            : null,
      },
      include: {
        variants: true,
      },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category) {
        throw new NotFoundException('دسته‌بندی یافت نشد');
      }
    }

    const effectiveMode =
      dto.pricingMode ?? this.toSharedPricingMode(product.pricingMode);

    const touchesRangeFields =
      dto.pricingMode !== undefined ||
      dto.minWeightGrams !== undefined ||
      dto.maxWeightGrams !== undefined ||
      dto.weightStepGrams !== undefined ||
      dto.pricePerGramRial !== undefined;

    if (touchesRangeFields) {
      this.validateWeightRangeFields(effectiveMode, {
        minWeightGrams:
          dto.minWeightGrams ?? this.toOptionalNumber(product.minWeightGrams),
        maxWeightGrams:
          dto.maxWeightGrams ?? this.toOptionalNumber(product.maxWeightGrams),
        weightStepGrams:
          dto.weightStepGrams ??
          this.toOptionalNumber(product.weightStepGrams) ??
          0.1,
        pricePerGramRial:
          dto.pricePerGramRial ??
          this.toOptionalNumber(product.pricePerGramRial),
      });
    }

    const data: Prisma.ProductUpdateInput = {
      category:
        dto.categoryId !== undefined
          ? {
              connect: {
                id: dto.categoryId,
              },
            }
          : undefined,
      name: dto.name,
      description: dto.description,
      basePriceRial: dto.basePriceRial,
      seoTitle: dto.seoTitle,
      seoDesc: dto.seoDesc,
      status: dto.status,
      pricingMode: this.toPrismaPricingMode(effectiveMode),
    };

    if (effectiveMode === SharedProductPricingMode.FIXED) {
      data.minWeightGrams = null;
      data.maxWeightGrams = null;
      data.weightStepGrams = null;
      data.pricePerGramRial = null;
    }

    if (effectiveMode === SharedProductPricingMode.WEIGHT_RANGE) {
      data.minWeightGrams = dto.minWeightGrams;
      data.maxWeightGrams = dto.maxWeightGrams;
      data.weightStepGrams = dto.weightStepGrams;
      data.pricePerGramRial = dto.pricePerGramRial;
    }

    return this.prisma.product.update({
      where: { id },
      data,
      include: {
        variants: true,
      },
    });
  }

  async addVariant(productId: string, dto: CreateProductVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    if (dto.sku) {
      const existing = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });

      if (existing) {
        throw new ConflictException('این SKU قبلاً استفاده شده است');
      }
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

    if (!variant) {
      throw new NotFoundException('تنوع محصول یافت نشد');
    }

    if (dto.sku && dto.sku !== variant.sku) {
      const existing = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });

      if (existing) {
        throw new ConflictException('این SKU قبلاً استفاده شده است');
      }
    }

    return this.prisma.productVariant.update({
      where: { id },
      data: {
        ...dto,
      },
    });
  }

  private validateWeightRangeFields(
    mode: SharedProductPricingMode,
    fields: {
      minWeightGrams?: number;
      maxWeightGrams?: number;
      weightStepGrams?: number;
      pricePerGramRial?: number;
    },
  ): void {
    if (mode !== SharedProductPricingMode.WEIGHT_RANGE) {
      return;
    }

    const {
      minWeightGrams,
      maxWeightGrams,
      weightStepGrams,
      pricePerGramRial,
    } = fields;

    if (
      minWeightGrams === undefined ||
      maxWeightGrams === undefined ||
      pricePerGramRial === undefined
    ) {
      throw new BadRequestException(
        'برای محصول بازه‌وزنی، حداقل وزن، حداکثر وزن و قیمت هر گرم الزامی است',
      );
    }

    if (
      !Number.isFinite(minWeightGrams) ||
      !Number.isFinite(maxWeightGrams) ||
      !Number.isFinite(pricePerGramRial)
    ) {
      throw new BadRequestException(
        'مقادیر وزن و قیمت هر گرم باید عدد معتبر باشند',
      );
    }

    if (minWeightGrams <= 0 || maxWeightGrams <= 0) {
      throw new BadRequestException(
        'حداقل و حداکثر وزن باید بزرگتر از صفر باشند',
      );
    }

    if (minWeightGrams >= maxWeightGrams) {
      throw new BadRequestException('حداقل وزن باید کمتر از حداکثر وزن باشد');
    }

    if (pricePerGramRial <= 0) {
      throw new BadRequestException('قیمت هر گرم باید بزرگتر از صفر باشد');
    }

    if (
      weightStepGrams !== undefined &&
      (!Number.isFinite(weightStepGrams) || weightStepGrams <= 0)
    ) {
      throw new BadRequestException(
        'گام وزن باید یک عدد معتبر و بزرگتر از صفر باشد',
      );
    }

    if (
      weightStepGrams !== undefined &&
      weightStepGrams > maxWeightGrams - minWeightGrams
    ) {
      throw new BadRequestException(
        'گام وزن نمی‌تواند از فاصله حداقل تا حداکثر وزن بیشتر باشد',
      );
    }
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  private toSharedPricingMode(
    value: PrismaProductPricingMode,
  ): SharedProductPricingMode {
    const pricingMode = String(value);

    if (pricingMode === 'FIXED') {
      return SharedProductPricingMode.FIXED;
    }

    if (pricingMode === 'WEIGHT_RANGE') {
      return SharedProductPricingMode.WEIGHT_RANGE;
    }

    throw new BadRequestException('نوع قیمت‌گذاری محصول نامعتبر است');
  }

  private toPrismaPricingMode(
    value: SharedProductPricingMode,
  ): PrismaProductPricingMode {
    if (value === SharedProductPricingMode.FIXED) {
      return PrismaProductPricingMode.FIXED;
    }

    if (value === SharedProductPricingMode.WEIGHT_RANGE) {
      return PrismaProductPricingMode.WEIGHT_RANGE;
    }

    throw new BadRequestException('نوع قیمت‌گذاری محصول نامعتبر است');
  }

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

    if (!slug) {
      slug = `item-${Date.now().toString(36)}`;
    }

    let candidate = slug;
    let counter = 1;

    while (true) {
      const exists =
        model === 'product'
          ? await this.prisma.product.findUnique({
              where: { slug: candidate },
            })
          : await this.prisma.productCategory.findUnique({
              where: { slug: candidate },
            });

      if (!exists) {
        return candidate;
      }

      counter += 1;
      candidate = `${slug}-${counter}`;
    }
  }

  private toProductDto(p: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    basePriceRial: string | number | { toString(): string };
    status: string;
    pricingMode: string;
    minWeightGrams: string | number | { toString(): string } | null;
    maxWeightGrams: string | number | { toString(): string } | null;
    weightStepGrams: string | number | { toString(): string } | null;
    pricePerGramRial: string | number | { toString(): string } | null;
    variants: {
      id: string;
      weightGrams: string | number | { toString(): string };
      priceAdjustment: string | number | { toString(): string };
      stockQuantity: number;
      sku: string | null;
    }[];
    images?: {
      id: string;
      url: string;
      altText: string | null;
      isPrimary: boolean;
      sortOrder: number;
    }[];
    category?: unknown;
  }) {
    const baseRial = Number(p.basePriceRial);
    const isWeightRange = p.pricingMode === 'WEIGHT_RANGE';

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      basePriceToman: (baseRial / 10).toString(),
      status: p.status,
      pricingMode: p.pricingMode,
      category: p.category,
      images: (p.images ?? []).map((img) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        isPrimary: img.isPrimary,
      })),
      primaryImageUrl:
        (p.images ?? []).find((i) => i.isPrimary)?.url ??
        p.images?.[0]?.url ??
        null,
      weightRange: isWeightRange
        ? {
            minWeightGrams: Number(p.minWeightGrams).toString(),
            maxWeightGrams: Number(p.maxWeightGrams).toString(),
            stepGrams: Number(p.weightStepGrams ?? 0.1).toString(),
            pricePerGramToman: (Number(p.pricePerGramRial) / 10).toString(),
          }
        : null,
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

  async deleteVariant(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { _count: { select: { shopOrderItems: true } } },
    });
    if (!variant) throw new NotFoundException('تنوع محصول یافت نشد');

    if (variant._count.shopOrderItems > 0) {
      throw new BadRequestException(
        'این تنوع در سفارش‌های قبلی استفاده شده و قابل حذف نیست. به‌جای حذف، موجودی را صفر کنید',
      );
    }

    await this.prisma.productVariant.delete({ where: { id } });
    return { message: 'تنوع محصول حذف شد' };
  }

  async adminListProducts(query: GetProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          variants: true,
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
        },
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
}
