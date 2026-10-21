// api/src/shipping/shipping.service.ts
//
// مناطق، تعرفه‌ها و شرکت‌های حمل؛ برآورد گزینه‌های ارسال برای سبد خرید/مرسوله و تعیین
// قطعی هزینه‌ی ارسال هنگام ثبت سفارش (هرگز به مبلغ ارسالی کلاینت اعتماد نمی‌شود).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  ShippingMethodType,
  ShippingRate,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  CalcMethod,
  CalcRate,
  CalcZone,
  ShippingCharge,
  ShippingOption,
  quoteShippingOptions,
  resolveShippingCharge,
} from './shipping-calculator';
import {
  IRAN_PROVINCES,
  getProvince,
  isProvinceCode,
  resolveProvinceCode,
} from './iran-provinces';
import {
  ShippingCarrierDto,
  ShippingRateDto,
  ShippingSimulateDto,
  ShippingZoneDto,
} from './shipping.dto';

/** نشانی تحویل ذخیره‌شده روی سفارش (ویرایش/حذف بعدی آدرس آن را تغییر نمی‌دهد) */
export interface AddressSnapshot {
  id: string;
  title: string | null;
  province: string | null;
  provinceCode: string | null;
  city: string | null;
  postalCode: string | null;
  fullAddress: string;
  plaque: string | null;
  unit: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
}

type AddressLike = {
  id: string;
  title?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  city?: string | null;
  postalCode?: string | null;
  fullAddress: string;
  plaque?: string | null;
  unit?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
};

export type UserShippingOption = ReturnType<ShippingService['toUserOption']>;

export interface ShippingSelection {
  methodId: string;
  methodName: string;
  methodType: ShippingMethodType;
  carrierName: string | null;
  zoneName: string;
  charge: ShippingCharge;
  weightGrams: number;
  etaMinDays: number | null;
  etaMaxDays: number | null;
}

const toNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const toNumOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : toNum(v);
const toToman = (rial: number) => String(Math.round(rial) / 10);

// ═══════════════════════ داده‌های پیش‌فرض (دفتر مرکزی: تهران) ═══════════════════════
// تعرفه‌ها نمونه‌اند و باید از پنل «مناطق و تعرفه‌های ارسال» با نرخ روز به‌روز شوند.

const DEFAULT_CARRIERS = [
  {
    code: 'IRAN_POST',
    name: 'شرکت ملی پست جمهوری اسلامی ایران',
    website: 'https://post.ir',
    trackingUrlTemplate: 'https://tracking.post.ir/?id={code}',
    sortOrder: 1,
  },
  {
    code: 'TIPAX',
    name: 'تیپاکس',
    website: 'https://tipaxco.com',
    sortOrder: 2,
  },
  {
    code: 'CHAPAR',
    name: 'چاپار',
    website: 'https://chaparnet.com',
    isActive: false,
    sortOrder: 3,
  },
  {
    code: 'IN_HOUSE',
    name: 'پیک اختصاصی آرکان گلد',
    sortOrder: 4,
  },
];

