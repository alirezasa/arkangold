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
  ) {}

  async getCart(userId: string) {
    await this.purgeExpiredItems(userId);
    const cart = await this.getOrCreateCart(userId);
    return this.toDto(cart);
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
      include: { product: true },
    });
    if (!variant || variant.product.status !== 'ACTIVE') {
      throw new NotFoundException('محصول یافت نشد');
    }
    if (variant.stockQuantity <= 0) {
      throw new BadRequestException('این تنوع محصول ناموجود است');
    }

    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId, variantId },
    });
    const newQuantity = (existing?.quantity ?? 0) + dto.quantity;

    if (newQuantity > variant.stockQuantity) {
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
      data: { cartId, variantId, quantity: dto.quantity },
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
    });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('محصول یافت نشد');
    }
    if (!this.isWeightRangePricingMode(product.pricingMode)) {
      throw new BadRequestException('این محصول از نوع بازه‌وزنی نیست');
    }

    this.assertWeightInRange(product, weightGrams);

    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId, productId, selectedWeightGrams: weightGrams },
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

    if (item.variantId) {
      if (!item.variant) throw new NotFoundException('تنوع محصول یافت نشد');
      if (dto.quantity > item.variant.stockQuantity) {
        throw new BadRequestException(
          `حداکثر ${item.variant.stockQuantity} عدد از این تنوع موجود است`,
        );
      }
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity },
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
      data: { quantity: dto.quantity, selectedWeightGrams: weightGrams },
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

    try {
      const result = await this.pricingEngine.calculateForProduct(
        productId,
        weight,
      );

      // برای تنوع ثابت (FIXED)، priceAdjustment باید روی نتیجهٔ فرمول اعمال شود
      let finalUnitPriceRial = new Prisma.Decimal(result.finalPriceRial);
      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (variant) {
          finalUnitPriceRial = finalUnitPriceRial.plus(variant.priceAdjustment);
        }
      }

      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          lockedUnitPriceRial: finalUnitPriceRial,
          lockedBreakdown: result.lines as unknown as Prisma.InputJsonValue,
          priceLockedAt: new Date(),
          priceExpiresAt: new Date(Date.now() + CART_LOCK_MINUTES * 60 * 1000),
        },
      });
    } catch {
      // اگر محصول فرمول قیمتی ندارد (مثلاً تنوع ثابت بدون purity)، از basePriceRial استفاده کن
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });
      let fallbackPrice = new Prisma.Decimal(product?.basePriceRial ?? 0);
      if (item.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (variant)
          fallbackPrice = fallbackPrice.plus(variant.priceAdjustment);
      }
      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          lockedUnitPriceRial: fallbackPrice,
          lockedBreakdown: Prisma.JsonNull,
          priceLockedAt: new Date(),
          priceExpiresAt: new Date(Date.now() + CART_LOCK_MINUTES * 60 * 1000),
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

  private toDto(cart: CartWithRelations) {
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

    const totalToman = items.reduce(
      (sum, item) => sum + Number(item.lineTotalToman),
      0,
    );

    return {
      id: cart.id,
      items,
      totalToman: Math.round(totalToman),
    };
  }
}
