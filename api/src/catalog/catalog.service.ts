// api/src/catalog/catalog.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
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
  SetProductPricingDto,
} from '@arkan-gold/shared';
import { PRICING_COMPONENT_DEFAULTS } from './pricing-components.seed';
import { PricingEngineService } from './pricing-engine.service';

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private pricingEngine: PricingEngineService,
  ) {}

  async onModuleInit() {
    for (const item of PRICING_COMPONENT_DEFAULTS) {
      await this.prisma.pricingComponent.upsert({
        where: { key: item.key },
        create: item,
        update: { label: item.label },
      });
    }
  }

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

    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('دسته‌بندی والد یافت نشد');
    }
    return this.prisma.productCategory.update({ where: { id }, data: dto });
  }

  // ─────────────────────────────────────────
  // Draft محصول — به‌سبک وردپرس: ورود به «محصول جدید» بلافاصله رکورد می‌سازد
  // ─────────────────────────────────────────
  async createDraftProduct() {
    const slug = `draft-${Date.now().toString(36)}`;
    let category = await this.prisma.productCategory.findFirst();
    if (!category) {
      category = await this.prisma.productCategory.create({
        data: { name: 'دسته‌بندی موقت', slug: 'temp' },
      });
    }
    return this.prisma.product.create({
      data: {
        name: '',
        slug,
        basePriceRial: 0,
        status: 'INACTIVE',
        categoryId: category.id,
      },
    });
  }

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
        include: {
          variants: true,
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { pricingComponents: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      // ⬅️ توجه: toProductDto حالا async است چون برای محصولات طلادار
      // قیمت را زنده از PricingEngineService می‌گیرد
      data: await Promise.all(items.map((item) => this.toProductDto(item))),
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
        _count: { select: { pricingComponents: true } },
      },
    });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('محصول یافت نشد');
    }
    return this.toProductDto(product);
  }

  async getProductForAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        pricingComponents: {
          include: { component: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { pricingComponents: true } },
      },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    const baseDto = await this.toProductDto(product);
    return {
      ...baseDto,
      shortDescription: product.shortDescription,
      metaKeywords: product.metaKeywords,
      purityKarat: product.purityKarat,
      pricingComponents: product.pricingComponents.map((link) => ({
        componentKey: link.component.key,
        componentLabel: link.component.label,
        baseType: link.baseType,
        valueType: link.valueType,
        value: this.toDecimalString(link.value),
        sortOrder: link.sortOrder,
      })),
    };
  }

  async createProduct(dto: CreateProductDto) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');

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
        shortDescription: dto.shortDescription,
        basePriceRial: dto.basePriceRial,
        seoTitle: dto.seoTitle,
        seoDesc: dto.seoDesc,
        metaKeywords: dto.metaKeywords,
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
          ? { connect: { id: dto.categoryId } }
          : undefined,
      name: dto.name,
      description: dto.description,
      shortDescription: dto.shortDescription,
      basePriceRial: dto.basePriceRial,
      seoTitle: dto.seoTitle,
      seoDesc: dto.seoDesc,
      metaKeywords: dto.metaKeywords,
      status: dto.status,
      purityKarat: dto.purityKarat ?? undefined,
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

    // اگر محصول هنوز اسلاگ draft دارد و نام واقعی ست شد، اسلاگ را بازتولید کن
    if (product.slug.startsWith('draft-') && dto.name) {
      data.slug = await this.generateUniqueSlug(dto.name, 'product');
    }

    return this.prisma.product.update({
      where: { id },
      data,
      include: { variants: true },
    });
  }

  // ─────────────────────────────────────────
  // فرمول قیمت‌گذاری
  // ─────────────────────────────────────────
  async listPricingComponents() {
    return this.prisma.pricingComponent.findMany({
      where: { isActive: true },
      orderBy: { label: 'asc' },
    });
  }

  async createPricingComponent(dto: { key: string; label: string }) {
    const existing = await this.prisma.pricingComponent.findUnique({
      where: { key: dto.key },
    });
    if (existing) throw new ConflictException('این کلید قبلاً ثبت شده است');
    return this.prisma.pricingComponent.create({ data: dto });
  }

  async setProductPricing(productId: string, dto: SetProductPricingDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    const componentKeys = [
      ...new Set(dto.components.map((c) => c.componentKey)),
    ];
    const components = await this.prisma.pricingComponent.findMany({
      where: { key: { in: componentKeys } },
    });
    const componentMap = new Map<string, string>(
      components.map((c) => [String(c.key), String(c.id)]),
    );

    const pricingRows = dto.components.map((c) => {
      const componentId = componentMap.get(c.componentKey);
      if (!componentId) {
        throw new BadRequestException(
          `کامپوننت قیمت "${c.componentKey}" یافت نشد`,
        );
      }
      return {
        productId,
        componentId,
        baseType: c.baseType,
        valueType: c.valueType,
        value: c.value,
        sortOrder: c.sortOrder,
      };
    });

    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data: { purityKarat: dto.purityKarat ?? null },
      }),
      this.prisma.productPricingComponent.deleteMany({
        where: { productId },
      }),
      this.prisma.productPricingComponent.createMany({
        data: pricingRows,
      }),
    ]);

    return { message: 'فرمول قیمت‌گذاری ذخیره شد' };
  }

  // ─────────────────────────────────────────
  // تنوع محصول
  // ─────────────────────────────────────────
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
      data: { ...dto },
    });
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
          _count: { select: { pricingComponents: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: await Promise.all(items.map((p) => this.toProductDto(p))),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  // ─────────────────────────────────────────
  // helpers
  // ─────────────────────────────────────────
  private validateWeightRangeFields(
    mode: SharedProductPricingMode,
    fields: {
      minWeightGrams?: number;
      maxWeightGrams?: number;
      weightStepGrams?: number;
      pricePerGramRial?: number;
    },
  ): void {
    if (mode !== SharedProductPricingMode.WEIGHT_RANGE) return;

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
    if (value === null || value === undefined) return undefined;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  private toDecimalString(value: unknown): string {
    if (value === null || value === undefined) return '0';
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toString() : '0';
  }

  private toSharedPricingMode(
    value: PrismaProductPricingMode,
  ): SharedProductPricingMode {
    const pricingMode = String(value);
    if (pricingMode === 'FIXED') return SharedProductPricingMode.FIXED;
    if (pricingMode === 'WEIGHT_RANGE')
      return SharedProductPricingMode.WEIGHT_RANGE;
    throw new BadRequestException('نوع قیمت‌گذاری محصول نامعتبر است');
  }

  private toPrismaPricingMode(
    value: SharedProductPricingMode,
  ): PrismaProductPricingMode {
    if (value === SharedProductPricingMode.FIXED)
      return PrismaProductPricingMode.FIXED;
    if (value === SharedProductPricingMode.WEIGHT_RANGE)
      return PrismaProductPricingMode.WEIGHT_RANGE;
    throw new BadRequestException('نوع قیمت‌گذاری محصول نامعتبر است');
  }

  private async generateUniqueSlug(
    base: string,
    model: 'product' | 'productCategory',
  ): Promise<string> {
    let slug = (base || 'item')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) slug = `item-${Date.now().toString(36)}`;

    let candidate = slug;
    let counter = 1;
    while (true) {
      const exists =
        model === 'product'
          ? await this.prisma.product.findUnique({ where: { slug: candidate } })
          : await this.prisma.productCategory.findUnique({
              where: { slug: candidate },
            });
      if (!exists) return candidate;
      counter += 1;
      candidate = `${slug}-${counter}`;
    }
  }

  // ─────────────────────────────────────────
  // ساخت DTO خروجی محصول — نکته کلیدی: برای محصولاتی که عیار طلا
  // (purityKarat) دارند، قیمت نمایشی دیگر از basePriceRial/pricePerGramRial
  // استاتیک خوانده نمی‌شود؛ بلکه دقیقاً مثل زمان قفل قیمت در سبد خرید
  // (cart.service.ts → lockPriceForItem) از PricingEngineService با
  // قیمت لحظه‌ای طلا محاسبه می‌شود تا با قیمت واقعی سبد هم‌خوانی داشته باشد.
  // اگر قیمت لحظه‌ای طلا موقتاً در دسترس نبود، به مقدار استاتیک fallback
  // می‌شود تا صفحه خراب نشود (فقط آن لحظه ممکن است قیمت قدیمی نمایش داده شود).
  // ─────────────────────────────────────────
  private async toProductDto(p: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    basePriceRial: string | number | { toString(): string };
    status: string;
    pricingMode: string;
    purityKarat: string | null;
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
    const hasLiveGoldPricing = Boolean(p.purityKarat);

    // ── قیمت هر تنوع (حالت FIXED) ──
    const variantsDto = await Promise.all(
      p.variants.map(async (v) => {
        const weight = Number(v.weightGrams);
        const adjustment = Number(v.priceAdjustment);
        let finalPriceRial = baseRial + adjustment;

        if (hasLiveGoldPricing) {
          try {
            const live = await this.pricingEngine.calculateForProduct(
              p.id,
              weight,
            );
            finalPriceRial = Number(live.finalPriceRial) + adjustment;
          } catch {
            // fallback به قیمت استاتیک (مثلاً قیمت لحظه‌ای طلا در دسترس نبود)
          }
        }

        return {
          id: v.id,
          weightGrams: weight.toString(),
          priceAdjustmentToman: (adjustment / 10).toString(),
          finalPriceToman: (finalPriceRial / 10).toString(),
          stockQuantity: v.stockQuantity,
          inStock: v.stockQuantity > 0,
          sku: v.sku,
        };
      }),
    );

    // ── بازه قیمت (حالت WEIGHT_RANGE) ──
    let weightRangeDto: {
      minWeightGrams: string;
      maxWeightGrams: string;
      stepGrams: string;
      pricePerGramToman: string;
      minPriceToman: string;
      maxPriceToman: string;
    } | null = null;

    if (isWeightRange) {
      const minW = Number(p.minWeightGrams);
      const maxW = Number(p.maxWeightGrams);
      const staticPricePerGramRial = Number(p.pricePerGramRial ?? 0);

      let minPriceRial = minW * staticPricePerGramRial;
      let maxPriceRial = maxW * staticPricePerGramRial;
      let pricePerGramDisplayRial = staticPricePerGramRial;

      if (hasLiveGoldPricing) {
        try {
          const [minLive, maxLive] = await Promise.all([
            this.pricingEngine.calculateForProduct(p.id, minW),
            this.pricingEngine.calculateForProduct(p.id, maxW),
          ]);
          minPriceRial = Number(minLive.finalPriceRial);
          maxPriceRial = Number(maxLive.finalPriceRial);
          // میانگین قیمت هر گرم فقط برای نمایش؛ چون فرمول ممکن است شامل
          // مبالغ ثابت (FIXED_RIAL) هم باشد و رابطه دقیقاً خطی نباشد
          pricePerGramDisplayRial = minW > 0 ? minPriceRial / minW : 0;
        } catch {
          // fallback به قیمت استاتیک
        }
      }

      weightRangeDto = {
        minWeightGrams: minW.toString(),
        maxWeightGrams: maxW.toString(),
        stepGrams: Number(p.weightStepGrams ?? 0.1).toString(),
        pricePerGramToman: (pricePerGramDisplayRial / 10).toString(),
        minPriceToman: (minPriceRial / 10).toString(),
        maxPriceToman: (maxPriceRial / 10).toString(),
      };
    }

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
      weightRange: weightRangeDto,
      variants: variantsDto,
    };
  }
}
