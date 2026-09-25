// api/src/invoice/invoice.service.ts

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  toPersianDigits,
} from '../common/utils/jalali.util';
import { rialInWords } from '../common/utils/persian-words.util';
import type {
  CompanySnapshot,
  CustomerSnapshot,
  InvoiceDocumentDto,
  InvoiceItemInput,
  ProformaExtraData,
  SaleInvoiceExtraData,
} from './invoice.types';

type Tx = Prisma.TransactionClient;

interface IssueParams {
  kind: 'INVOICE' | 'PROFORMA';
  sourceType: 'SHOP_ORDER' | 'PHYSICAL_DELIVERY' | 'DEPOSIT';
  sourceId: string;
  userId: string;
  items: InvoiceItemInput[];
  extraData?: ProformaExtraData | SaleInvoiceExtraData | null;
  expiresAt?: Date | null;
  status?: 'ISSUED' | 'PAID';
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly sequence: DocumentSequenceService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // ── Snapshot ها ──
  // ═══════════════════════════════════════════════════════════

  /**
   * اطلاعات شرکت در لحظه صدور.
   * اگر فیلدهای حیاتی خالی باشند صدور مسدود می‌شود — ایراد شماره ۱
   * نمونه پیوستی («شماره فاکتور: » خالی) نباید تکرار شود.
   */
  async buildCompanySnapshot(): Promise<CompanySnapshot> {
    const [
      legalName,
      brandName,
      companyType,
      nationalId,
      registrationNumber,
      economicCode,
      address,
      postalCode,
      phone,
      website,
      logoPath,
      sealImagePath,
    ] = await Promise.all([
      this.systemConfig.get('company.legal_name'),
      this.systemConfig.get('company.brand_name'),
      this.systemConfig.get('company.company_type'),
      this.systemConfig.get('company.national_id'),
      this.systemConfig.get('company.registration_number'),
      this.systemConfig.get('company.economic_code'),
      this.systemConfig.get('company.address'),
      this.systemConfig.get('company.postal_code'),
      this.systemConfig.get('company.phone'),
      this.systemConfig.get('company.website'),
      this.systemConfig.get('company.logo_path'),
      this.systemConfig.get('company.seal_image_path'),
    ]);

    const missing: string[] = [];
    if (!legalName) missing.push('نام حقوقی');
    if (!nationalId) missing.push('شناسه ملی');
    if (!registrationNumber) missing.push('شماره ثبت');
    if (!address) missing.push('نشانی');

    if (missing.length) {
      this.logger.error(
        `[Invoice] صدور سند مسدود شد — تنظیمات شرکت ناقص: ${missing.join('، ')}`,
      );
      throw new BadRequestException(
        `صدور سند ممکن نیست. اطلاعات شرکت در تنظیمات سیستم کامل نشده است: ${missing.join('، ')}`,
      );
    }

    return {
      legalName,
      brandName,
      companyType,
      nationalId,
      registrationNumber,
      economicCode,
      address,
      postalCode,
      phone,
      website,
      logoPath,
      sealImagePath,
    };
  }

  /** اطلاعات مشتری در لحظه صدور — بعداً تغییر پروفایل روی سند اثر ندارد. */
  async buildCustomerSnapshot(
    tx: Tx,
    userId: string,
  ): Promise<CustomerSnapshot> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        identity: true,
        legalProfile: true,
        addresses: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const address = user.addresses[0] ?? null;
    const isLegal = user.type === 'LEGAL';

    if (isLegal && user.legalProfile) {
      return {
        displayName: user.legalProfile.companyName,
        isLegal: true,
        nationalId: user.legalProfile.nationalId ?? null,
        economicCode: user.legalProfile.economicCode ?? null,
        registrationNumber: user.legalProfile.registrationNumber ?? null,
        phone: user.phone,
        address: address ? this.formatAddress(address) : null,
        postalCode:
          (address as { postalCode?: string } | null)?.postalCode ?? null,
      };
    }

    const identity = user.identity;
    const fullName = identity
      ? `${identity.firstName ?? ''} ${identity.lastName ?? ''}`.trim()
      : '';

