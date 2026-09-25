// api/src/cart/cart.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AddCartItemDto, UpdateCartItemDto } from '@arkan-gold/shared';
import {
  Prisma,
  ProductPricingMode as PrismaProductPricingMode,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import {
  PackagingService,
  ResolvedPackaging,
} from '../packaging/packaging.service';
import { Decimal } from 'decimal.js';

type CartWithRelations = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        variant: { include: { product: true } };
        product: true;
      };
    };
  };
}>;

type WeightRangeProduct = {
  minWeightGrams: unknown;
  maxWeightGrams: unknown;
  weightStepGrams: unknown;
};

const WEIGHT_EPSILON = 0.0001;
const CART_LOCK_MINUTES = 15;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
    private readonly packaging: PackagingService,
  ) {}

  async getCart(userId: string) {
    await this.purgeExpiredItems(userId);
    const cart = await this.getOrCreateCart(userId);
    return this.toDto(cart);
  }

  /**
   * اعتبارسنجی بسته‌بندی انتخابی برای یک محصول. اگر محصول طرح بسته‌بندی دارد،
   * انتخاب اجباری است و در نبود انتخاب، گزینه پیش‌فرض محصول ثبت می‌شود.
   */
  private async resolvePackagingSelection(
    productId: string,
    packagingOptionId: string | undefined,
  ): Promise<string | null> {
    const options =
      (
        await this.packaging.resolveOptionsForProducts(this.prisma, [productId])
      ).get(productId) ?? [];

    if (packagingOptionId && !options.some((o) => o.id === packagingOptionId)) {
      throw new BadRequestException(
        'طرح بسته‌بندی انتخاب‌شده برای این محصول در دسترس نیست',
      );
    }
    return this.packaging.pick(options, packagingOptionId)?.id ?? null;
  }

  /** مجموع تعداد یک تنوع در سایر ردیف‌های سبد (ردیف‌هایی با بسته‌بندی متفاوت) */
  private async otherLinesQuantity(
    cartId: string,
    variantId: string,
    exceptItemId?: string,
  ): Promise<number> {
    const agg = await this.prisma.cartItem.aggregate({
      where: {
        cartId,
        variantId,
        ...(exceptItemId ? { id: { not: exceptItemId } } : {}),
      },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const hasVariant =
      dto.variantId !== undefined &&
      dto.variantId !== null &&
      dto.variantId !== '';
    const hasWeightRangeProduct =
      dto.productId !== undefined &&
      dto.productId !== null &&
      dto.productId !== '';

    if (hasVariant === hasWeightRangeProduct) {
      throw new BadRequestException(
        'باید دقیقاً یکی از variantId یا (productId + weightGrams) ارسال شود',
      );
    }

    const cart = await this.getOrCreateCart(userId);
    let cartItemId: string;

    if (hasVariant) {
      cartItemId = await this.addFixedVariantItem(cart.id, dto);
    } else {
      cartItemId = await this.addWeightRangeItem(cart.id, dto);
    }

    await this.lockPriceForItem(cartItemId);
    return this.getCart(userId);
  }

  private async addFixedVariantItem(
    cartId: string,
    dto: AddCartItemDto,
  ): Promise<string> {
    const variantId = dto.variantId;
    if (!variantId)
      throw new BadRequestException('شناسه تنوع محصول الزامی است');

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { include: { category: { select: { isActive: true } } } },
      },
    });
    if (
      !variant ||
      variant.product.status !== 'ACTIVE' ||
      !variant.product.category.isActive
    ) {
      throw new NotFoundException('محصول یافت نشد');
    }
    if (variant.stockQuantity <= 0) {
      throw new BadRequestException('این تنوع محصول ناموجود است');
    }

    const packagingOptionId = await this.resolvePackagingSelection(
      variant.productId,
      dto.packagingOptionId,
    );

    // یک تنوع با بسته‌بندی‌های متفاوت، ردیف‌های جدا در سبد است
    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId, variantId, packagingOptionId },
    });
    const newQuantity = (existing?.quantity ?? 0) + dto.quantity;
    const otherLines = await this.otherLinesQuantity(
      cartId,
      variantId,
      existing?.id,
    );

    if (otherLines + newQuantity > variant.stockQuantity) {
      throw new BadRequestException(
        `حداکثر ${variant.stockQuantity} عدد از این تنوع موجود است`,
      );
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity },
      });
      return existing.id;
    }

    const created = await this.prisma.cartItem.create({
      data: { cartId, variantId, quantity: dto.quantity, packagingOptionId },
    });
    return created.id;
  }

  private async addWeightRangeItem(
    cartId: string,
    dto: AddCartItemDto,
  ): Promise<string> {
    const productId = dto.productId;
    const weightGrams = dto.weightGrams;

    if (!productId) throw new BadRequestException('شناسه محصول الزامی است');
    if (weightGrams === undefined || weightGrams === null) {
      throw new BadRequestException('وزن انتخابی را مشخص کنید');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { isActive: true } } },
    });
    if (!product || product.status !== 'ACTIVE' || !product.category.isActive) {
      throw new NotFoundException('محصول یافت نشد');
    }
    if (!this.isWeightRangePricingMode(product.pricingMode)) {
      throw new BadRequestException('این محصول از نوع بازه‌وزنی نیست');
    }

    this.assertWeightInRange(product, weightGrams);

    const packagingOptionId = await this.resolvePackagingSelection(
      productId,
      dto.packagingOptionId,
    );

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        cartId,
        productId,
        selectedWeightGrams: weightGrams,
        packagingOptionId,
      },
    });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + dto.quantity },
      });
      return existing.id;
    }

    const created = await this.prisma.cartItem.create({
      data: {
        cartId,
        productId,
        selectedWeightGrams: weightGrams,
        quantity: dto.quantity,
        packagingOptionId,
      },
    });
    return created.id;
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      include: { variant: true, product: true },
    });
    if (!item) throw new NotFoundException('آیتم سبد یافت نشد');

    const itemProductId = item.variant?.productId ?? item.productId;
    const packagingOptionId =
      dto.packagingOptionId !== undefined && itemProductId
        ? await this.resolvePackagingSelection(
            itemProductId,
            dto.packagingOptionId,
          )
        : undefined;

    if (item.variantId) {
      if (!item.variant) throw new NotFoundException('تنوع محصول یافت نشد');
      const otherLines = await this.otherLinesQuantity(
        item.cartId,
        item.variantId,
        item.id,
      );
      if (otherLines + dto.quantity > item.variant.stockQuantity) {
        throw new BadRequestException(
          `حداکثر ${item.variant.stockQuantity} عدد از این تنوع موجود است`,
        );
      }
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity, packagingOptionId },
      });
      await this.lockPriceForItem(itemId);
      return this.getCart(userId);
    }

    if (!item.product) throw new NotFoundException('محصول یافت نشد');
    if (!this.isWeightRangePricingMode(item.product.pricingMode)) {
      throw new BadRequestException('این محصول از نوع بازه‌وزنی نیست');
    }

    const weightGrams =
      dto.weightGrams !== undefined && dto.weightGrams !== null
        ? dto.weightGrams
        : this.toNumber(item.selectedWeightGrams);

    this.assertWeightInRange(item.product, weightGrams);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
        selectedWeightGrams: weightGrams,
        packagingOptionId,
      },
    });
    await this.lockPriceForItem(itemId);
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
    });
    if (!item) throw new NotFoundException('آیتم سبد یافت نشد');

    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  // ─────────────────────────────────────────
  // قفل قیمت — فرمول را همین لحظه اجرا و ۱۵ دقیقه معتبر می‌کند
  // ─────────────────────────────────────────
  private async lockPriceForItem(cartItemId: string): Promise<void> {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: cartItemId },
    });
    if (!item) return;

    let productId = item.productId;
    let weight: number;

    if (item.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: item.variantId },
      });
      if (!variant) return;
      productId = variant.productId;
      weight = this.toNumber(variant.weightGrams);
    } else {
      if (!productId) return;
      weight = this.toNumber(item.selectedWeightGrams);
    }

    const lockedAt = new Date();
    const expiresAt = new Date(Date.now() + CART_LOCK_MINUTES * 60 * 1000);

    try {
      const result = await this.pricingEngine.calculateForProduct(
        productId,
        weight,
      );

      // جلوگیری از خطای Stringification و Unsafe Call با تعریف اینترفیس
      const rawFinalPrice = result.finalPriceRial as
        | { toString(): string }
        | null
        | undefined;
      let finalUnitPriceRial = new Decimal(
        rawFinalPrice != null ? rawFinalPrice.toString() : '0',
      );

      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (variant && variant.priceAdjustment != null) {
          const rawAdj = variant.priceAdjustment as { toString(): string };
          finalUnitPriceRial = finalUnitPriceRial.plus(
            new Decimal(rawAdj.toString()),
          );
        }
      }

      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          lockedUnitPriceRial: finalUnitPriceRial,
          lockedBreakdown: result.lines
            ? (result.lines as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          priceLockedAt: lockedAt,
          priceExpiresAt: expiresAt,
        },
      });
    } catch {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      const rawBasePrice = product?.basePriceRial as
        | { toString(): string }
        | null
        | undefined;
      let fallbackPrice = new Decimal(
        rawBasePrice != null ? rawBasePrice.toString() : '0',
      );

      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (variant && variant.priceAdjustment != null) {
          const rawAdj = variant.priceAdjustment as { toString(): string };
          fallbackPrice = fallbackPrice.plus(new Decimal(rawAdj.toString()));
        }
      }

      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          lockedUnitPriceRial: fallbackPrice,
          lockedBreakdown: Prisma.JsonNull,
          priceLockedAt: lockedAt,
          priceExpiresAt: expiresAt,
        },
      });
    }
  }

  private async purgeExpiredItems(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { cart: { userId }, priceExpiresAt: { lt: new Date() } },
    });
  }

  // پاکسازی سراسری برای سبدهایی که کاربر برنمی‌گردد صفحه را رفرش کند
  @Cron('*/1 * * * *', { name: 'expire-stale-cart-items' })
  async expireAllStaleCartItems(): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { priceExpiresAt: { lt: new Date() } },
    });
  }

  private async getOrCreateCart(userId: string): Promise<CartWithRelations> {
    const include = {
      items: {
        include: {
          variant: { include: { product: true } },
          product: true,
        },
      },
    } satisfies Prisma.CartInclude;

    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      include,
    });
    if (existing) return existing;

    return this.prisma.cart.create({ data: { userId }, include });
  }

  private assertWeightInRange(
    product: WeightRangeProduct,
    weightGrams: number,
  ): void {
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      throw new BadRequestException(
        'وزن انتخابی باید یک عدد معتبر و بزرگتر از صفر باشد',
      );
    }

    const min = this.toNumber(product.minWeightGrams);
    const max = this.toNumber(product.maxWeightGrams);
    const step =
      product.weightStepGrams === null || product.weightStepGrams === undefined
        ? 0.1
        : this.toNumber(product.weightStepGrams);

    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min <= 0 ||
      max <= 0 ||
      min >= max
    ) {
      throw new BadRequestException('بازه وزن محصول معتبر نیست');
    }
    if (
      weightGrams < min - WEIGHT_EPSILON ||
      weightGrams > max + WEIGHT_EPSILON
    ) {
      throw new BadRequestException(
        `وزن انتخابی باید بین ${min} تا ${max} گرم باشد`,
      );
    }
    if (!Number.isFinite(step) || step <= 0) {
      throw new BadRequestException('گام وزن محصول معتبر نیست');
    }

    const stepsFromMin = (weightGrams - min) / step;
    const nearestStep = Math.round(stepsFromMin);
    if (Math.abs(stepsFromMin - nearestStep) > WEIGHT_EPSILON) {
      throw new BadRequestException(`وزن انتخابی باید با گام ${step} گرم باشد`);
    }
  }

  private isWeightRangePricingMode(value: PrismaProductPricingMode): boolean {
    return String(value) === 'WEIGHT_RANGE';
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return Number.NaN;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : Number.NaN;
  }

  private async toDto(cart: CartWithRelations) {
    const now = Date.now();

    const items = cart.items.map((item) => {
      const unitPriceRial = item.lockedUnitPriceRial
        ? this.toNumber(item.lockedUnitPriceRial)
        : 0;
      const unitPriceToman = unitPriceRial / 10;
      const lineTotalToman = unitPriceToman * item.quantity;
      const expiresInSeconds = item.priceExpiresAt
        ? Math.max(0, Math.floor((item.priceExpiresAt.getTime() - now) / 1000))
        : 0;

      if (item.variantId && item.variant) {
        const product = item.variant.product;
        return {
          id: item.id,
          quantity: item.quantity,
          kind: 'FIXED' as const,
          variantId: item.variant.id,
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          weightGrams: this.toNumber(item.variant.weightGrams).toString(),
          unitPriceToman: unitPriceToman.toString(),
          lineTotalToman: lineTotalToman.toString(),
          priceBreakdown: item.lockedBreakdown,
          expiresInSeconds,
          stockQuantity: item.variant.stockQuantity,
          available:
            product.status === 'ACTIVE' &&
            item.variant.stockQuantity >= item.quantity,
        };
      }

      if (!item.product) {
        throw new NotFoundException(
          'محصول مربوط به یکی از آیتم‌های سبد یافت نشد',
        );
      }
      const product = item.product;
      return {
        id: item.id,
        quantity: item.quantity,
        kind: 'WEIGHT_RANGE' as const,
        variantId: null,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        weightGrams: this.toNumber(item.selectedWeightGrams).toString(),
        unitPriceToman: unitPriceToman.toString(),
        lineTotalToman: lineTotalToman.toString(),
        priceBreakdown: item.lockedBreakdown,
        expiresInSeconds,
        stockQuantity: null,
        available:
          product.status === 'ACTIVE' &&
          this.isWeightRangePricingMode(product.pricingMode),
      };
    });

    const itemsTotalToman = Math.round(
      items.reduce((sum, item) => sum + Number(item.lineTotalToman), 0),
    );

    // ── بسته‌بندی: همان منطقی که هنگام ثبت سفارش اجرا می‌شود ──
    const productIdOf = (item: CartWithRelations['items'][number]) =>
      item.variant?.productId ?? item.productId ?? '';
    const [optionsByProduct, globalThresholdRial] = await Promise.all([
      this.packaging.resolveOptionsForProducts(
        this.prisma,
        cart.items.map(productIdOf),
      ),
      this.packaging.getGlobalFreeThresholdRial(),
    ]);
    const itemsSubtotalRial = cart.items.reduce(
      (sum, item) =>
        sum + (this.toNumber(item.lockedUnitPriceRial) || 0) * item.quantity,
      0,
    );
    const packagingSummary = this.packaging.computeCharges(
      cart.items.map((item) => ({
        key: item.id,
        option: this.packaging.pick(
          optionsByProduct.get(productIdOf(item)),
          item.packagingOptionId,
        ),
        quantity: item.quantity,
      })),
      itemsSubtotalRial,
      globalThresholdRial,
    );
    const toToman = (rial: number) => (rial / 10).toString();
    const optionDto = (o: ResolvedPackaging) => ({
      id: o.id,
      name: o.name,
      imageUrl: o.imageUrl,
      priceToman: toToman(o.priceRial),
      perUnit: o.perUnit,
    });

    const itemsWithPackaging = items.map((item, idx) => {
      const source = cart.items[idx];
      const charge = packagingSummary.lines.get(item.id);
      return {
        ...item,
        packaging: charge
          ? {
              id: charge.option.id,
              name: charge.option.name,
              imageUrl: charge.option.imageUrl,
              unitPriceToman: toToman(charge.unitPriceRial),
              quantity: charge.packagingQuantity,
              listToman: toToman(charge.listRial),
              chargedToman: toToman(charge.chargedRial),
              free: charge.free,
            }
          : null,
        packagingOptions: (optionsByProduct.get(productIdOf(source)) ?? []).map(
          optionDto,
        ),
      };
    });

    const nextThreshold = packagingSummary.nextFreeThresholdRial;
    const packagingTotalToman = Math.round(packagingSummary.chargedRial / 10);

    return {
      id: cart.id,
      items: itemsWithPackaging,
      // جمع اقلام (بدون بسته‌بندی) — مبنای کد تخفیف و آستانه رایگان شدن بسته‌بندی
      itemsTotalToman,
      packagingTotalToman,
      packagingWaivedToman: Math.round(packagingSummary.waivedRial / 10),
      packagingFreeThresholdToman:
        nextThreshold != null ? toToman(nextThreshold) : null,
      packagingFreeRemainingToman:
        nextThreshold != null
          ? toToman(Math.max(0, nextThreshold - itemsSubtotalRial))
          : null,
      // مبلغ کل = اقلام + بسته‌بندی (پیش از کد تخفیف)
      totalToman: itemsTotalToman + packagingTotalToman,
    };
  }
}
