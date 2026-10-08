// api/src/shop-labels/shop-labels.service.ts
//
// برچسب ارسال سفارش‌های فروشگاه: اندازه‌های استاندارد رول برچسب، طرح‌های قابل ویرایش،
// بارکد EAN-13 کالاها و داده‌ی چاپ. رندر و چاپ در مرورگر پنل انجام می‌شود (درایور
// دستگاه لیبل پرینتر صفحه را رستر می‌کند، پس متن فارسی بدون فونت داخلی دستگاه چاپ می‌شود).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  completeEan13,
  isValidEanPrefix,
  normalizeBarcodeInput,
  randomEan13,
} from './ean13.util';
import { sanitizeElements } from './label-elements';
import { DEFAULT_LABEL_SIZES, DEFAULT_LABEL_TEMPLATES } from './label-defaults';
import type {
  BarcodeListQueryDto,
  CreateLabelSizeDto,
  CreateLabelTemplateDto,
  GenerateBarcodesDto,
  LabelSettingsDto,
  SetBarcodeDto,
  UpdateLabelSizeDto,
  UpdateLabelTemplateDto,
} from './shop-labels.dto';

type Db = Prisma.TransactionClient | PrismaService;

const CFG = {
  senderName: 'shop.label.sender_name',
  senderPhone: 'shop.label.sender_phone',
  senderAddress: 'shop.label.sender_address',
  senderPostalCode: 'shop.label.sender_postal_code',
  eanPrefix: 'shop.label.ean_prefix',
  autoAssignBarcode: 'shop.label.auto_assign_barcode',
  defaultsSeeded: 'shop.label.defaults_seeded',
} as const;

/** وضعیت‌هایی که برچسب ارسال برایشان معنا دارد (پرداخت‌شده تا تحویل) */
const PRINTABLE_STATUSES: ShopOrderStatus[] = [
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
];

const KARAT_FA: Record<string, string> = { K18: '۱۸ عیار', K24: '۲۴ عیار' };
const BARCODE_PAGE_SIZE = 30;

