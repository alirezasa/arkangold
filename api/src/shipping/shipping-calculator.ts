// api/src/shipping/shipping-calculator.ts
//
// محاسبه‌ی خالص گزینه‌های ارسال یک مرسوله (بدون I/O؛ قابل آزمون):
//   ۱) منطقه‌های منطبق با آدرس به ترتیب دقت: فهرست شهر (۳) > استان (۲) > سایر نقاط کشور (۱)
//   ۲) برای هر روش ارسال، تعرفه‌ی دقیق‌ترین منطقه‌ای که برای آن روش تعرفه دارد ملاک است؛
//      تعرفه‌ی غیرفعال در منطقه‌ی دقیق‌تر یعنی «این روش برای این ناحیه ارائه نمی‌شود»
//      (به تعرفه‌ی منطقه‌ی کلی‌تر برنمی‌گردد).
//   ۳) هزینه = پایه + پله‌های وزن مازاد × مبلغ پله + درصد ارزش کالا؛ سپس حداقل/حداکثر و گرد به بالا.
//   ۴) ارسال رایگان با رسیدن جمع اقلام به آستانه؛ پس‌کرایه = هزینه در سفارش صفر و پرداخت هنگام تحویل.
import { normalizeFa } from './iran-provinces';

export type FeePayment = 'PREPAID' | 'ON_DELIVERY' | 'CUSTOMER_CHOICE';
export type MethodType = 'POST' | 'COURIER' | 'EXPRESS' | 'PICKUP';

export interface CalcZone {
  id: string;
  name: string;
  provinceCodes: string[];
  cities: string[];
  sortOrder: number;
}

export interface CalcRate {
  id: string;
  methodId: string;
  zoneId: string;
  baseRial: number;
  baseWeightGrams: number;
  stepRial: number;
  stepWeightGrams: number;
  /** درصد (مثلاً 0.2 یعنی ۰٫۲٪) */
  valuePercent: number;
  minRial: number | null;
  maxRial: number | null;
  freeAboveRial: number | null;
  maxWeightGrams: number | null;
  maxOrderRial: number | null;
  feePayment: FeePayment;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  isActive: boolean;
}

export interface CalcMethod {
  id: string;
  code: string;
  name: string;
  type: MethodType;
  description: string | null;
  carrierName: string | null;
  sortOrder: number;
  requiresPostalCode: boolean;
  estimatedDays: number | null;
  pickupAddress: string | null;
  pickupHours: string | null;
}

export interface CalcDestination {
  provinceCode: string | null;
  city: string | null;
  postalCode: string | null;
}

export interface CalcParcel {
  weightGrams: number;
  /** ارزش اقلام (ریال، پیش از کد تخفیف) — مبنای بیمه، سقف ارزش و ارسال رایگان */
  valueRial: number;
}

export interface ShippingOption {
  methodId: string;
  code: string;
  name: string;
  type: MethodType;
  description: string | null;
  carrierName: string | null;
  zoneId: string;
  zoneName: string;
  rateId: string;
  available: boolean;
  unavailableReason: string | null;
  /** هزینه‌ی تعرفه پیش از رایگان شدن (ریال) */
  feeRial: number;
  /** رایگان به‌دلیل رسیدن خرید به آستانه */
  free: boolean;
  /** آستانه‌ی ارسال رایگان (برای پیام «با X خرید بیشتر ارسال رایگان») */
  freeAboveRial: number | null;
  feePayment: FeePayment;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  pickupAddress: string | null;
  pickupHours: string | null;
}

export interface ShippingCharge {
  /** مبلغ ارسال دریافتی در سفارش */
  shippingRial: number;
  /** مبلغ بخشیده‌شده به‌دلیل ارسال رایگان */
  waivedRial: number;
  payOnDelivery: boolean;
  /** برآورد هزینه طبق تعرفه (در پس‌کرایه همان مبلغ پرداختی هنگام تحویل) */
  estimateRial: number;
}

/** دقت تطبیق منطقه با مقصد؛ -1 = منطبق نیست */
export function zoneSpecificity(zone: CalcZone, dest: CalcDestination): number {
  const provinces = zone.provinceCodes ?? [];
  const cities = (zone.cities ?? []).map(normalizeFa).filter(Boolean);
  if (provinces.length > 0) {
    if (!dest.provinceCode || !provinces.includes(dest.provinceCode)) return -1;
  }
  if (cities.length > 0) {
    const city = normalizeFa(dest.city);
    return city && cities.includes(city) ? 3 : -1;
  }
  return provinces.length > 0 ? 2 : 1;
}

/** منطقه‌های منطبق، از دقیق‌ترین به کلی‌ترین */
export function matchZones<Z extends CalcZone>(
  zones: Z[],
  dest: CalcDestination,
): Z[] {
  return zones
    .map((zone) => ({ zone, score: zoneSpecificity(zone, dest) }))
    .filter((z) => z.score > 0)
    .sort((a, b) => b.score - a.score || a.zone.sortOrder - b.zone.sortOrder)
    .map((z) => z.zone);
}

export function roundUp(value: number, step: number): number {
  if (!step || step <= 1) return Math.ceil(value);
  return Math.ceil(value / step) * step;
}