    return {
      displayName: fullName || 'کاربر آرکان گلد',
      isLegal: false,
      nationalId: identity?.nationalCode ?? null,
      economicCode: null,
      registrationNumber: null,
      phone: user.phone,
      address: address ? this.formatAddress(address) : null,
      postalCode:
        (address as { postalCode?: string } | null)?.postalCode ?? null,
    };
  }

  private toText(value: unknown): string | null {
    if (typeof value === 'string') {
      const text = value.trim();
      return text.length > 0 ? text : null;
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }

    return null;
  }

  private formatAddress(a: Record<string, unknown>): string {
    const parts = [
      a.province,
      a.city,
      a.fullAddress ?? a.address,
      a.plaque,
      a.unit,
    ]
      .map((value) => this.toText(value))
      .filter((value): value is string => value !== null);

    return parts.join('، ');
  }

  // ═══════════════════════════════════════════════════════════
  // ── صدور سند ──
  // ═══════════════════════════════════════════════════════════

  /**
   * صدور سند. **همیشه** داخل tx تراکنش مالی صدا زده شود تا اگر
   * پرداخت/تایید rollback شد، سند و شماره‌اش هم مصرف نشوند.
   */
  async issue(tx: Tx, params: IssueParams) {
    const { kind, sourceType, sourceId, userId, items } = params;

    if (!items.length) {
      throw new BadRequestException('سند بدون قلم قابل صدور نیست');
    }

    // ضدتکرار در سطح اپلیکیشن؛ قید @@unique دیتابیس خط دفاع دوم است
    const existing = await tx.invoice.findFirst({
      where: { sourceType, sourceId, kind },
    });
    if (existing) {
      this.logger.warn(
        `[Invoice] سند تکراری درخواست شد — بازگشت سند موجود ${existing.invoiceNumber}`,
      );
      return existing;
    }

    const company = await this.buildCompanySnapshot();
    const customer = await this.buildCustomerSnapshot(tx, userId);

    // ستون‌های فاکتور جمع‌پذیرند: جمع کل − تخفیف + کارمزد + مالیات = قابل پرداخت
    // (مبلغ واحد اقلام بدون اجرت/کارمزد/مالیات ثبت می‌شود)
    const subtotalRial = items.reduce(
      (s, i) => s + i.unitPriceRial * i.quantity + (i.makingRial ?? 0),
      0,
    );
    const discountRial = items.reduce((s, i) => s + (i.discountRial ?? 0), 0);
    const feeRial = items.reduce((s, i) => s + (i.feeRial ?? 0), 0);
    const taxRial = items.reduce((s, i) => s + (i.taxRial ?? 0), 0);
    const totalRial = items.reduce((s, i) => s + i.totalRial, 0);

    if (subtotalRial - discountRial + feeRial + taxRial !== totalRial) {
      this.logger.error(
        `[Invoice][ALERT] مغایرت جمع‌بندی سند ${sourceType}:${sourceId} — ` +
          `جمع کل ${subtotalRial} − تخفیف ${discountRial} + کارمزد ${feeRial} + ` +
          `مالیات ${taxRial} ≠ قابل پرداخت ${totalRial}`,
      );
    }

    const invoiceNumber = await this.sequence.next(
      tx,
      kind === 'PROFORMA' ? 'PRF' : 'INV',
    );

    const issuedAt = new Date();
    const contentHash = this.computeHash({
      invoiceNumber,
      kind,
      userId,
      company,
      customer,
      items,
      subtotalRial,
      discountRial,
      feeRial,
      taxRial,
      totalRial,
      issuedAt: issuedAt.toISOString(),
    });

    const invoice = await tx.invoice.create({
      data: {
        kind,
        invoiceNumber,
        status: params.status ?? 'ISSUED',
        sourceType,
        sourceId,
        userId,
        companySnapshot: company as unknown as Prisma.InputJsonValue,
        customerSnapshot: customer as unknown as Prisma.InputJsonValue,
        extraData:
          params.extraData == null
            ? undefined
            : (params.extraData as unknown as Prisma.InputJsonValue),
        subtotalRial,
        discountRial,
        feeRial,
        taxRial,
        totalRial,
        totalInWords: rialInWords(totalRial),
        issuedAt,
        expiresAt: params.expiresAt ?? null,
        contentHash,
        items: {
          create: items.map((i) => ({
            rowNo: i.rowNo,
            productCode: i.productCode ?? null,
            title: i.title,
            unit: i.unit,
            purityKarat: i.purityKarat ?? null,
            quantity: i.quantity,
            weightGrams: i.weightGrams ?? null,
            unitPriceRial: i.unitPriceRial,
            discountRial: i.discountRial ?? 0,
            makingRial: i.makingRial ?? 0,
            feeRial: i.feeRial ?? 0,
            taxRate: i.taxRate ?? 0,
            taxRial: i.taxRial ?? 0,
            totalRial: i.totalRial,
            meta: (i.meta ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        },
      },
    });

    this.logger.log(
      `[Invoice] سند ${invoiceNumber} صادر شد — منبع ${sourceType}:${sourceId}`,
    );
    return invoice;
  }

  /** sha256 روی payload کانونیکال (کلیدهای مرتب) — تشخیص دستکاری در DB */
  private computeHash(payload: unknown): string {
    const canonical = JSON.stringify(payload, (_k, v: unknown) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.entries(v)
          .sort(([keyA], [keyB]) => {
            if (keyA < keyB) return -1;
            if (keyA > keyB) return 1;
            return 0;
          })
          .reduce<Record<string, unknown>>((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {});
      }

      return v;
    });

    return createHash('sha256').update(canonical).digest('hex');
  }

  // ═══════════════════════════════════════════════════════════
  // ── صدور فاکتور فروش از سفارش فروشگاه ──
  // ═══════════════════════════════════════════════════════════

  /**
   * فراخوانی در همان $transaction پرداخت سفارش، بلافاصله بعد از
   * shopOrder.update({ status: 'PAID' }).
   *
   * هیچ محاسبه مالی مجددی انجام نمی‌شود — فقط snapshot از
   * priceBreakdown قفل‌شده. این جلوی مغایرت فاکتور با مبلغ واقعاً
   * پرداخت‌شده را می‌گیرد.
   */
  async issueForShopOrder(tx: Tx, orderId: string) {
    // آیتم‌های تنوع ثابت (مثل شمش) فقط variantId دارند و محصولشان از روی variant
    // خوانده می‌شود؛ آیتم‌های بازه‌وزنی مستقیم productId دارند
    const productInclude = { category: { select: { name: true } } };
    const order = await tx.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: { include: productInclude },
            variant: { include: { product: { include: productInclude } } },
            packagingOption: { select: { code: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');

    const lineDiscounts = this.allocateDiscount(
      order.items.map((it) => Number(it.priceRial) * it.quantity),
      Number(order.discountRial),
    );

    const items: InvoiceItemInput[] = order.items.map((it, idx) => {
      const product = it.variant?.product ?? it.product ?? null;
      const unitPriceRial = Number(it.priceRial);
      const lineTotal = unitPriceRial * it.quantity;
      const lineDiscount = lineDiscounts[idx];
      const weightGrams =
        it.variant?.weightGrams != null
          ? Number(it.variant.weightGrams)
          : it.selectedWeightGrams != null
            ? Number(it.selectedWeightGrams)
            : null;

      // قیمت قفل‌شده هر واحد شامل اجرت، کارمزد و مالیات است. برای اینکه ستون‌های
      // فاکتور جمع‌پذیر باشند (مبلغ واحد × تعداد + اجرت + کارمزد + مالیات − تخفیف
      // = جمع ردیف)، این اجزا از مبلغ واحد جدا می‌شوند.
      const b = this.parseBreakdown(it.priceBreakdown);
      const components = b.making + b.commission + b.tax;
      const split = components > 0 && components <= unitPriceRial;

      return {
        rowNo: idx + 1,
        productCode:
          it.variant?.sku ??
          it.variant?.id?.slice(0, 8) ??
          product?.id?.slice(0, 8) ??
          null,
        title: this.describeShopItem({
          productName: product?.name ?? null,
          categoryName: product?.category?.name ?? null,
          weightGrams,
          purityKarat: product?.purityKarat ?? null,
          recipientType: it.recipientType,
          recipientPhoneNumber: it.recipientPhoneNumber,
        }),
        unit: 'عدد',
        purityKarat: product?.purityKarat ?? null,

        quantity: it.quantity,
        weightGrams,
        unitPriceRial: split ? unitPriceRial - components : unitPriceRial,
        discountRial: lineDiscount,
        makingRial: split ? b.making * it.quantity : 0,
        feeRial: split ? b.commission * it.quantity : 0,
        taxRate: split ? b.taxRate : 0,
        taxRial: split ? b.tax * it.quantity : 0,
        totalRial: lineTotal - lineDiscount,
        meta: it.priceBreakdown ?? undefined,
      };
    });

    // بسته‌بندی هر کالا ردیف جدای فاکتور است؛ بسته‌بندی رایگان‌شده با مبلغ
    // واقعی و تخفیف برابر درج می‌شود تا ستون‌ها جمع‌پذیر بمانند
    for (const it of order.items) {
      if (!it.packagingName || it.packagingQuantity <= 0) continue;
      const product = it.variant?.product ?? it.product ?? null;
      const unitPriceRial = Number(it.packagingUnitPriceRial ?? 0);
      const listRial = unitPriceRial * it.packagingQuantity;
      const chargedRial = Number(it.packagingRial);
      const productName = product?.name?.trim();

      items.push({
        rowNo: items.length + 1,
        productCode: it.packagingOption?.code ?? 'PKG',
        title: `بسته‌بندی «${it.packagingName}»${
          productName ? ` برای ${productName}` : ''
        }${it.packagingFree ? ' (رایگان — هدیه خرید)' : ''}`,
        unit: 'عدد',
        purityKarat: null,
        quantity: it.packagingQuantity,
        weightGrams: null,
        unitPriceRial,
        discountRial: listRial - chargedRial,
        makingRial: 0,
        feeRial: 0,
        taxRate: 0,
        taxRial: 0,
        totalRial: chargedRial,
        meta: { type: 'PACKAGING', free: it.packagingFree },
      });
    }

    return this.issue(tx, {
      kind: 'INVOICE',
      sourceType: 'SHOP_ORDER',
      sourceId: order.id,
      userId: order.userId,
      items,
      extraData: {
        discountCode:
          Number(order.discountRial) > 0 ? order.discountCodeText : null,
        discountCodeRial: Number(order.discountRial),
        packagingWaivedRial: Number(order.packagingWaivedRial),
        paymentMethod: await this.describeShopPayment(
          tx,
          order.id,
          Number(order.totalRial),
        ),
      },
      status: 'PAID',
    });
  }

  /** شرح روش پرداخت سفارش از روی پرداخت‌های موفق آن */
  private async describeShopPayment(
    tx: Tx,
    orderId: string,
    totalRial: number,
  ): Promise<string> {
    if (totalRial <= 0) return 'بدون پرداخت (تخفیف کامل با کد تخفیف)';

    const payments = await tx.payment.findMany({
      where: { orderId, status: 'SUCCESS' },
      orderBy: { createdAt: 'asc' },
    });
    const wallet = payments.filter((p) => p.method === 'WALLET');
    const gateway = payments.filter((p) => p.method === 'BANK_GATEWAY');
    const sum = (list: typeof payments) =>
      list.reduce((s, p) => s + Number(p.amountRial), 0);
    const gatewayLabel = (() => {
      const g = gateway[0];
      if (!g) return '';
      const name =
        g.gatewayProvider === 'ZARINPAL'
          ? 'زرین‌پال'
          : g.gatewayProvider === 'BEHPARDAKHT'
            ? 'به‌پرداخت ملت'
            : '';
      const tracking = g.gatewayTrackingCode
        ? ` — کد رهگیری ${g.gatewayTrackingCode}`
        : '';
      return `درگاه پرداخت اینترنتی${name ? ` ${name}` : ''}${tracking}`;
    })();
    const faRial = (v: number) => `${v.toLocaleString('fa-IR')} ریال`;

    if (wallet.length && gateway.length) {
      return `ترکیبی: کیف پول تومانی (${faRial(sum(wallet))}) + ${gatewayLabel} (${faRial(sum(gateway))})`;
    }
    if (gateway.length) return gatewayLabel;
    return 'کیف پول تومانی آرکان گلد';
  }

  /**
   * شرح دقیق کالا در فاکتور، مثلاً:
   * «شمش طلا — شمش ۵ گرمی، وزن ۵ گرم، عیار ۲۴ (۹۹۹٫۹)»
   */
  private describeShopItem(p: {
    productName: string | null;
    categoryName: string | null;
    weightGrams: number | null;
    purityKarat: string | null;
    recipientType: string;
    recipientPhoneNumber: string | null;
  }): string {
    const name = p.productName?.trim() || 'کالای فروشگاه';
    const head =
      p.categoryName && !name.includes(p.categoryName)
        ? `${p.categoryName} — ${name}`
        : name;

    const details: string[] = [];
    if (p.weightGrams != null && p.weightGrams > 0) {
      details.push(
        `وزن ${toPersianDigits(p.weightGrams).replace('.', '٫')} گرم`,
      );
    }
    if (p.purityKarat === 'K24') details.push('عیار ۲۴ (۹۹۹٫۹)');
    if (p.purityKarat === 'K18') details.push('عیار ۱۸ (۷۵۰)');
    if (p.recipientType === 'OTHER' && p.recipientPhoneNumber) {
      details.push(`خرید برای ${toPersianDigits(p.recipientPhoneNumber)}`);
    }

    return details.length ? `${head}، ${details.join('، ')}` : head;
  }

  /**
   * تقسیم تخفیف کل سفارش بین اقلام به نسبت مبلغ هر ردیف (به تومان کامل)؛
   * باقیمانده گرد کردن به آخرین ردیف دارای مبلغ اضافه می‌شود تا جمع
   * تخفیف ردیف‌ها دقیقاً برابر تخفیف سفارش باشد.
   */
  private allocateDiscount(lineTotals: number[], discountRial: number) {
    const result = lineTotals.map(() => 0);
    const subtotal = lineTotals.reduce((s, v) => s + v, 0);
    if (discountRial <= 0 || subtotal <= 0) return result;

    let allocated = 0;
    lineTotals.forEach((line, idx) => {
      const share = Math.floor((discountRial * line) / subtotal / 10) * 10;
      result[idx] = Math.min(share, line);
      allocated += result[idx];
    });

    let remainder = discountRial - allocated;
    for (let idx = lineTotals.length - 1; idx >= 0 && remainder > 0; idx--) {
      const room = lineTotals[idx] - result[idx];
      const add = Math.min(room, remainder);
      result[idx] += add;
      remainder -= add;
    }
    return result;
  }

  /**
   * نگاشت priceBreakdown محصول به ستون‌های فاکتور.
   * شکل breakdown از ProductPricingComponent می‌آید؛ چون قالب دقیقش
   * بین نسخه‌ها فرق می‌کند، تشخیص روی چند نام رایج کلید انجام می‌شود
   * و در بدترین حالت مقادیر صفر می‌مانند (سند همچنان درست است چون
   * totalRial از priceRial قفل‌شده خوانده می‌شود، نه از breakdown).
   */
  private parseBreakdown(raw: unknown): {
    making: number;
    commission: number;
    tax: number;
    taxRate: number;
  } {
    const out = { making: 0, commission: 0, tax: 0, taxRate: 0 };
    if (!raw) return out;

    const rows: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : Array.isArray((raw as { components?: unknown }).components)
        ? (raw as { components: Record<string, unknown>[] }).components
        : [];

    for (const r of rows) {
      const rawKey = r.key ?? r.componentKey;

      const key =
        typeof rawKey === 'string'
          ? rawKey.toLowerCase()
          : typeof rawKey === 'number' || typeof rawKey === 'bigint'
            ? rawKey.toString().toLowerCase()
            : '';

      const amount = Number(r.amountRial ?? r.amount ?? r.value ?? 0) || 0;
      // خروجی موتور قیمت‌گذاری درصد را در value با valueType=PERCENT نگه می‌دارد
      const rate =
        Number(
          r.percent ??
            r.rate ??
            (r.valueType === 'PERCENT' ? r.value : undefined) ??
            0,
        ) || 0;

      if (key.includes('making')) {
        out.making += amount;
      } else if (
        key.includes('commission') ||
        key.includes('fee') ||
        key.includes('profit')
      ) {
        // سود فروشنده و کارمزد در ستون «سود و کارمزد» فاکتور می‌آیند
        out.commission += amount;
      } else if (key.includes('tax')) {
        out.tax += amount;
        if (rate) out.taxRate = rate;
      }
    }

    return out;
  }

  // ═══════════════════════════════════════════════════════════
  // ── خواندن ──
  // ═══════════════════════════════════════════════════════════

  /** isAdmin=true بررسی مالکیت را دور می‌زند. */
  async getDocument(
    invoiceId: string,
    requesterUserId: string | null,
    isAdmin = false,
  ): Promise<InvoiceDocumentDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { orderBy: { rowNo: 'asc' } } },
    });
    if (!invoice) throw new NotFoundException('سند یافت نشد');

    // اتکا به حدس‌ناپذیر بودن UUID کافی نیست
    if (!isAdmin && invoice.userId !== requesterUserId) {
      throw new ForbiddenException('دسترسی به این سند مجاز نیست');
    }

    const [verifyBase, invOrientation, prfOrientation] = await Promise.all([
      this.systemConfig.get('document.verify_base_url'),
      this.systemConfig.get('document.invoice_orientation', 'landscape'),
      this.systemConfig.get('document.proforma_orientation', 'portrait'),
    ]);

    const orientation = (
      invoice.kind === 'PROFORMA' ? prfOrientation : invOrientation
    ) as 'landscape' | 'portrait';

    const s = (d: Prisma.Decimal | null) => (d == null ? null : d.toString());

    return {
      id: invoice.id,
      kind: invoice.kind,
      invoiceNumber: invoice.invoiceNumber,
      invoiceNumberFa: DocumentSequenceService.toDisplay(invoice.invoiceNumber),
      status: invoice.status,
      orientation,

      issuedAt: invoice.issuedAt.toISOString(),
      issuedAtJalali: formatJalaliDateTime(invoice.issuedAt),
      expiresAt: invoice.expiresAt?.toISOString() ?? null,
      expiresAtJalali: invoice.expiresAt
        ? formatJalaliDateTime(invoice.expiresAt)
        : null,

      company: invoice.companySnapshot as unknown as CompanySnapshot,
      customer: invoice.customerSnapshot as unknown as CustomerSnapshot,
      extra:
        invoice.kind === 'PROFORMA'
          ? ((invoice.extraData as unknown as ProformaExtraData) ?? null)
          : null,
      discountCode:
        invoice.kind === 'INVOICE'
          ? ((invoice.extraData as unknown as SaleInvoiceExtraData | null)
              ?.discountCode ?? null)
          : null,
      paymentMethod:
        invoice.kind === 'INVOICE'
          ? ((invoice.extraData as unknown as SaleInvoiceExtraData | null)
              ?.paymentMethod ?? null)
          : null,
      discountCodeRial: this.optionalRial(
        invoice.kind === 'INVOICE'
          ? (invoice.extraData as unknown as SaleInvoiceExtraData | null)
              ?.discountCodeRial
          : undefined,
      ),
      packagingWaivedRial: this.optionalRial(
        invoice.kind === 'INVOICE'
          ? (invoice.extraData as unknown as SaleInvoiceExtraData | null)
              ?.packagingWaivedRial
          : undefined,
      ),

      items: invoice.items.map((i) => ({
        rowNo: i.rowNo,
        productCode: i.productCode,
        title: i.title,
        unit: i.unit,
        purityKarat: i.purityKarat,
        quantity: i.quantity.toString(),
        weightGrams: s(i.weightGrams),
        unitPriceRial: i.unitPriceRial.toString(),
        discountRial: i.discountRial.toString(),
        makingRial: i.makingRial.toString(),
        feeRial: i.feeRial.toString(),
        taxRate: i.taxRate.toString(),
        taxRial: i.taxRial.toString(),
        totalRial: i.totalRial.toString(),
      })),

      subtotalRial: invoice.subtotalRial.toString(),
      discountRial: invoice.discountRial.toString(),
      feeRial: invoice.feeRial.toString(),
      taxRial: invoice.taxRial.toString(),
      totalRial: invoice.totalRial.toString(),
      totalInWords: invoice.totalInWords,

      contentHash: invoice.contentHash,
      verifyUrl: `${verifyBase}/${invoice.invoiceNumber}`,
      cancelReason: invoice.cancelReason,
    };
  }

  /**
   * نگاشت sourceId → invoiceId برای یک دسته منبع — برای نمایش دکمه
   * «مشاهده فاکتور» در صفحات سفارش/تحویل/تراکنش بدون N+1 کوئری.
   */
  async findInvoiceIdsBySource(
    sourceType: 'SHOP_ORDER' | 'PHYSICAL_DELIVERY',
    sourceIds: string[],
  ): Promise<Map<string, string>> {
    if (!sourceIds.length) return new Map();

    const rows = await this.prisma.invoice.findMany({
      where: { sourceType, sourceId: { in: sourceIds }, kind: 'INVOICE' },
      select: { id: true, sourceId: true },
    });

    return new Map(rows.map((r) => [r.sourceId, r.id]));
  }

  async listForUser(
    userId: string,
    query: { kind?: 'INVOICE' | 'PROFORMA'; page?: number; limit?: number },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));

    const where: Prisma.InvoiceWhereInput = {
      userId,
      ...(query.kind ? { kind: query.kind } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          invoiceNumber: true,
          status: true,
          totalRial: true,
          issuedAt: true,
          expiresAt: true,
          sourceType: true,
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      items: rows.map((r) => ({
        ...r,
        totalRial: r.totalRial.toString(),
        invoiceNumberFa: DocumentSequenceService.toDisplay(r.invoiceNumber),
        issuedAtJalali: formatJalaliDate(r.issuedAt),
      })),
    };
  }

  /** ابطال — سند هرگز ویرایش نمی‌شود، فقط باطل و جایگزین می‌شود. */
  async cancel(invoiceId: string, reason: string) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('دلیل ابطال باید حداقل ۱۰ کاراکتر باشد');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "invoices" WHERE "id" = ${invoiceId}::uuid FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new NotFoundException('سند یافت نشد');
      if (invoice.status === 'CANCELLED') {
        return {
          message: 'این سند قبلاً باطل شده است',
          alreadyProcessed: true,
        };
      }
      if (invoice.status === 'CONSUMED') {
        throw new ConflictException(
          'این پیش‌فاکتور مصرف شده و واریز آن تایید شده است؛ ابطال ممکن نیست',
        );
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason.trim(),
        },
      });

      return { message: 'سند باطل شد', alreadyProcessed: false };
    });
  }

  /** استعلام عمومی سند با شماره — فقط تایید اصالت، بدون افشای مبالغ. */
  async verifyPublic(invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: {
        invoiceNumber: true,
        kind: true,
        status: true,
        issuedAt: true,
        contentHash: true,
        companySnapshot: true,
      },
    });
    if (!invoice) return { valid: false as const };

    const company = invoice.companySnapshot as unknown as CompanySnapshot;
    return {
      valid: true as const,
      invoiceNumber: DocumentSequenceService.toDisplay(invoice.invoiceNumber),
      kind: invoice.kind,
      status: invoice.status,
      issuedAtJalali: formatJalaliDate(invoice.issuedAt),
      issuerLegalName: company?.legalName ?? '',
      contentHashPrefix: invoice.contentHash.slice(0, 12),
    };
  }

  private optionalRial(value: number | null | undefined): string | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? value.toString()
      : null;
  }

  /** نمایش فارسی اعداد برای فرانت */
  static fa(v: string | number) {
    return toPersianDigits(v);
  }
}