@Injectable()
export class ShopLabelsService implements OnModuleInit {
  private readonly logger = new Logger(ShopLabelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefaults();
    } catch (e) {
      // نبود جدول‌ها (پیش از اجرای migration) نباید بالا آمدن API را متوقف کند
      this.logger.warn(
        `[Labels] ساخت اندازه‌ها و طرح‌های پیش‌فرض انجام نشد: ${(e as Error).message}`,
      );
    }
  }

  /** فقط یک‌بار: اگر ادمین بعداً همه را حذف کند، دوباره ساخته نمی‌شوند */
  private async seedDefaults() {
    if ((await this.systemConfig.get(CFG.defaultsSeeded)) === 'true') return;
    const [sizeCount, templateCount] = await Promise.all([
      this.prisma.labelSize.count(),
      this.prisma.labelTemplate.count(),
    ]);
    const sizeIds = new Map<string, string>();
    if (sizeCount === 0) {
      for (const [i, s] of DEFAULT_LABEL_SIZES.entries()) {
        const row = await this.prisma.labelSize.create({
          data: {
            name: s.name,
            widthMm: s.widthMm,
            heightMm: s.heightMm,
            dpi: 203,
            sortOrder: i,
          },
        });
        sizeIds.set(s.key, row.id);
      }
    }
    if (templateCount === 0 && sizeIds.size > 0) {
      for (const [i, t] of DEFAULT_LABEL_TEMPLATES.entries()) {
        const sizeId = sizeIds.get(t.sizeKey);
        if (!sizeId) continue;
        await this.prisma.labelTemplate.create({
          data: {
            name: t.name,
            description: t.description,
            repeat: t.repeat,
            sizeId,
            elements: t.elements as unknown as Prisma.InputJsonValue,
            isDefault: t.isDefault,
            sortOrder: i,
          },
        });
      }
    }
    await this.systemConfig.set(CFG.defaultsSeeded, 'true');
    this.logger.log('[Labels] اندازه‌ها و طرح‌های پیش‌فرض برچسب ساخته شد');
  }

  // ═══════════════════════════ اندازه‌ها ═══════════════════════════

  async listSizes() {
    const rows = await this.prisma.labelSize.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { templates: true } } },
    });
    return rows.map(({ _count, ...s }) => ({
      ...s,
      templateCount: _count.templates,
    }));
  }

  createSize(dto: CreateLabelSizeDto) {
    return this.prisma.labelSize.create({
      data: {
        name: dto.name.trim(),
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
        dpi: dto.dpi ?? 203,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateSize(id: string, dto: UpdateLabelSizeDto) {
    const size = await this.prisma.labelSize.findUnique({
      where: { id },
      include: { templates: { select: { id: true, elements: true } } },
    });
    if (!size) throw new NotFoundException('اندازه برچسب یافت نشد');
    const widthMm = dto.widthMm ?? size.widthMm;
    const heightMm = dto.heightMm ?? size.heightMm;
    const resized = widthMm !== size.widthMm || heightMm !== size.heightMm;

    return this.prisma.$transaction(async (tx) => {
      // با کوچک شدن برچسب، عناصر طرح‌های وابسته داخل کادر جدید نگه داشته می‌شوند
      if (resized) {
        for (const t of size.templates) {
          await tx.labelTemplate.update({
            where: { id: t.id },
            data: {
              elements: sanitizeElements(
                t.elements,
                widthMm,
                heightMm,
              ) as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
      return tx.labelSize.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          widthMm,
          heightMm,
          ...(dto.dpi !== undefined ? { dpi: dto.dpi } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
    });
  }

  async removeSize(id: string) {
    const size = await this.prisma.labelSize.findUnique({
      where: { id },
      include: { _count: { select: { templates: true } } },
    });
    if (!size) throw new NotFoundException('اندازه برچسب یافت نشد');
    if (size._count.templates > 0) {
      throw new ConflictException(
        'این اندازه در طرح برچسب استفاده شده است؛ ابتدا طرح‌ها را به اندازه‌ی دیگری منتقل یا حذف کنید (یا اندازه را غیرفعال کنید)',
      );
    }
    await this.prisma.labelSize.delete({ where: { id } });
    return { message: 'اندازه برچسب حذف شد' };
  }

  // ═══════════════════════════ طرح‌ها ═══════════════════════════

  listTemplates(activeOnly: boolean) {
    return this.prisma.labelTemplate.findMany({
      where: activeOnly ? { isActive: true, size: { isActive: true } } : {},
      include: { size: true },
      orderBy: [
        { isDefault: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async getTemplate(id: string) {
    const t = await this.prisma.labelTemplate.findUnique({
      where: { id },
      include: { size: true },
    });
    if (!t) throw new NotFoundException('طرح برچسب یافت نشد');
    return t;
  }

  private async getSizeOrThrow(db: Db, sizeId: string) {
    const size = await db.labelSize.findUnique({ where: { id: sizeId } });
    if (!size) throw new BadRequestException('اندازه برچسب یافت نشد');
    return size;
  }

  async createTemplate(dto: CreateLabelTemplateDto) {
    const size = await this.getSizeOrThrow(this.prisma, dto.sizeId);
    const elements = sanitizeElements(
      dto.elements,
      size.widthMm,
      size.heightMm,
    );
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.labelTemplate.updateMany({ data: { isDefault: false } });
      }
      return tx.labelTemplate.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          repeat: dto.repeat,
          sizeId: size.id,
          elements: elements as unknown as Prisma.InputJsonValue,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { size: true },
      });
    });
  }

  async updateTemplate(id: string, dto: UpdateLabelTemplateDto) {
    const current = await this.getTemplate(id);
    const size =
      dto.sizeId && dto.sizeId !== current.sizeId
        ? await this.getSizeOrThrow(this.prisma, dto.sizeId)
        : current.size;
    const elements =
      dto.elements !== undefined || size.id !== current.sizeId
        ? sanitizeElements(
            dto.elements ?? current.elements,
            size.widthMm,
            size.heightMm,
          )
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.labelTemplate.updateMany({
          where: { id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.labelTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.repeat !== undefined ? { repeat: dto.repeat } : {}),
          sizeId: size.id,
          ...(elements
            ? { elements: elements as unknown as Prisma.InputJsonValue }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        include: { size: true },
      });
    });
  }

  async duplicateTemplate(id: string) {
    const t = await this.getTemplate(id);
    return this.prisma.labelTemplate.create({
      data: {
        name: `${t.name} (کپی)`.slice(0, 80),
        description: t.description,
        repeat: t.repeat,
        sizeId: t.sizeId,
        elements: t.elements,
        isDefault: false,
        isActive: t.isActive,
        sortOrder: t.sortOrder + 1,
      },
      include: { size: true },
    });
  }

  async removeTemplate(id: string) {
    await this.getTemplate(id);
    await this.prisma.labelTemplate.delete({ where: { id } });
    return { message: 'طرح برچسب حذف شد' };
  }

  // ═══════════════════════════ تنظیمات ═══════════════════════════

  async getSettings() {
    const [
      senderName,
      senderPhone,
      senderAddress,
      senderPostalCode,
      eanPrefix,
      autoAssign,
    ] = await Promise.all([
      this.systemConfig.get(CFG.senderName),
      this.systemConfig.get(CFG.senderPhone),
      this.systemConfig.get(CFG.senderAddress),
      this.systemConfig.get(CFG.senderPostalCode),
      this.systemConfig.get(CFG.eanPrefix, '200'),
      this.systemConfig.get(CFG.autoAssignBarcode, 'true'),
    ]);
    return {
      senderName,
      senderPhone,
      senderAddress,
      senderPostalCode,
      eanPrefix: isValidEanPrefix(eanPrefix) ? eanPrefix : '200',
      autoAssignBarcode: autoAssign !== 'false',
    };
  }

  async updateSettings(dto: LabelSettingsDto) {
    const entries: [string, string | undefined][] = [
      [CFG.senderName, dto.senderName?.trim()],
      [CFG.senderPhone, dto.senderPhone?.trim()],
      [CFG.senderAddress, dto.senderAddress?.trim()],
      [CFG.senderPostalCode, dto.senderPostalCode?.trim()],
      [CFG.eanPrefix, dto.eanPrefix],
      [
        CFG.autoAssignBarcode,
        dto.autoAssignBarcode === undefined
          ? undefined
          : String(dto.autoAssignBarcode),
      ],
    ];
    for (const [key, value] of entries) {
      if (value !== undefined) await this.systemConfig.set(key, value);
    }
    return { message: 'تنظیمات برچسب ذخیره شد', ...(await this.getSettings()) };
  }

  // ═══════════════════════════ بارکد کالاها ═══════════════════════════

  /**
   * فهرست کالاها برای مدیریت بارکد: هر تنوع یک ردیف؛ محصول بازه‌ی وزنی یا بدون تنوع
   * خودش یک ردیف دارد (سفارش این محصولات به تنوع وصل نیست).
   */
  async listBarcodes(query: BarcodeListQueryDto) {
    const q = query.q?.trim();
    const page = query.page ?? 1;
    const needsOwnBarcode: Prisma.ProductWhereInput = {
      OR: [{ pricingMode: 'WEIGHT_RANGE' }, { variants: { none: {} } }],
    };
    const where: Prisma.ProductWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { barcode: { contains: q } },
                {
                  variants: {
                    some: {
                      OR: [
                        { sku: { contains: q, mode: 'insensitive' } },
                        { barcode: { contains: q } },
                      ],
                    },
                  },
                },
              ],
            }
          : {},
        query.missing === 'true'
          ? {
              OR: [
                { variants: { some: { barcode: null } } },
                { AND: [needsOwnBarcode, { barcode: null }] },
              ],
            }
          : {},
      ],
    };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          pricingMode: true,
          purityKarat: true,
          barcode: true,
          variants: {
            select: { id: true, weightGrams: true, sku: true, barcode: true },
            orderBy: { weightGrams: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * BARCODE_PAGE_SIZE,
        take: BARCODE_PAGE_SIZE,
      }),
      this.prisma.product.count({ where }),
    ]);

    const rows = products.flatMap((p) => {
      const own =
        p.pricingMode === 'WEIGHT_RANGE' || p.variants.length === 0
          ? [
              {
                target: 'PRODUCT' as const,
                id: p.id,
                productId: p.id,
                productName: p.name,
                label:
                  p.pricingMode === 'WEIGHT_RANGE' ? 'وزن انتخابی' : 'محصول',
                sku: null as string | null,
                barcode: p.barcode,
                status: p.status,
              },
            ]
          : [];
      return [
        ...own,
        ...p.variants.map((v) => ({
          target: 'VARIANT' as const,
          id: v.id,
          productId: p.id,
          productName: p.name,
          label: `${Number(v.weightGrams).toString()} گرم`,
          sku: v.sku,
          barcode: v.barcode,
          status: p.status,
        })),
      ];
    });
    return {
      data: rows,
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / BARCODE_PAGE_SIZE)),
    };
  }

  private async barcodeTaken(db: Db, code: string, except?: string) {
    const [p, v] = await Promise.all([
      db.product.findFirst({
        where: { barcode: code, ...(except ? { id: { not: except } } : {}) },
        select: { id: true },
      }),
      db.productVariant.findFirst({
        where: { barcode: code, ...(except ? { id: { not: except } } : {}) },
        select: { id: true },
      }),
    ]);
    return !!(p || v);
  }

  async setBarcode(dto: SetBarcodeDto) {
    const raw = dto.barcode ? normalizeBarcodeInput(dto.barcode) : '';
    let code: string | null = null;
    if (raw) {
      code = completeEan13(raw);
      if (!code) {
        throw new BadRequestException(
          'بارکد EAN-13 نامعتبر است: ۱۲ رقم (رقم کنترل خودکار) یا ۱۳ رقم با رقم کنترل درست وارد کنید',
        );
      }
      if (await this.barcodeTaken(this.prisma, code, dto.id)) {
        throw new ConflictException('این بارکد برای کالای دیگری ثبت شده است');
      }
    }
    if (dto.target === 'VARIANT') {
      const exists = await this.prisma.productVariant.findUnique({
        where: { id: dto.id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('تنوع محصول یافت نشد');
      await this.prisma.productVariant.update({
        where: { id: dto.id },
        data: { barcode: code },
      });
    } else {
      const exists = await this.prisma.product.findUnique({
        where: { id: dto.id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('محصول یافت نشد');
      await this.prisma.product.update({
        where: { id: dto.id },
        data: { barcode: code },
      });
    }
    return { message: code ? 'بارکد ذخیره شد' : 'بارکد حذف شد', barcode: code };
  }

  private async uniqueEan(db: Db, prefix: string, reserved: Set<string>) {
    for (let i = 0; i < 25; i++) {
      const code = randomEan13(prefix);
      if (reserved.has(code)) continue;
      if (!(await this.barcodeTaken(db, code))) {
        reserved.add(code);
        return code;
      }
    }
    throw new ConflictException(
      'ساخت بارکد یکتا ممکن نشد؛ پیشوند بارکد را در تنظیمات برچسب کوتاه‌تر کنید',
    );
  }

  /** ساخت بارکد داخلی برای همه‌ی کالاهای بدون بارکد (یا محصولات مشخص‌شده) */
  async generateMissing(dto: GenerateBarcodesDto) {
    const { eanPrefix } = await this.getSettings();
    const productFilter = dto.productIds?.length
      ? { id: { in: dto.productIds } }
      : {};
    const [variants, products] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { barcode: null, product: productFilter },
        select: { id: true },
      }),
      this.prisma.product.findMany({
        where: {
          ...productFilter,
          barcode: null,
          OR: [{ pricingMode: 'WEIGHT_RANGE' }, { variants: { none: {} } }],
        },
        select: { id: true },
      }),
    ]);
    const reserved = new Set<string>();
    for (const v of variants) {
      await this.prisma.productVariant.update({
        where: { id: v.id },
        data: {
          barcode: await this.uniqueEan(this.prisma, eanPrefix, reserved),
        },
      });
    }
    for (const p of products) {
      await this.prisma.product.update({
        where: { id: p.id },
        data: {
          barcode: await this.uniqueEan(this.prisma, eanPrefix, reserved),
        },
      });
    }
    const count = variants.length + products.length;
    return {
      message: count
        ? `برای ${count.toLocaleString('fa-IR')} کالا بارکد ساخته شد`
        : 'همه‌ی کالاها بارکد دارند',
      count,
    };
  }

  // ═══════════════════════════ داده‌ی چاپ ═══════════════════════════

  /**
   * داده‌ی لازم برای چاپ برچسب سفارش‌ها به همان ترتیب درخواستی. اگر «ساخت خودکار بارکد»
   * روشن باشد، کالاهای بدون بارکد پیش از چاپ بارکد داخلی می‌گیرند تا برچسب ناقص چاپ نشود.
   */
  async printData(orderIds: string[]) {
    const ids = [...new Set(orderIds)];
    const settings = await this.getSettings();
    const load = () =>
      this.prisma.shopOrder.findMany({
        where: { id: { in: ids } },
        include: {
          items: {
            include: {
              variant: { include: { product: true } },
              product: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          address: true,
          user: {
            select: {
              phone: true,
              identity: { select: { firstName: true, lastName: true } },
            },
          },
          shippings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { shippingMethod: { select: { name: true } } },
          },
        },
      });

    let orders = await load();
    const printable = orders.filter((o) =>
      PRINTABLE_STATUSES.includes(o.status),
    );

    if (settings.autoAssignBarcode) {
      const variantIds = new Set<string>();
      const productIds = new Set<string>();
      for (const o of printable) {
        for (const it of o.items) {
          if (it.variant && !it.variant.barcode) variantIds.add(it.variant.id);
          else if (!it.variant && it.product && !it.product.barcode) {
            productIds.add(it.product.id);
          }
        }
      }
      if (variantIds.size || productIds.size) {
        const reserved = new Set<string>();
        for (const id of variantIds) {
          await this.prisma.productVariant.updateMany({
            where: { id, barcode: null },
            data: {
              barcode: await this.uniqueEan(
                this.prisma,
                settings.eanPrefix,
                reserved,
              ),
            },
          });
        }
        for (const id of productIds) {
          await this.prisma.product.updateMany({
            where: { id, barcode: null },
            data: {
              barcode: await this.uniqueEan(
                this.prisma,
                settings.eanPrefix,
                reserved,
              ),
            },
          });
        }
        orders = await load();
      }
    }

    const byId = new Map(orders.map((o) => [o.id, o]));
    const result: ReturnType<typeof this.toPrintOrder>[] = [];
    const skipped: {
      id: string;
      orderNumber: string | null;
      reason: string;
    }[] = [];
    for (const id of ids) {
      const o = byId.get(id);
      if (!o) {
        skipped.push({ id, orderNumber: null, reason: 'سفارش یافت نشد' });
      } else if (!PRINTABLE_STATUSES.includes(o.status)) {
        skipped.push({
          id,
          orderNumber: o.orderNumber,
          reason:
            o.status === 'CANCELLED'
              ? 'سفارش لغو شده است'
              : 'سفارش هنوز پرداخت نشده است',
        });
      } else {
        result.push(this.toPrintOrder(o));
      }
    }

    return {
      sender: {
        name: settings.senderName,
        phone: settings.senderPhone,
        address: settings.senderAddress,
        postalCode: settings.senderPostalCode,
      },
      orders: result,
      skipped,
    };
  }

  private toPrintOrder(
    o: Prisma.ShopOrderGetPayload<{
      include: {
        items: {
          include: {
            variant: { include: { product: true } };
            product: true;
          };
        };
        address: true;
        user: {
          select: {
            phone: true;
            identity: { select: { firstName: true; lastName: true } };
          };
        };
        shippings: { include: { shippingMethod: { select: { name: true } } } };
      };
    }>,
  ) {
    const buyerName =
      `${o.user.identity?.firstName ?? ''} ${o.user.identity?.lastName ?? ''}`.trim();
    const s = o.shippings[0];
    const items = o.items.map((it) => {
      const product = it.variant?.product ?? it.product;
      const weight = Number(
        it.variant?.weightGrams ?? it.selectedWeightGrams ?? 0,
      );
      return {
        id: it.id,
        name: product?.name ?? '',
        sku: it.variant?.sku ?? null,
        barcode:
          it.variant?.barcode ?? (it.variant ? null : product?.barcode) ?? null,
        weightGrams: weight.toString(),
        quantity: it.quantity,
        karat: product?.purityKarat ? KARAT_FA[product.purityKarat] : '',
        packaging: it.packagingName ?? null,
      };
    });
    return {
      id: o.id,
      orderNumber: o.orderNumber ?? o.id.slice(0, 8),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      totalToman: (Number(o.totalRial) / 10).toString(),
      labelPrintCount: o.labelPrintCount,
      buyer: { name: buyerName || null, phone: o.user.phone },
      receiver: {
        name: o.address.receiverName || buyerName || null,
        phone: o.address.receiverPhone || o.user.phone,
      },
      address: {
        title: o.address.title,
        province: o.address.province,
        city: o.address.city,
        full: o.address.fullAddress,
        postalCode: o.address.postalCode,
      },
      shipping: s
        ? {
            method: s.shippingMethod?.name ?? s.carrierName,
            trackingCode: s.trackingCode,
            courierName: s.courierName,
          }
        : null,
      items,
    };
  }

  /** ثبت چاپ برچسب (شمارنده + زمان) — برای دیدن سفارش‌های بدون برچسب در فهرست */
  async logPrint(orderIds: string[]) {
    const { count } = await this.prisma.shopOrder.updateMany({
      where: { id: { in: [...new Set(orderIds)] } },
      data: {
        labelPrintCount: { increment: 1 },
        labelPrintedAt: new Date(),
      },
    });
    return { message: 'چاپ برچسب ثبت شد', count };
  }
}