/** هزینه‌ی تعرفه برای وزن و ارزش مشخص (ریال) */
export function computeRateFee(
  rate: Pick<
    CalcRate,
    | 'baseRial'
    | 'baseWeightGrams'
    | 'stepRial'
    | 'stepWeightGrams'
    | 'valuePercent'
    | 'minRial'
    | 'maxRial'
  >,
  parcel: CalcParcel,
  roundUpRial = 0,
): number {
  const extraGrams = Math.max(
    0,
    parcel.weightGrams - Math.max(0, rate.baseWeightGrams),
  );
  const steps =
    extraGrams > 0 && rate.stepRial > 0
      ? Math.ceil(extraGrams / Math.max(1, rate.stepWeightGrams))
      : 0;
  let fee =
    rate.baseRial +
    steps * rate.stepRial +
    (Math.max(0, parcel.valueRial) * Math.max(0, rate.valuePercent)) / 100;
  if (rate.minRial != null) fee = Math.max(fee, rate.minRial);
  if (rate.maxRial != null && rate.maxRial > 0)
    fee = Math.min(fee, rate.maxRial);
  fee = Math.max(0, fee);
  return fee > 0 ? roundUp(fee, roundUpRial) : 0;
}

const faNum = (n: number) => Math.round(n).toLocaleString('fa-IR');

/** گزینه‌های ارسال برای یک مقصد و مرسوله؛ روش‌های بدون تعرفه در هیچ منطقه‌ی منطبق حذف می‌شوند */
export function quoteShippingOptions(input: {
  destination: CalcDestination;
  parcel: CalcParcel;
  zones: CalcZone[];
  rates: CalcRate[];
  methods: CalcMethod[];
  roundUpRial?: number;
}): ShippingOption[] {
  const zones = matchZones(input.zones, input.destination);
  const options: ShippingOption[] = [];
  const methods = [...input.methods].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const method of methods) {
    let rate: CalcRate | undefined;
    let zone: CalcZone | undefined;
    for (const z of zones) {
      rate = input.rates.find(
        (r) => r.methodId === method.id && r.zoneId === z.id,
      );
      if (rate) {
        zone = z;
        break;
      }
    }
    // تعرفه‌ی غیرفعال در دقیق‌ترین منطقه = این روش برای این ناحیه ارائه نمی‌شود
    if (!rate || !zone || !rate.isActive) continue;

    const feeRial = computeRateFee(rate, input.parcel, input.roundUpRial ?? 0);
    const free =
      rate.freeAboveRial != null &&
      rate.freeAboveRial > 0 &&
      input.parcel.valueRial >= rate.freeAboveRial;

    let unavailableReason: string | null = null;
    if (
      rate.maxWeightGrams != null &&
      input.parcel.weightGrams > rate.maxWeightGrams
    ) {
      unavailableReason = `وزن مرسوله از سقف این روش (${faNum(rate.maxWeightGrams)} گرم) بیشتر است`;
    } else if (
      rate.maxOrderRial != null &&
      input.parcel.valueRial > rate.maxOrderRial
    ) {
      unavailableReason = `ارزش سفارش از سقف این روش (${faNum(rate.maxOrderRial / 10)} تومان) بیشتر است`;
    } else if (
      method.requiresPostalCode &&
      !/^\d{10}$/.test(input.destination.postalCode ?? '')
    ) {
      unavailableReason = 'برای این روش، کد پستی ۱۰ رقمی آدرس را تکمیل کنید';
    }

    options.push({
      methodId: method.id,
      code: method.code,
      name: method.name,
      type: method.type,
      description: method.description,
      carrierName: method.carrierName,
      zoneId: zone.id,
      zoneName: zone.name,
      rateId: rate.id,
      available: unavailableReason === null,
      unavailableReason,
      feeRial,
      free,
      freeAboveRial: rate.freeAboveRial,
      feePayment: rate.feePayment,
      etaMinDays: rate.etaMinDays ?? method.estimatedDays,
      etaMaxDays: rate.etaMaxDays ?? rate.etaMinDays ?? method.estimatedDays,
      pickupAddress: method.pickupAddress,
      pickupHours: method.pickupHours,
    });
  }
  return options;
}

/**
 * مبلغ ارسال دریافتی در سفارش با توجه به نحوه‌ی پرداخت تعرفه و انتخاب مشتری.
 * wantsPayOnDelivery فقط برای CUSTOMER_CHOICE معنا دارد.
 */
export function resolveShippingCharge(
  option: Pick<ShippingOption, 'feeRial' | 'free' | 'feePayment'>,
  wantsPayOnDelivery = false,
): ShippingCharge {
  if (option.feeRial <= 0) {
    return {
      shippingRial: 0,
      waivedRial: 0,
      payOnDelivery: false,
      estimateRial: 0,
    };
  }
  if (option.free) {
    return {
      shippingRial: 0,
      waivedRial: option.feeRial,
      payOnDelivery: false,
      estimateRial: option.feeRial,
    };
  }
  const payOnDelivery =
    option.feePayment === 'ON_DELIVERY' ||
    (option.feePayment === 'CUSTOMER_CHOICE' && wantsPayOnDelivery);
  return {
    shippingRial: payOnDelivery ? 0 : option.feeRial,
    waivedRial: 0,
    payOnDelivery,
    estimateRial: option.feeRial,
  };
}
