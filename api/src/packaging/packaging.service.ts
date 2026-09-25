// api/src/packaging/packaging.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PackagingOption, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import type {
  CreatePackagingOptionDto,
  SetProductPackagingDto,
  UpdatePackagingOptionDto,
  UpdatePackagingSettingsDto,
} from './packaging.dto';

type Db = Prisma.TransactionClient | PrismaService;

export const PACKAGING_UPLOAD_DIR = './uploads/packaging';
export const PACKAGING_PUBLIC_PREFIX = '/uploads/packaging';
const FREE_THRESHOLD_CONFIG_KEY = 'shop.packaging.free_threshold_rial';

/** طرح بسته‌بندی قابل انتخاب برای یک محصول (فقط طرح‌های فعال) */
export interface ResolvedPackaging {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  imageUrl: string | null;
  priceRial: number;
  perUnit: boolean;
  freeEligible: boolean;
  /** آستانه اختصاصی طرح؛ null = آستانه عمومی */
  freeThresholdRial: number | null;
  isDefault: boolean;
}

export interface PackagingChargeInput {
  /** شناسه ردیف (مثلاً id آیتم سبد) برای برگرداندن نتیجه */
  key: string;
  option: ResolvedPackaging | null;
  quantity: number;
}

export interface PackagingCharge {
  option: ResolvedPackaging;
  /** تعداد بسته‌بندی: per-unit = تعداد کالا، در غیر این صورت ۱ */
  packagingQuantity: number;
  unitPriceRial: number;
  /** مبلغ پیش از رایگان شدن */
  listRial: number;
  /** مبلغ قابل دریافت از کاربر */
  chargedRial: number;
  free: boolean;
  /** آستانه مؤثر رایگان شدن این ردیف (null = هرگز رایگان نمی‌شود) */
  effectiveThresholdRial: number | null;
}

export interface PackagingSummary {
  lines: Map<string, PackagingCharge>;
  listRial: number;
  chargedRial: number;
  waivedRial: number;
  /**
   * نزدیک‌ترین آستانه‌ای که هنوز به آن نرسیده‌ایم و بسته‌بندی پولی را رایگان
   * می‌کند — برای پیام «با X تومان خرید بیشتر بسته‌بندی رایگان می‌شود»
   */
  nextFreeThresholdRial: number | null;
}