/** کد روش → کد شرکت حمل و تنظیمات تکمیلی */
const DEFAULT_METHOD_LINKS: {
  code: string;
  carrier: string | null;
  requiresPostalCode: boolean;
  create?: {
    name: string;
    type: ShippingMethodType;
    description?: string;
    requiresTrackingCode: boolean;
    estimatedDays?: number;
    sortOrder: number;
  };
}[] = [
  {
    code: 'COURIER',
    carrier: 'IN_HOUSE',
    requiresPostalCode: false,
    create: {
      name: 'پیک اختصاصی',
      type: 'COURIER',
      description: 'ارسال درون‌شهری با پیک؛ تحویل با کد تحویل مشتری',
      requiresTrackingCode: false,
      estimatedDays: 1,
      sortOrder: 1,
    },
  },
  {
    code: 'POST_SEFARESHI',
    carrier: 'IRAN_POST',
    requiresPostalCode: true,
    create: {
      name: 'پست سفارشی (عادی)',
      type: 'POST',
      description: 'ارسال اقتصادی با پست سفارشی و کد رهگیری',
      requiresTrackingCode: true,
      estimatedDays: 5,
      sortOrder: 2,
    },
  },
  {
    code: 'POST_PISHTAZ',
    carrier: 'IRAN_POST',
    requiresPostalCode: true,
    create: {
      name: 'پست پیشتاز',
      type: 'POST',
      description: 'ارسال سریع و بیمه‌شده با پست پیشتاز',
      requiresTrackingCode: true,
      estimatedDays: 3,
      sortOrder: 3,
    },
  },
  {
    code: 'EXPRESS',
    carrier: 'TIPAX',
    requiresPostalCode: false,
    create: {
      name: 'پست خصوصی (تیپاکس)',
      type: 'EXPRESS',
      requiresTrackingCode: true,
      estimatedDays: 2,
      sortOrder: 4,
    },
  },
  {
    code: 'PICKUP',
    carrier: null,
    requiresPostalCode: false,
    create: {
      name: 'تحویل حضوری در دفتر',
      type: 'PICKUP',
      description: 'مراجعه به دفتر با کارت ملی و کد تحویل',
      requiresTrackingCode: false,
      sortOrder: 5,
    },
  },
];

const TEHRAN_NEIGHBORS = ['ALBORZ', 'QOM', 'MARKAZI', 'SEMNAN', 'MAZANDARAN'];

const DEFAULT_ZONES = [
  {
    key: 'TEHRAN_CITY',
    name: 'شهر تهران',
    description: 'محدوده‌ی شهر تهران (ارسال با پیک اختصاصی)',
    provinceCodes: ['TEHRAN'],
    cities: ['تهران'],
    sortOrder: 1,
  },
  {
    key: 'TEHRAN_PROVINCE',
    name: 'استان تهران',
    description: 'سایر شهرهای استان تهران (درون‌استانی)',
    provinceCodes: ['TEHRAN'],
    cities: [],
    sortOrder: 2,
  },
  {
    key: 'NEIGHBORS',
    name: 'استان‌های همجوار',
    description: 'البرز، قم، مرکزی، سمنان و مازندران',
    provinceCodes: TEHRAN_NEIGHBORS,
    cities: [],
    sortOrder: 3,
  },
  {
    key: 'REST',
    name: 'سایر استان‌ها',
    description: 'همه‌ی نقاط کشور که در منطقه‌ی دقیق‌تری نیستند',
    provinceCodes: [],
    cities: [],
    sortOrder: 9,
  },
];

type SeedRate = Partial<Omit<CalcRate, 'id' | 'methodId' | 'zoneId'>>;
const post = (base: number, step: number, eta: [number, number]): SeedRate => ({
  baseRial: base,
  baseWeightGrams: 1000,
  stepRial: step,
  stepWeightGrams: 1000,
  etaMinDays: eta[0],
  etaMaxDays: eta[1],
});
const DEFAULT_RATES: Record<string, Record<string, SeedRate>> = {
  COURIER: {
    TEHRAN_CITY: {
      baseRial: 1_500_000,
      stepRial: 0,
      etaMinDays: 0,
      etaMaxDays: 1,
    },
  },
  POST_SEFARESHI: {
    TEHRAN_PROVINCE: post(450_000, 150_000, [2, 4]),
    NEIGHBORS: post(550_000, 200_000, [3, 5]),
    REST: post(650_000, 250_000, [4, 7]),
  },
  POST_PISHTAZ: {
    TEHRAN_PROVINCE: post(700_000, 200_000, [1, 2]),
    NEIGHBORS: post(850_000, 250_000, [1, 3]),
    REST: post(1_000_000, 300_000, [2, 4]),
  },
  EXPRESS: {
    TEHRAN_PROVINCE: post(1_000_000, 300_000, [1, 2]),
    REST: {
      ...post(1_400_000, 400_000, [1, 3]),
      feePayment: 'CUSTOMER_CHOICE',
    },
  },
  PICKUP: {
    REST: { baseRial: 0, stepRial: 0 },
  },
};

