import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AddCartItemDto, UpdateCartItemDto } from '@arkan-gold/shared';

// تعریف دقیق تایپ سبد خرید به همراه Relationها
type CartWithRelations = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        variant: {
          include: {
            product: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    return this.toDto(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });
    if (!variant || variant.product.status !== 'ACTIVE') {
      throw new NotFoundException('محصول یافت نشد');
    }
    if (variant.stockQuantity <= 0) {
      throw new BadRequestException('این تنوع محصول ناموجود است');
    }

    const cart = await this.getOrCreateCart(userId);
    const existing = await this.prisma.cartItem.findUnique({
      where: {
        cartId_variantId: { cartId: cart.id, variantId: dto.variantId },
      },
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
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: dto.variantId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      include: { variant: true },
    });
    if (!item) throw new NotFoundException('آیتم سبد یافت نشد');

    if (dto.quantity > item.variant.stockQuantity) {
      throw new BadRequestException(
        `حداکثر ${item.variant.stockQuantity} عدد از این تنوع موجود است`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });
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

  // ══════════════════════════════════════════
  private async getOrCreateCart(userId: string): Promise<CartWithRelations> {
    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (existing) return existing;

    return this.prisma.cart.create({
      data: { userId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
      },
    });
  }

  private toDto(cart: CartWithRelations) {
    const items = cart.items.map((item) => {
      // استفاده از Number جاوااسکریپت به جای Prisma.Decimal برای رفع ارورهای ESLint
      const basePrice = Number(item.variant.product.basePriceRial || 0);
      const priceAdjustment = Number(item.variant.priceAdjustment || 0);
      const weightGrams = Number(item.variant.weightGrams || 0);

      // انجام محاسبات با عملگرهای استاندارد ریاضی
      const unitPriceRial = basePrice + priceAdjustment;
      const unitPriceToman = unitPriceRial / 10;
      const lineTotalToman = unitPriceToman * item.quantity;

      return {
        id: item.id,
        quantity: item.quantity,
        variantId: item.variant.id,
        productId: item.variant.product.id,
        productName: item.variant.product.name,
        productSlug: item.variant.product.slug,
        weightGrams: weightGrams.toString(),
        unitPriceToman: unitPriceToman.toString(),
        lineTotalToman: lineTotalToman.toString(),
        stockQuantity: item.variant.stockQuantity,
        available:
          item.variant.product.status === 'ACTIVE' &&
          item.variant.stockQuantity >= item.quantity,
      };
    });

    // محاسبه جمع کل با استفاده از reduce استاندارد
    const totalToman = items.reduce(
      (sum, it) => sum + Number(it.lineTotalToman),
      0,
    );

    // رند کردن مقدار برای نمایش/ارسال
    return {
      id: cart.id,
      items,
      totalToman: Math.round(totalToman),
    };
  }
}