@Injectable()
export class PackagingService {
  private readonly logger = new Logger(PackagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // ── محاسبه (مشترک بین سبد خرید، ثبت سفارش و صفحه محصول) ──
  // ═══════════════════════════════════════════════════════════

  async getGlobalFreeThresholdRial(): Promise<number> {
    const value = await this.systemConfig.getNumber(
      FREE_THRESHOLD_CONFIG_KEY,
      0,
    );
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  /** آستانه مؤثر رایگان شدن یک طرح؛ null یعنی این طرح هرگز رایگان نمی‌شود */
  effectiveThreshold(
    option: Pick<ResolvedPackaging, 'freeEligible' | 'freeThresholdRial'>,
    globalThresholdRial: number,
  ): number | null {
    if (!option.freeEligible) return null;
    if (option.freeThresholdRial != null && option.freeThresholdRial > 0) {
      return option.freeThresholdRial;
    }
    return globalThresholdRial > 0 ? globalThresholdRial : null;
  }

  /** طرح‌های فعال اختصاص‌یافته به هر محصول، به ترتیب نمایش */
  async resolveOptionsForProducts(
    db: Db,
    productIds: string[],
  ): Promise<Map<string, ResolvedPackaging[]>> {
    const result = new Map<string, ResolvedPackaging[]>();
    const ids = [...new Set(productIds)];
    if (!ids.length) return result;

    const links = await db.productPackagingOption.findMany({
      where: { productId: { in: ids }, packagingOption: { isActive: true } },
      include: { packagingOption: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    for (const link of links) {
      const list = result.get(link.productId) ?? [];
      list.push(this.toResolved(link.packagingOption, link.isDefault));
      result.set(link.productId, list);
    }
    return result;
  }

  /**
   * بسته‌بندی مؤثر یک ردیف: اگر محصول طرحی ندارد → بدون بسته‌بندی؛
   * اگر انتخاب کاربر هنوز معتبر است همان؛ وگرنه گزینه پیش‌فرض محصول.
   * (انتخاب بسته‌بندی برای محصولات دارای طرح اجباری است)
   */
  pick(
    options: ResolvedPackaging[] | undefined,
    selectedId: string | null | undefined,
  ): ResolvedPackaging | null {
    if (!options?.length) return null;
    return (
      (selectedId ? options.find((o) => o.id === selectedId) : undefined) ??
      options.find((o) => o.isDefault) ??
      options[0]
    );
  }

  /**
   * محاسبه هزینه بسته‌بندی ردیف‌ها. رایگان شدن بر اساس جمع اقلام سفارش
   * (پیش از کد تخفیف) و آستانه مؤثر هر طرح تعیین می‌شود.
   */
  computeCharges(
    inputs: PackagingChargeInput[],
    itemsSubtotalRial: number,
    globalThresholdRial: number,
  ): PackagingSummary {
    const lines = new Map<string, PackagingCharge>();
    let listRial = 0;
    let chargedRial = 0;
    let nextFreeThresholdRial: number | null = null;

    for (const input of inputs) {
      if (!input.option) continue;
      const option = input.option;
      const packagingQuantity = option.perUnit
        ? Math.max(1, input.quantity)
        : 1;
      const lineList = option.priceRial * packagingQuantity;
      const threshold = this.effectiveThreshold(option, globalThresholdRial);
      const free =
        lineList > 0 && threshold != null && itemsSubtotalRial >= threshold;
      const lineCharged = free ? 0 : lineList;

      if (!free && lineList > 0 && threshold != null) {
        nextFreeThresholdRial =
          nextFreeThresholdRial == null
            ? threshold
            : Math.min(nextFreeThresholdRial, threshold);
      }

      listRial += lineList;
      chargedRial += lineCharged;
      lines.set(input.key, {
        option,
        packagingQuantity,
        unitPriceRial: option.priceRial,
        listRial: lineList,
        chargedRial: lineCharged,
        free,
        effectiveThresholdRial: threshold,
      });
    }

    return {
      lines,
      listRial,
      chargedRial,
      waivedRial: listRial - chargedRial,
      nextFreeThresholdRial,
    };
  }

  /** طرح‌های قابل انتخاب در صفحه محصول (DTO عمومی) */
  async listForProductPublic(productId: string) {
    const [map, globalThreshold] = await Promise.all([
      this.resolveOptionsForProducts(this.prisma, [productId]),
      this.getGlobalFreeThresholdRial(),
    ]);
    const options = map.get(productId) ?? [];
    const defaultId = this.pick(options, null)?.id ?? null;

    return options.map((o) => {
      const threshold = this.effectiveThreshold(o, globalThreshold);
      return {
        id: o.id,
        name: o.name,
        description: o.description,
        imageUrl: o.imageUrl,
        priceToman: this.toToman(o.priceRial),
        perUnit: o.perUnit,
        isDefault: o.id === defaultId,
        freeThresholdToman:
          threshold != null && o.priceRial > 0 ? this.toToman(threshold) : null,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ── مدیریت طرح‌ها (ادمین) ──
  // ═══════════════════════════════════════════════════════════

  async adminList() {
    const [options, globalThreshold, productsCount] = await Promise.all([
      this.prisma.packagingOption.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          _count: { select: { products: true, shopOrderItems: true } },
        },
      }),
      this.getGlobalFreeThresholdRial(),
      this.prisma.product.count(),
    ]);

    return {
      settings: {
        freeThresholdToman: this.toToman(globalThreshold),
      },
      productsCount,
      data: options.map((o) => ({
        ...this.toAdminDto(o),
        productsCount: o._count.products,
        ordersCount: o._count.shopOrderItems,
      })),
    };
  }

  async create(dto: CreatePackagingOptionDto) {
    this.assertTomanRound(dto.priceRial, 'قیمت بسته‌بندی');
    if (dto.freeThresholdRial != null) {
      this.assertTomanRound(dto.freeThresholdRial, 'آستانه رایگان شدن');
    }
    const code = await this.normalizeCode(dto.code);

    const created = await this.prisma.packagingOption.create({
      data: {
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        priceRial: dto.priceRial,
        perUnit: dto.perUnit ?? true,
        freeEligible: dto.freeEligible ?? true,
        freeThresholdRial: dto.freeThresholdRial ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? (await this.nextSortOrder()),
      },
    });
    return this.toAdminDto(created);
  }

  async update(id: string, dto: UpdatePackagingOptionDto) {
    await this.findOrThrow(id);
    if (dto.priceRial !== undefined) {
      this.assertTomanRound(dto.priceRial, 'قیمت بسته‌بندی');
    }
    if (dto.freeThresholdRial != null) {
      this.assertTomanRound(dto.freeThresholdRial, 'آستانه رایگان شدن');
    }

    const data: Prisma.PackagingOptionUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined)
      data.code = await this.normalizeCode(dto.code, id);
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.priceRial !== undefined) data.priceRial = dto.priceRial;
    if (dto.perUnit !== undefined) data.perUnit = dto.perUnit;
    if (dto.freeEligible !== undefined) data.freeEligible = dto.freeEligible;
    if (dto.freeThresholdRial !== undefined) {
      data.freeThresholdRial = dto.freeThresholdRial;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const updated = await this.prisma.packagingOption.update({
      where: { id },
      data,
    });
    return this.toAdminDto(updated);
  }

  /**
   * حذف فقط برای طرح‌هایی که در هیچ سفارشی استفاده نشده‌اند؛ طرح استفاده‌شده
   * باید غیرفعال شود تا سابقه سفارش‌ها و گزارش‌ها حفظ شود.
   */
  async remove(id: string) {
    const option = await this.prisma.packagingOption.findUnique({
      where: { id },
      include: { _count: { select: { shopOrderItems: true } } },
    });
    if (!option) throw new NotFoundException('طرح بسته‌بندی یافت نشد');

    if (option._count.shopOrderItems > 0) {
      throw new ConflictException(
        'این طرح در سفارش‌ها استفاده شده و قابل حذف نیست؛ به‌جای حذف آن را غیرفعال کنید',
      );
    }

    await this.prisma.packagingOption.delete({ where: { id } });
    await this.deleteImageFile(option.imageUrl);
    return { message: 'طرح بسته‌بندی حذف شد' };
  }

  async setImage(id: string, file: Express.Multer.File) {
    const option = await this.prisma.packagingOption.findUnique({
      where: { id },
    });
    if (!option) {
      await fs.unlink(file.path).catch(() => undefined);
      throw new NotFoundException('طرح بسته‌بندی یافت نشد');
    }

    const updated = await this.prisma.packagingOption.update({
      where: { id },
      data: { imageUrl: `${PACKAGING_PUBLIC_PREFIX}/${file.filename}` },
    });
    await this.deleteImageFile(option.imageUrl);
    return this.toAdminDto(updated);
  }

  async removeImage(id: string) {
    const option = await this.findOrThrow(id);
    const updated = await this.prisma.packagingOption.update({
      where: { id },
      data: { imageUrl: null },
    });
    await this.deleteImageFile(option.imageUrl);
    return this.toAdminDto(updated);
  }

  async updateSettings(dto: UpdatePackagingSettingsDto) {
    this.assertTomanRound(dto.freeThresholdRial, 'آستانه رایگان شدن');
    await this.systemConfig.set(
      FREE_THRESHOLD_CONFIG_KEY,
      String(Math.floor(dto.freeThresholdRial)),
    );
    return {
      freeThresholdToman: this.toToman(await this.getGlobalFreeThresholdRial()),
    };
  }

  /** اختصاص یک طرح به همه محصولات (بدون تغییر گزینه پیش‌فرض محصولات) */
  async assignToAllProducts(id: string) {
    await this.findOrThrow(id);
    const products = await this.prisma.product.findMany({
      select: { id: true },
    });
    const result = await this.prisma.productPackagingOption.createMany({
      data: products.map((p) => ({
        productId: p.id,
        packagingOptionId: id,
        sortOrder: 1000,
      })),
      skipDuplicates: true,
    });
    return {
      message: `طرح به ${result.count.toLocaleString('fa-IR')} محصول جدید اختصاص یافت`,
      assigned: result.count,
    };
  }

  // ── اختصاص طرح‌ها به یک محصول ──

  async getProductPackagingForAdmin(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        packagingOptions: {
          select: { packagingOptionId: true, isDefault: true, sortOrder: true },
        },
      },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    const options = await this.prisma.packagingOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const links = new Map(
      product.packagingOptions.map((l) => [l.packagingOptionId, l]),
    );

    return {
      productId,
      options: options.map((o) => ({
        ...this.toAdminDto(o),
        assigned: links.has(o.id),
        isDefault: links.get(o.id)?.isDefault ?? false,
        linkSortOrder: links.get(o.id)?.sortOrder ?? null,
      })),
    };
  }

  async setProductPackaging(productId: string, dto: SetProductPackagingDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    const ids = dto.options.map((o) => o.packagingOptionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('یک طرح بسته‌بندی دو بار انتخاب شده است');
    }
    if (dto.options.filter((o) => o.isDefault).length > 1) {
      throw new BadRequestException('فقط یک طرح می‌تواند پیش‌فرض باشد');
    }

    if (ids.length) {
      const found = await this.prisma.packagingOption.count({
        where: { id: { in: ids } },
      });
      if (found !== ids.length) {
        throw new BadRequestException('برخی طرح‌های بسته‌بندی یافت نشدند');
      }
    }

    // اگر پیش‌فرض مشخص نشده باشد، اولین طرح پیش‌فرض می‌شود
    const defaultId =
      dto.options.find((o) => o.isDefault)?.packagingOptionId ?? ids[0];

    await this.prisma.$transaction(async (tx) => {
      await tx.productPackagingOption.deleteMany({ where: { productId } });
      if (ids.length) {
        await tx.productPackagingOption.createMany({
          data: ids.map((packagingOptionId, idx) => ({
            productId,
            packagingOptionId,
            isDefault: packagingOptionId === defaultId,
            sortOrder: idx,
          })),
        });
      }
    });

    return this.getProductPackagingForAdmin(productId);
  }

  // ═══════════════════════════════════════════════════════════
  // ── کمکی‌ها ──
  // ═══════════════════════════════════════════════════════════

  private toResolved(
    o: PackagingOption,
    isDefault: boolean,
  ): ResolvedPackaging {
    return {
      id: o.id,
      name: o.name,
      code: o.code,
      description: o.description,
      imageUrl: o.imageUrl,
      priceRial: Number(o.priceRial),
      perUnit: o.perUnit,
      freeEligible: o.freeEligible,
      freeThresholdRial:
        o.freeThresholdRial != null ? Number(o.freeThresholdRial) : null,
      isDefault,
    };
  }

  private toAdminDto(o: PackagingOption) {
    return {
      id: o.id,
      name: o.name,
      code: o.code,
      description: o.description,
      imageUrl: o.imageUrl,
      priceToman: this.toToman(o.priceRial),
      perUnit: o.perUnit,
      freeEligible: o.freeEligible,
      freeThresholdToman:
        o.freeThresholdRial != null ? this.toToman(o.freeThresholdRial) : null,
      isActive: o.isActive,
      sortOrder: o.sortOrder,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }

  private async findOrThrow(id: string) {
    const option = await this.prisma.packagingOption.findUnique({
      where: { id },
    });
    if (!option) throw new NotFoundException('طرح بسته‌بندی یافت نشد');
    return option;
  }

  private async normalizeCode(
    raw: string | null | undefined,
    exceptId?: string,
  ): Promise<string | null> {
    const code = raw?.trim().toUpperCase() || null;
    if (!code) return null;
    const existing = await this.prisma.packagingOption.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('این کد بسته‌بندی قبلاً استفاده شده است');
    }
    return code;
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.packagingOption.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  /** مبالغ ریالی باید معادل تومان کامل باشند (مضرب ۱۰) */
  private assertTomanRound(valueRial: number, label: string) {
    if (valueRial % 10 !== 0) {
      throw new BadRequestException(`${label} باید به تومان کامل باشد`);
    }
  }

  private async deleteImageFile(url: string | null) {
    if (!url?.startsWith(`${PACKAGING_PUBLIC_PREFIX}/`)) return;
    const filePath = path.join(
      process.cwd(),
      'uploads',
      'packaging',
      path.basename(url),
    );
    await fs.unlink(filePath).catch((err: unknown) => {
      this.logger.warn(
        `[Packaging] حذف فایل تصویر ${filePath} ناموفق بود: ${
          err instanceof Error ? err.message : 'خطای نامشخص'
        }`,
      );
    });
  }

  private toToman(rial: unknown): string {
    return (Number(rial ?? 0) / 10).toString();
  }
}