@Injectable()
export class ShippingService implements OnModuleInit {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefaults();
    } catch (err) {
      this.logger.error(
        `[Shipping] ساخت مناطق و تعرفه‌های پیش‌فرض ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  /** فقط یک‌بار (وقتی هیچ منطقه‌ای وجود ندارد): شرکت‌های حمل، روش‌ها، مناطق و تعرفه‌های نمونه */
  private async seedDefaults() {
    if ((await this.prisma.shippingZone.count()) > 0) return;

    const carrierIds = new Map<string, string>();
    for (const c of DEFAULT_CARRIERS) {
      const row = await this.prisma.shippingCarrier.upsert({
        where: { code: c.code },
        create: c,
        update: {},
      });
      carrierIds.set(c.code, row.id);
    }

    const methodIds = new Map<string, string>();
    for (const m of DEFAULT_METHOD_LINKS) {
      let row = await this.prisma.shippingMethod.findUnique({
        where: { code: m.code },
      });
      if (!row && m.create) {
        row = await this.prisma.shippingMethod.create({
          data: {
            code: m.code,
            ...m.create,
            requiresDeliveryCode: true,
            courierLinkEnabled: m.create.type === 'COURIER',
          },
        });
      }
      if (!row) continue;
      await this.prisma.shippingMethod.update({
        where: { id: row.id },
        data: {
          requiresPostalCode: m.requiresPostalCode,
          ...(row.carrierId || !m.carrier
            ? {}
            : { carrierId: carrierIds.get(m.carrier) }),
        },
      });
      methodIds.set(m.code, row.id);
    }

    const zoneIds = new Map<string, string>();
    for (const { key, ...z } of DEFAULT_ZONES) {
      const row = await this.prisma.shippingZone.create({ data: z });
      zoneIds.set(key, row.id);
    }

    let rateCount = 0;
    for (const [methodCode, byZone] of Object.entries(DEFAULT_RATES)) {
      const methodId = methodIds.get(methodCode);
      if (!methodId) continue;
      for (const [zoneKey, r] of Object.entries(byZone)) {
        const zoneId = zoneIds.get(zoneKey);
        if (!zoneId) continue;
        await this.prisma.shippingRate.create({
          data: { ...r, methodId, zoneId },
        });
        rateCount++;
      }
    }
    this.logger.log(
      `[Shipping] ${DEFAULT_ZONES.length} منطقه و ${rateCount} تعرفه‌ی نمونه ساخته شد`,
    );
  }

  // ═══════════════════════ تنظیمات ═══════════════════════

  async isEnabled() {
    return this.systemConfig.getBoolean('shop.shipping.enabled', true);
  }

  private async settings() {
    const [tareGrams, roundUpRial] = await Promise.all([
      this.systemConfig.getNumber('shop.shipping.parcel_tare_grams', 300),
      this.systemConfig.getNumber('shop.shipping.round_up_rial', 10_000),
    ]);
    return {
      tareGrams: Math.max(0, tareGrams),
      roundUpRial: Math.max(0, roundUpRial),
    };
  }

  provinces() {
    return IRAN_PROVINCES;
  }

  // ═══════════════════════ برآورد ═══════════════════════

  /** داده‌ی فعال برای محاسبه: روش‌های فعالِ قابل انتخاب مشتری، مناطق فعال و همه‌ی تعرفه‌هایشان */
  private async loadCalcData() {
    const [methods, zones, rates] = await Promise.all([
      this.prisma.shippingMethod.findMany({
        where: { isActive: true, availableAtCheckout: true },
        include: { carrier: { select: { name: true, isActive: true } } },
      }),
      this.prisma.shippingZone.findMany({ where: { isActive: true } }),
      this.prisma.shippingRate.findMany(),
    ]);
    const calcMethods: CalcMethod[] = methods
      // روش متعلق به شرکت حمل غیرفعال، به مشتری عرضه نمی‌شود
      .filter((m) => !m.carrier || m.carrier.isActive)
      .map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        type: m.type,
        description: m.description,
        carrierName: m.carrier?.name ?? null,
        sortOrder: m.sortOrder,
        requiresPostalCode: m.requiresPostalCode,
        estimatedDays: m.estimatedDays,
        pickupAddress: m.pickupAddress,
        pickupHours: m.pickupHours,
      }));
    const calcZones: CalcZone[] = zones.map((z) => ({
      id: z.id,
      name: z.name,
      provinceCodes: z.provinceCodes,
      cities: z.cities,
      sortOrder: z.sortOrder,
    }));
    return {
      methods: calcMethods,
      zones: calcZones,
      rates: rates.map((r) => this.toCalcRate(r)),
    };
  }

  private toCalcRate(r: ShippingRate): CalcRate {
    return {
      id: r.id,
      methodId: r.methodId,
      zoneId: r.zoneId,
      baseRial: toNum(r.baseRial),
      baseWeightGrams: r.baseWeightGrams,
      stepRial: toNum(r.stepRial),
      stepWeightGrams: r.stepWeightGrams,
      valuePercent: toNum(r.valuePercent),
      minRial: toNumOrNull(r.minRial),
      maxRial: toNumOrNull(r.maxRial),
      freeAboveRial: toNumOrNull(r.freeAboveRial),
      maxWeightGrams: r.maxWeightGrams,
      maxOrderRial: toNumOrNull(r.maxOrderRial),
      feePayment: r.feePayment,
      etaMinDays: r.etaMinDays,
      etaMaxDays: r.etaMaxDays,
      isActive: r.isActive,
    };
  }

  /** گزینه‌های ارسال یک مرسوله به یک آدرس (وزن خالص اقلام؛ وزن بسته‌بندی از تنظیمات افزوده می‌شود) */
  async quoteForAddress(
    address: AddressLike,
    parcel: { itemsWeightGrams: number; valueRial: number },
  ) {
    const [{ tareGrams, roundUpRial }, data] = await Promise.all([
      this.settings(),
      this.loadCalcData(),
    ]);
    const weightGrams =
      Math.round((Math.max(0, parcel.itemsWeightGrams) + tareGrams) * 100) /
      100;
    const options = quoteShippingOptions({
      destination: {
        provinceCode: resolveProvinceCode(address),
        city: address.city ?? null,
        postalCode: address.postalCode ?? null,
      },
      parcel: { weightGrams, valueRial: parcel.valueRial },
      ...data,
      roundUpRial,
    });
    return { weightGrams, options };
  }

  /** وزن و ارزش سبد خرید کاربر (ارزش = قیمت‌های قفل‌شده، پیش از کد تخفیف) */
  async cartParcel(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: { include: { variant: { select: { weightGrams: true } } } },
      },
    });
    return this.parcelOf(cart?.items ?? []);
  }

  parcelOf(
    items: {
      quantity: number;
      lockedUnitPriceRial?: unknown;
      selectedWeightGrams?: unknown;
      variant?: { weightGrams: unknown } | null;
    }[],
  ) {
    let itemsWeightGrams = 0;
    let valueRial = 0;
    for (const it of items) {
      const unitWeight = toNum(
        it.variant?.weightGrams ?? it.selectedWeightGrams,
      );
      itemsWeightGrams += unitWeight * it.quantity;
      valueRial += toNum(it.lockedUnitPriceRial) * it.quantity;
    }
    return { itemsWeightGrams, valueRial, itemCount: items.length };
  }

  /** نمای گزینه برای اپ کاربر (تومان) */
  toUserOption(o: ShippingOption) {
    const prepaid = resolveShippingCharge(o, false);
    return {
      methodId: o.methodId,
      code: o.code,
      name: o.name,
      type: o.type,
      description: o.description,
      carrierName: o.carrierName,
      zoneName: o.zoneName,
      available: o.available,
      unavailableReason: o.unavailableReason,
      feeToman: toToman(o.feeRial),
      free: o.free,
      freeAboveToman: o.freeAboveRial != null ? toToman(o.freeAboveRial) : null,
      feePayment: o.feePayment,
      /** مبلغی که در صورت پیش‌پرداخت به سفارش افزوده می‌شود */
      prepaidChargeToman: toToman(
        o.feePayment === 'ON_DELIVERY' ? 0 : prepaid.shippingRial,
      ),
      etaMinDays: o.etaMinDays,
      etaMaxDays: o.etaMaxDays,
      pickupAddress: o.pickupAddress,
      pickupHours: o.pickupHours,
    };
  }

  /** گزینه‌های ارسال سبد خرید فعلی کاربر برای یک آدرس */
  async optionsForCart(userId: string, addressId: string) {
    const address = await this.getUserAddress(userId, addressId);
    const enabled = await this.isEnabled();
    if (!enabled) {
      return {
        enabled,
        addressId,
        provinceResolved: true,
        weightGrams: 0,
        options: [] as UserShippingOption[],
      };
    }
    const parcel = await this.cartParcel(userId);
    const { weightGrams, options } = await this.quoteForAddress(
      address,
      parcel,
    );
    return {
      enabled,
      addressId,
      provinceResolved: resolveProvinceCode(address) !== null,
      weightGrams,
      options: options.map((o) => this.toUserOption(o)),
    };
  }

  async getUserAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
    });
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    return address;
  }

  /**
   * تعیین قطعی روش و هزینه‌ی ارسال هنگام ثبت سفارش. null = ارسال در مرحله‌ی سفارش غیرفعال است
   * (روش ارسال مثل گذشته هنگام «ثبت ارسال» توسط پنل انتخاب و هزینه‌ای از مشتری گرفته نمی‌شود).
   */
  async resolveForCheckout(params: {
    address: AddressLike;
    itemsWeightGrams: number;
    valueRial: number;
    methodId?: string | null;
    feePayment?: 'PREPAID' | 'ON_DELIVERY' | null;
  }): Promise<ShippingSelection | null> {
    if (!(await this.isEnabled())) return null;
    const { weightGrams, options } = await this.quoteForAddress(
      params.address,
      {
        itemsWeightGrams: params.itemsWeightGrams,
        valueRial: params.valueRial,
      },
    );
    if (!params.methodId) {
      throw new BadRequestException(
        options.some((o) => o.available)
          ? 'روش ارسال سفارش را انتخاب کنید'
          : 'برای این آدرس روش ارسالی تعریف نشده است؛ آدرس دیگری انتخاب کنید یا با پشتیبانی تماس بگیرید',
      );
    }
    const option = options.find((o) => o.methodId === params.methodId);
    if (!option) {
      throw new BadRequestException(
        'روش ارسال انتخاب‌شده برای این آدرس در دسترس نیست؛ لطفاً دوباره انتخاب کنید',
      );
    }
    if (!option.available) {
      throw new BadRequestException(
        option.unavailableReason ?? 'این روش ارسال در دسترس نیست',
      );
    }
    if (
      params.feePayment === 'ON_DELIVERY' &&
      option.feePayment === 'PREPAID' &&
      !option.free &&
      option.feeRial > 0
    ) {
      throw new BadRequestException(
        'پرداخت هزینه ارسال هنگام تحویل (پس‌کرایه) برای این روش فعال نیست',
      );
    }
    const method = await this.prisma.shippingMethod.findUnique({
      where: { id: option.methodId },
      select: { type: true },
    });
    return {
      methodId: option.methodId,
      methodName: option.name,
      methodType: method?.type ?? option.type,
      carrierName: option.carrierName,
      zoneName: option.zoneName,
      charge: resolveShippingCharge(
        option,
        params.feePayment === 'ON_DELIVERY',
      ),
      weightGrams,
      etaMinDays: option.etaMinDays,
      etaMaxDays: option.etaMaxDays,
    };
  }

  /** فیلدهای سفارش برای ذخیره‌ی انتخاب ارسال و snapshot آدرس */
  orderShippingData(
    address: AddressLike,
    selection: ShippingSelection | null,
  ): Partial<Prisma.ShopOrderUncheckedCreateInput> {
    return {
      shippingAddress: this.addressSnapshot(
        address,
      ) as unknown as Prisma.InputJsonValue,
      ...(selection
        ? {
            shippingMethodId: selection.methodId,
            shippingMethodName: selection.methodName,
            shippingMethodType: selection.methodType,
            shippingCarrierName: selection.carrierName,
            shippingZoneName: selection.zoneName,
            shippingRial: selection.charge.shippingRial,
            shippingWaivedRial: selection.charge.waivedRial,
            shippingPayOnDelivery: selection.charge.payOnDelivery,
            shippingEstimateRial: selection.charge.estimateRial,
            shipmentWeightGrams: selection.weightGrams,
            shippingEtaMinDays: selection.etaMinDays,
            shippingEtaMaxDays: selection.etaMaxDays,
          }
        : {}),
    };
  }

  addressSnapshot(a: AddressLike): AddressSnapshot {
    const code = resolveProvinceCode(a);
    return {
      id: a.id,
      title: a.title ?? null,
      province: getProvince(code)?.name ?? a.province ?? null,
      provinceCode: code,
      city: a.city ?? null,
      postalCode: a.postalCode ?? null,
      fullAddress: a.fullAddress,
      plaque: a.plaque ?? null,
      unit: a.unit ?? null,
      receiverName: a.receiverName ?? null,
      receiverPhone: a.receiverPhone ?? null,
    };
  }

  // ═══════════════════════ پنل: شرکت‌های حمل ═══════════════════════

  async listCarriers() {
    const rows = await this.prisma.shippingCarrier.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { methods: true } } },
    });
    return rows.map(({ _count, ...c }) => ({
      ...c,
      methodCount: _count.methods,
    }));
  }

  async createCarrier(dto: ShippingCarrierDto) {
    if (!dto.code || !dto.name?.trim()) {
      throw new BadRequestException('کد و نام شرکت حمل الزامی است');
    }
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.shippingCarrier.findUnique({ where: { code } })) {
      throw new ConflictException('این کد قبلاً استفاده شده است');
    }
    this.validateTrackingTemplate(dto.trackingUrlTemplate);
    const carrier = await this.prisma.shippingCarrier.create({
      data: { ...this.cleanCarrier(dto), code, name: dto.name.trim() },
    });
    return { message: 'شرکت حمل ایجاد شد', carrier };
  }

  async updateCarrier(id: string, dto: ShippingCarrierDto) {
    await this.mustFind(
      this.prisma.shippingCarrier.findUnique({ where: { id } }),
      'شرکت حمل',
    );
    this.validateTrackingTemplate(dto.trackingUrlTemplate);
    const carrier = await this.prisma.shippingCarrier.update({
      where: { id },
      data: {
        ...this.cleanCarrier(dto),
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
      },
    });
    return { message: 'شرکت حمل ذخیره شد', carrier };
  }

  async deleteCarrier(id: string) {
    await this.mustFind(
      this.prisma.shippingCarrier.findUnique({ where: { id } }),
      'شرکت حمل',
    );
    await this.prisma.shippingCarrier.delete({ where: { id } });
    return {
      message: 'شرکت حمل حذف شد؛ روش‌های ارسال آن بدون شرکت باقی ماندند',
    };
  }

  private cleanCarrier(dto: ShippingCarrierDto) {
    const opt = (v: string | null | undefined) =>
      v === undefined ? undefined : v?.trim() || null;
    return {
      description: opt(dto.description),
      website: opt(dto.website),
      contactPhone: opt(dto.contactPhone),
      trackingUrlTemplate: opt(dto.trackingUrlTemplate),
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }

  private validateTrackingTemplate(t: string | null | undefined) {
    const v = t?.trim();
    if (v && (!/^https?:\/\//.test(v) || !v.includes('{code}'))) {
      throw new BadRequestException(
        'نشانی رهگیری باید با http شروع شود و {code} را داشته باشد',
      );
    }
  }

  // ═══════════════════════ پنل: مناطق ═══════════════════════

  async listZones() {
    const rows = await this.prisma.shippingZone.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { rates: true } } },
    });
    return rows.map(({ _count, ...z }) => ({
      ...z,
      rateCount: _count.rates,
      provinceNames: z.provinceCodes.map((c) => getProvince(c)?.name ?? c),
    }));
  }

  async createZone(dto: ShippingZoneDto) {
    if (!dto.name?.trim())
      throw new BadRequestException('نام منطقه الزامی است');
    const zone = await this.prisma.shippingZone.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        provinceCodes: this.cleanProvinces(dto.provinceCodes ?? []),
        cities: this.cleanCities(dto.cities ?? []),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return { message: 'منطقه ایجاد شد', zone };
  }

  async updateZone(id: string, dto: ShippingZoneDto) {
    await this.mustFind(
      this.prisma.shippingZone.findUnique({ where: { id } }),
      'منطقه',
    );
    const zone = await this.prisma.shippingZone.update({
      where: { id },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.provinceCodes
          ? { provinceCodes: this.cleanProvinces(dto.provinceCodes) }
          : {}),
        ...(dto.cities ? { cities: this.cleanCities(dto.cities) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return { message: 'منطقه ذخیره شد', zone };
  }

  async deleteZone(id: string) {
    await this.mustFind(
      this.prisma.shippingZone.findUnique({ where: { id } }),
      'منطقه',
    );
    await this.prisma.shippingZone.delete({ where: { id } });
    return { message: 'منطقه و تعرفه‌های آن حذف شد' };
  }

  private cleanProvinces(codes: string[]) {
    const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
    const bad = unique.filter((c) => !isProvinceCode(c));
    if (bad.length)
      throw new BadRequestException(`کد استان نامعتبر: ${bad.join('، ')}`);
    return unique;
  }

  private cleanCities(cities: string[]) {
    return [
      ...new Set(
        cities.map((c) => c.trim().replace(/\s+/g, ' ')).filter(Boolean),
      ),
    ];
  }

  // ═══════════════════════ پنل: تعرفه‌ها ═══════════════════════

  async listRates() {
    const rows = await this.prisma.shippingRate.findMany({
      include: {
        method: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            sortOrder: true,
          },
        },
        zone: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    return rows
      .sort(
        (a, b) =>
          a.method.sortOrder - b.method.sortOrder ||
          a.zone.sortOrder - b.zone.sortOrder,
      )
      .map((r) => ({ ...this.toCalcRate(r), method: r.method, zone: r.zone }));
  }

  /** ایجاد تعرفه یا به‌روزرسانی تعرفه‌ی موجود همان روش در همان منطقه */
  async upsertRate(dto: ShippingRateDto) {
    if (!dto.methodId || !dto.zoneId) {
      throw new BadRequestException('روش ارسال و منطقه الزامی است');
    }
    await this.mustFind(
      this.prisma.shippingMethod.findUnique({ where: { id: dto.methodId } }),
      'روش ارسال',
    );
    await this.mustFind(
      this.prisma.shippingZone.findUnique({ where: { id: dto.zoneId } }),
      'منطقه',
    );
    const existing = await this.prisma.shippingRate.findUnique({
      where: {
        methodId_zoneId: { methodId: dto.methodId, zoneId: dto.zoneId },
      },
    });
    const data = this.cleanRate(
      dto,
      existing ? this.toCalcRate(existing) : null,
    );
    const rate = existing
      ? await this.prisma.shippingRate.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.shippingRate.create({
          data: { ...data, methodId: dto.methodId, zoneId: dto.zoneId },
        });
    return {
      message: existing ? 'تعرفه ذخیره شد' : 'تعرفه ایجاد شد',
      rate: this.toCalcRate(rate),
    };
  }

  async updateRate(id: string, dto: ShippingRateDto) {
    const existing = await this.mustFind(
      this.prisma.shippingRate.findUnique({ where: { id } }),
      'تعرفه',
    );
    const rate = await this.prisma.shippingRate.update({
      where: { id },
      data: this.cleanRate(dto, this.toCalcRate(existing)),
    });
    return { message: 'تعرفه ذخیره شد', rate: this.toCalcRate(rate) };
  }

  async deleteRate(id: string) {
    await this.mustFind(
      this.prisma.shippingRate.findUnique({ where: { id } }),
      'تعرفه',
    );
    await this.prisma.shippingRate.delete({ where: { id } });
    return { message: 'تعرفه حذف شد' };
  }

  private cleanRate(dto: ShippingRateDto, current: CalcRate | null) {
    const pick = <K extends keyof ShippingRateDto & keyof CalcRate>(k: K) =>
      dto[k] !== undefined ? dto[k] : current?.[k];
    const min = pick('minRial');
    const max = pick('maxRial');
    if (min != null && max != null && max > 0 && min > max) {
      throw new BadRequestException(
        'حداقل هزینه نمی‌تواند از حداکثر بیشتر باشد',
      );
    }
    const etaMin = pick('etaMinDays');
    const etaMax = pick('etaMaxDays');
    if (etaMin != null && etaMax != null && etaMin > etaMax) {
      throw new BadRequestException(
        'حداقل زمان تحویل نمی‌تواند از حداکثر بیشتر باشد',
      );
    }
    const nullable = (v: number | null | undefined) =>
      v === undefined ? undefined : v === null || v === 0 ? null : v;
    return {
      baseRial: dto.baseRial,
      baseWeightGrams: dto.baseWeightGrams,
      stepRial: dto.stepRial,
      stepWeightGrams: dto.stepWeightGrams,
      valuePercent: dto.valuePercent,
      minRial: nullable(dto.minRial),
      maxRial: nullable(dto.maxRial),
      freeAboveRial: nullable(dto.freeAboveRial),
      maxWeightGrams: nullable(dto.maxWeightGrams),
      maxOrderRial: nullable(dto.maxOrderRial),
      feePayment: dto.feePayment,
      etaMinDays: dto.etaMinDays,
      etaMaxDays: dto.etaMaxDays,
      isActive: dto.isActive,
    };
  }

  // ═══════════════════════ پنل: شبیه‌ساز ═══════════════════════

  /** برآورد گزینه‌های ارسال برای یک مقصد و مرسوله‌ی فرضی (وزن خالص اقلام + وزن بسته‌بندی) */
  async simulate(dto: ShippingSimulateDto) {
    if (!isProvinceCode(dto.provinceCode)) {
      throw new BadRequestException('استان نامعتبر است');
    }
    const { weightGrams, options } = await this.quoteForAddress(
      {
        id: 'simulation',
        fullAddress: '',
        provinceCode: dto.provinceCode,
        city: dto.city ?? null,
        postalCode: dto.postalCode ?? null,
      },
      { itemsWeightGrams: dto.weightGrams, valueRial: dto.valueRial },
    );
    return {
      enabled: await this.isEnabled(),
      weightGrams,
      options: options.map((o) => ({
        ...o,
        charge: resolveShippingCharge(o, false),
        chargeOnDelivery:
          o.feePayment === 'PREPAID' ? null : resolveShippingCharge(o, true),
      })),
    };
  }

  private async mustFind<T>(p: Promise<T | null>, label: string): Promise<T> {
    const row = await p;
    if (!row) throw new NotFoundException(`${label} یافت نشد`);
    return row;
  }
}
