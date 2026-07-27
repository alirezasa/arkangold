// api/src/catalog/pricing-engine.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { PriceService } from '../market/price.service';
import { SystemConfigService } from '../system-config/system-config.service';

/**
 * لایه‌ی دامنه‌ی قیمت‌گذاری آگاهانه به تایپ Decimal کتابخانه‌ی decimal.js وابسته است
 * و نه به Decimal تولیدشده توسط Prisma. تمام مقادیر ورودی از ORM در مرز ورودی
 * (toDecimal / asString) نرمال‌سازی می‌شوند تا هیچ `any` به هسته‌ی محاسبات نفوذ نکند.
 */

/** ریال واحد صحیح است؛ کسری در خروجی نگه داشته نمی‌شود. */
const RIAL_SCALE = 0;
const ROUNDING_MODE = Decimal.ROUND_HALF_UP;

/** هر مقداری که بتوان از آن یک Decimal ساخت. */
export type DecimalInput = Decimal | string | number | { toString(): string };

export const BASE_TYPE = {
  GOLD_VALUE: 'GOLD_VALUE',
  RUNNING_TOTAL: 'RUNNING_TOTAL',
} as const;

export const VALUE_TYPE = {
  PERCENT: 'PERCENT',
} as const;

export interface PricingLineResult {
  key: string;
  label: string;
  baseType: string;
  valueType: string;
  value: string;
  amountRial: string;
}

export interface PricingResult {
  purityKarat: string | null;
  goldPricePerGramRial: string | null;
  goldValueRial: string;
  lines: PricingLineResult[];
  finalPriceRial: string;
}

/** تبدیل ایمن هر مقدار ناشناخته (از جمله Decimal پرisma) به Decimal دامنه. */
function toDecimal(value: unknown, fieldName: string): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`مقدار عددی نامعتبر برای «${fieldName}»`);
    }
    return new Decimal(value);
  }
  if (typeof value === 'string') {
    return parseDecimalString(value, fieldName);
  }
  if (typeof value === 'object') {
    const candidate = value as { toString?: unknown };
    if (typeof candidate.toString === 'function') {
      return parseDecimalString(
        (candidate as { toString(): string }).toString(),
        fieldName,
      );
    }
  }
  throw new BadRequestException(`مقدار نامعتبر برای «${fieldName}»`);
}

function parseDecimalString(raw: string, fieldName: string): Decimal {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException(`مقدار خالی برای «${fieldName}»`);
  }
  let parsed: Decimal;
  try {
    parsed = new Decimal(trimmed);
  } catch {
    throw new BadRequestException(`مقدار عددی نامعتبر برای «${fieldName}»`);
  }
  if (!parsed.isFinite()) {
    throw new BadRequestException(`مقدار عددی نامعتبر برای «${fieldName}»`);
  }
  return parsed;
}

/** تبدیل ایمن مقادیر متنی/enum آمده از ORM به string. */
function asString(value: unknown, fieldName: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new BadRequestException(`مقدار متنی نامعتبر برای «${fieldName}»`);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** رند کردن نهایی به ریال صحیح. */
function toRial(value: Decimal): string {
  return value.toDecimalPlaces(RIAL_SCALE, ROUNDING_MODE).toFixed(RIAL_SCALE);
}

@Injectable()
export class PricingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: PriceService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async calculateForProduct(
    productId: string,
    weightGramsInput: DecimalInput,
  ): Promise<PricingResult> {
    const weight = toDecimal(weightGramsInput, 'وزن');
    if (weight.isNegative()) {
      throw new BadRequestException('وزن نمی‌تواند منفی باشد');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        pricingComponents: {
          include: { component: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) {
      throw new BadRequestException('محصول یافت نشد');
    }

    const purityKarat = asStringOrNull(product.purityKarat);

    let goldPricePerGramRial: Decimal | null = null;
    let goldValue: Decimal;

    if (purityKarat) {
      if (weight.isZero()) {
        throw new BadRequestException('وزن محصول طلا باید بزرگ‌تر از صفر باشد');
      }
      goldPricePerGramRial = await this.resolveGoldPricePerGram(purityKarat);
      goldValue = goldPricePerGramRial.times(weight);
    } else {
      goldValue = toDecimal(product.basePriceRial, 'قیمت پایه');
      if (goldValue.isNegative()) {
        throw new BadRequestException('قیمت پایه نمی‌تواند منفی باشد');
      }
    }

    const lines: PricingLineResult[] = [];
    let running = goldValue;

    for (const link of product.pricingComponents) {
      const baseType = asString(link.baseType, 'نوع مبنا');
      const valueType = asString(link.valueType, 'نوع مقدار');
      const value = toDecimal(link.value, 'مقدار جزء قیمت');

      const base =
        baseType === BASE_TYPE.GOLD_VALUE
          ? goldValue
          : baseType === BASE_TYPE.RUNNING_TOTAL
            ? running
            : new Decimal(0);

      // رند میانی انجام نمی‌شود تا خطای تجمعی ایجاد نشود.
      const amount =
        valueType === VALUE_TYPE.PERCENT
          ? base.times(value).dividedBy(100)
          : value;

      running = running.plus(amount);

      lines.push({
        key: asString(link.component.key, 'کلید جزء قیمت'),
        label: asString(link.component.label, 'عنوان جزء قیمت'),
        baseType,
        valueType,
        value: value.toString(),
        amountRial: toRial(amount),
      });
    }

    if (running.isNegative()) {
      throw new BadRequestException(
        'فرمول قیمت‌گذاری منجر به مقدار منفی شده است',
      );
    }

    return {
      purityKarat,
      goldPricePerGramRial: goldPricePerGramRial
        ? goldPricePerGramRial.toString()
        : null,
      goldValueRial: toRial(goldValue),
      lines,
      finalPriceRial: toRial(running),
    };
  }

  /**
   * قیمت هر گرم بر اساس عیار. ضریب از تنظیمات سیستم با کلید
   * `gold.purity.{karat}` خوانده می‌شود و پیش‌فرض آن karat/24 است.
   */
  private async resolveGoldPricePerGram(purityKarat: string): Promise<Decimal> {
    const price24 = toDecimal(
      await this.priceService.getCurrentGoldPriceDecimal(),
      'قیمت لحظه‌ای طلا',
    );
    if (price24.lessThanOrEqualTo(0)) {
      throw new BadRequestException('قیمت لحظه‌ای طلا در دسترس نیست');
    }

    if (purityKarat === 'K24') {
      return price24;
    }

    const karatMatch = /^K(\d{1,2})$/.exec(purityKarat);
    if (!karatMatch) {
      throw new BadRequestException(`عیار پشتیبانی نمی‌شود: ${purityKarat}`);
    }
    const karat = Number(karatMatch[1]);
    if (!Number.isInteger(karat) || karat <= 0 || karat > 24) {
      throw new BadRequestException(`عیار پشتیبانی نمی‌شود: ${purityKarat}`);
    }

    const defaultFactor = new Decimal(karat).dividedBy(24).toString();
    const factor = toDecimal(
      await this.systemConfig.getDecimal(`gold.purity.${karat}`, defaultFactor),
      'ضریب عیار',
    );
    if (factor.lessThanOrEqualTo(0) || factor.greaterThan(1)) {
      throw new BadRequestException('ضریب عیار تنظیم‌شده نامعتبر است');
    }

    return price24.times(factor);
  }
}
