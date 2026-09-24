// api/src/discount/discount.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import Decimal from 'decimal.js';
import { DiscountCode, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { formatJalaliDate, toEnglishDigits } from '../common/utils/jalali.util';
import type {
  AdminDiscountUsagesQueryDto,
  AdminListDiscountCodesQueryDto,
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
} from './discount.dto';

type Db = Prisma.TransactionClient | PrismaService;

/** فرمت کد: بخش‌های حروف بزرگ/عدد که با خط تیره جدا شده‌اند، مثل ARKAN-482915 */
const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const CODE_MIN_LENGTH = 3;
const CODE_MAX_LENGTH = 32;
// حروف مبهم (I و O) حذف شده‌اند تا با ۱ و ۰ اشتباه گرفته نشوند
const PREFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** سفارش‌هایی که سهمیه کد را مصرف کرده‌اند (لغوشده‌ها سهمیه را آزاد می‌کنند) */
const COUNTED_ORDER: Prisma.ShopOrderWhereInput = {
  status: { not: 'CANCELLED' },
};
/** سفارش‌هایی که تخفیفشان واقعاً اعمال و پرداخت شده */
const SETTLED_STATUSES = [
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
] as const;

export type DiscountCodeStatus =
  'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SCHEDULED' | 'EXHAUSTED';

export interface DiscountEvaluation {
  discountCode: DiscountCode;
  subtotalRial: number;
  discountRial: number;
  totalRial: number;
}

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // ── کد: نرمال‌سازی و تولید خودکار ──
  // ═══════════════════════════════════════════════════════════

  /** حروف بزرگ، ارقام فارسی → انگلیسی، حذف فاصله‌ها */
  normalizeCode(raw: string): string {
    return toEnglishDigits(raw ?? '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  private assertCodeFormat(code: string) {
    if (
      code.length < CODE_MIN_LENGTH ||
      code.length > CODE_MAX_LENGTH ||
      !CODE_PATTERN.test(code)
    ) {
      throw new BadRequestException(
        `کد تخفیف باید ${CODE_MIN_LENGTH} تا ${CODE_MAX_LENGTH} کاراکتر و فقط شامل حروف بزرگ انگلیسی، عدد و خط تیره باشد (مثلاً ARKAN-1234)`,
      );
    }
  }

  private randomCode(prefix?: string): string {
    const letters = prefix
      ? prefix.toUpperCase()
      : Array.from(
          { length: 5 },
          () => PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)],
        ).join('');
    const digits = randomInt(0, 1_000_000).toString().padStart(6, '0');
    return `${letters}-${digits}`;
  }

  /** تولید یک کد یکتا با فرمت حروف بزرگ-عدد */
  async generateUniqueCode(prefix?: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.randomCode(prefix);
      const exists = await this.prisma.discountCode.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new ConflictException(
      'تولید کد یکتا ممکن نشد، لطفاً دوباره تلاش کنید یا پیشوند دیگری انتخاب کنید',
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ── بررسی و محاسبه تخفیف ──
  // ═══════════════════════════════════════════════════════════

  /** مبلغ تخفیف برای یک جمع سبد — به تومان کامل گرد می‌شود و هرگز از جمع سبد بیشتر نیست */
  computeDiscountRial(
    code: Pick<DiscountCode, 'type' | 'value' | 'maxDiscountRial'>,
    subtotalRial: number,
  ): number {
    const subtotal = new Decimal(subtotalRial);
    let discount =
      code.type === 'PERCENT'
        ? subtotal.times(code.value.toString()).dividedBy(100)
        : new Decimal(code.value.toString());

    if (code.type === 'PERCENT' && code.maxDiscountRial != null) {
      discount = Decimal.min(discount, code.maxDiscountRial.toString());
    }
    discount = Decimal.min(discount, subtotal);

    // مبالغ ریالی سیستم مضرب ۱۰ (تومان کامل) هستند
    const rounded = discount.dividedBy(10).floor().times(10);
    return Math.max(0, rounded.toNumber());
  }

  /**
   * اعتبارسنجی کامل کد برای یک کاربر و جمع سبد مشخص.
   * با lock=true ردیف کد قفل می‌شود تا شمارش سهمیه در ثبت همزمان سفارش‌ها
   * دقیق بماند — فقط داخل تراکنش ثبت سفارش استفاده شود.
   */
  async evaluate(
    db: Db,
    params: {
      code: string;
      userId: string;
      subtotalRial: number;
      lock?: boolean;
    },
  ): Promise<DiscountEvaluation> {
    const code = this.normalizeCode(params.code);
    if (!code) throw new BadRequestException('کد تخفیف را وارد کنید');

    if (params.lock) {
      await db.$executeRaw`SELECT 1 FROM "discount_codes" WHERE "code" = ${code} FOR UPDATE`;
    }

    const discountCode = await db.discountCode.findUnique({ where: { code } });
    if (!discountCode) {
      throw new BadRequestException('کد تخفیف نامعتبر است');
    }

    const now = new Date();
    if (!discountCode.isActive) {
      throw new BadRequestException('این کد تخفیف غیرفعال است');
    }
    if (discountCode.startsAt && discountCode.startsAt > now) {
      throw new BadRequestException(
        `این کد تخفیف از ${formatJalaliDate(discountCode.startsAt)} قابل استفاده است`,
      );
    }
    if (discountCode.expiresAt && discountCode.expiresAt <= now) {
      throw new BadRequestException(
        'مهلت استفاده از این کد تخفیف تمام شده است',
      );
    }
    if (discountCode.userId && discountCode.userId !== params.userId) {
      throw new BadRequestException('این کد تخفیف برای حساب شما معتبر نیست');
    }

    if (
      discountCode.minOrderRial != null &&
      new Decimal(params.subtotalRial).lessThan(
        discountCode.minOrderRial.toString(),
      )
    ) {
      const minToman = new Decimal(discountCode.minOrderRial.toString())
        .dividedBy(10)
        .toNumber()
        .toLocaleString('fa-IR');
      throw new BadRequestException(
        `حداقل مبلغ خرید برای استفاده از این کد ${minToman} تومان است`,
      );
    }

    if (discountCode.usageLimit != null) {
      const used = await db.shopOrder.count({
        where: { discountCodeId: discountCode.id, ...COUNTED_ORDER },
      });
      if (used >= discountCode.usageLimit) {
        throw new BadRequestException(
          'ظرفیت استفاده از این کد تخفیف تکمیل شده است',
        );
      }
    }

    if (discountCode.perUserLimit != null) {
      const usedByUser = await db.shopOrder.count({
        where: {
          discountCodeId: discountCode.id,
          userId: params.userId,
          ...COUNTED_ORDER,
        },
      });
      if (usedByUser >= discountCode.perUserLimit) {
        throw new BadRequestException(
          discountCode.perUserLimit === 1
            ? 'شما قبلاً از این کد تخفیف استفاده کرده‌اید'
            : `سقف استفاده شما از این کد تخفیف (${discountCode.perUserLimit.toLocaleString('fa-IR')} بار) تکمیل شده است`,
        );
      }
    }

    const discountRial = this.computeDiscountRial(
      discountCode,
      params.subtotalRial,
    );
    if (discountRial <= 0) {
      throw new BadRequestException(
        'این کد تخفیف برای مبلغ سبد خرید شما تخفیفی ایجاد نمی‌کند',
      );
    }

    return {
      discountCode,
      subtotalRial: params.subtotalRial,
      discountRial,
      totalRial: params.subtotalRial - discountRial,
    };
  }

  /**
   * کدهای تخفیف اختصاصی قابل استفاده کاربر (برای نمایش در سبد خرید).
   * کدهای عمومی عمداً فهرست نمی‌شوند؛ آن‌ها از طریق کمپین‌ها منتشر می‌شوند.
   */
  async listForUser(userId: string) {
    const now = new Date();
    const codes = await this.prisma.discountCode.findMany({
      where: {
        userId,
        isActive: true,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        ],
      },
      include: {
        _count: { select: { shopOrders: { where: COUNTED_ORDER } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // کد اختصاصی فقط توسط همین کاربر استفاده می‌شود، پس شمارش کل = شمارش کاربر
    return codes
      .filter((c) => {
        const used = c._count.shopOrders;
        if (c.usageLimit != null && used >= c.usageLimit) return false;
        if (c.perUserLimit != null && used >= c.perUserLimit) return false;
        return true;
      })
      .map((c) => ({
        code: c.code,
        description: c.description,
        valueLabel: this.describeValue(c),
        minOrderToman:
          c.minOrderRial != null ? this.toToman(c.minOrderRial) : null,
        expiresAt: c.expiresAt?.toISOString() ?? null,
      }));
  }

  /** پیش‌نمایش اعمال کد روی سبد فعلی کاربر (بدون رزرو سهمیه) */
  async previewForCart(userId: string, rawCode: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('سبد خرید شما خالی است');
    }

    const subtotalRial = cart.items.reduce(
      (sum, item) =>
        sum + Number(item.lockedUnitPriceRial ?? 0) * item.quantity,
      0,
    );

    const result = await this.evaluate(this.prisma, {
      code: rawCode,
      userId,
      subtotalRial,
    });

    return {
      code: result.discountCode.code,
      description: result.discountCode.description,
      type: result.discountCode.type,
      value: result.discountCode.value.toString(),
      subtotalToman: this.toToman(result.subtotalRial),
      discountToman: this.toToman(result.discountRial),
      totalToman: this.toToman(result.totalRial),
      expiresAt: result.discountCode.expiresAt?.toISOString() ?? null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ── مدیریت ادمین ──
  // ═══════════════════════════════════════════════════════════

  private statusOf(
    code: DiscountCode,
    usedCount: number,
    now = new Date(),
  ): DiscountCodeStatus {
    if (!code.isActive) return 'INACTIVE';
    if (code.expiresAt && code.expiresAt <= now) return 'EXPIRED';
    if (code.startsAt && code.startsAt > now) return 'SCHEDULED';
    if (code.usageLimit != null && usedCount >= code.usageLimit)
      return 'EXHAUSTED';
    return 'ACTIVE';
  }

  private statusWhere(
    status: AdminListDiscountCodesQueryDto['status'],
  ): Prisma.DiscountCodeWhereInput {
    const now = new Date();
    switch (status) {
      case 'ACTIVE':
        return {
          isActive: true,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          ],
        };
      case 'INACTIVE':
        return { isActive: false };
      case 'EXPIRED':
        return { expiresAt: { lte: now } };
      case 'SCHEDULED':
        return { isActive: true, startsAt: { gt: now } };
      default:
        return {};
    }
  }

  async adminList(query: AdminListDiscountCodesQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const search = query.search?.trim();

    const where: Prisma.DiscountCodeWhereInput = {
      ...this.statusWhere(query.status),
      ...(search
        ? {
            OR: [
              {
                code: {
                  contains: this.normalizeCode(search),
                  mode: 'insensitive',
                },
              },
              { description: { contains: search, mode: 'insensitive' } },
              { user: { phone: { contains: toEnglishDigits(search) } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.discountCode.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { shopOrders: { where: COUNTED_ORDER } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.discountCode.count({ where }),
    ]);

    const settled = rows.length
      ? await this.prisma.shopOrder.groupBy({
          by: ['discountCodeId'],
          where: {
            discountCodeId: { in: rows.map((r) => r.id) },
            status: { in: [...SETTLED_STATUSES] },
          },
          _sum: { discountRial: true },
          _count: { _all: true },
        })
      : [];
    const settledMap = new Map(settled.map((s) => [s.discountCodeId, s]));

    const now = new Date();
    return {
      data: rows.map((r) => {
        const s = settledMap.get(r.id);
        return {
          ...this.toAdminDto(r),
          user: r.user,
          createdBy: r.createdBy,
          usedCount: r._count.shopOrders,
          paidCount: s?._count._all ?? 0,
          totalDiscountToman: this.toToman(s?._sum.discountRial ?? 0),
          status: this.statusOf(r, r._count.shopOrders, now),
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** آمار کلی برای کارت‌های بالای صفحه ادمین */
  async adminStats() {
    const now = new Date();
    const [totalCodes, activeCodes, settled] = await Promise.all([
      this.prisma.discountCode.count(),
      this.prisma.discountCode.count({ where: this.statusWhere('ACTIVE') }),
      this.prisma.shopOrder.aggregate({
        where: {
          discountCodeId: { not: null },
          status: { in: [...SETTLED_STATUSES] },
        },
        _sum: { discountRial: true, totalRial: true },
        _count: { _all: true },
      }),
    ]);

    return {
      totalCodes,
      activeCodes,
      paidOrdersWithDiscount: settled._count._all,
      totalDiscountToman: this.toToman(settled._sum.discountRial ?? 0),
      totalNetSalesToman: this.toToman(settled._sum.totalRial ?? 0),
      generatedAt: now.toISOString(),
    };
  }

  async adminUsages(id: string, query: AdminDiscountUsagesQueryDto) {
    const code = await this.prisma.discountCode.findUnique({ where: { id } });
    if (!code) throw new NotFoundException('کد تخفیف یافت نشد');

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.ShopOrderWhereInput = { discountCodeId: id };

    const [orders, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: { user: { select: { id: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);

    const invoices = orders.length
      ? await this.prisma.invoice.findMany({
          where: {
            sourceType: 'SHOP_ORDER',
            kind: 'INVOICE',
            sourceId: { in: orders.map((o) => o.id) },
          },
          select: { id: true, sourceId: true, invoiceNumber: true },
        })
      : [];
    const invoiceMap = new Map(invoices.map((i) => [i.sourceId, i]));

    return {
      code: this.toAdminDto(code),
      data: orders.map((o) => ({
        orderId: o.id,
        status: o.status,
        user: o.user,
        subtotalToman: this.toToman(o.subtotalRial),
        discountToman: this.toToman(o.discountRial),
        totalToman: this.toToman(o.totalRial),
        invoiceId: invoiceMap.get(o.id)?.id ?? null,
        invoiceNumber: invoiceMap.get(o.id)?.invoiceNumber ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** قواعد مشترک ایجاد/ویرایش روی وضعیت نهایی رکورد */
  private assertRules(data: {
    type: 'PERCENT' | 'FIXED';
    value: number;
    maxDiscountRial: number | null;
    minOrderRial: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
  }) {
    if (data.type === 'PERCENT') {
      if (!(data.value > 0 && data.value <= 100)) {
        throw new BadRequestException('درصد تخفیف باید بین ۰ تا ۱۰۰ باشد');
      }
    } else {
      if (!Number.isInteger(data.value) || data.value < 10) {
        throw new BadRequestException(
          'مبلغ تخفیف ثابت باید حداقل ۱ تومان و بدون اعشار باشد',
        );
      }
      if (data.value % 10 !== 0) {
        throw new BadRequestException('مبلغ تخفیف باید به تومان کامل باشد');
      }
    }
    if (data.maxDiscountRial != null && data.maxDiscountRial % 10 !== 0) {
      throw new BadRequestException('سقف تخفیف باید به تومان کامل باشد');
    }
    if (data.minOrderRial != null && data.minOrderRial % 10 !== 0) {
      throw new BadRequestException('حداقل مبلغ خرید باید به تومان کامل باشد');
    }
    if (
      data.startsAt &&
      data.expiresAt &&
      data.expiresAt.getTime() <= data.startsAt.getTime()
    ) {
      throw new BadRequestException('تاریخ انقضا باید بعد از تاریخ شروع باشد');
    }
  }

  private async assertUserExists(userId: string | null | undefined) {
    if (!userId) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('کاربر انتخاب‌شده یافت نشد');
  }

  private parseDate(v: string | null | undefined): Date | null {
    return v ? new Date(v) : null;
  }

  async create(adminUserId: string, dto: CreateDiscountCodeDto) {
    const code = dto.code?.trim()
      ? this.normalizeCode(dto.code)
      : await this.generateUniqueCode(dto.codePrefix);
    this.assertCodeFormat(code);

    const startsAt = this.parseDate(dto.startsAt);
    const expiresAt = this.parseDate(dto.expiresAt);
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('تاریخ انقضا باید در آینده باشد');
    }

    const maxDiscountRial =
      dto.type === 'PERCENT' ? (dto.maxDiscountRial ?? null) : null;
    this.assertRules({
      type: dto.type,
      value: dto.value,
      maxDiscountRial,
      minOrderRial: dto.minOrderRial ?? null,
      startsAt,
      expiresAt,
    });
    await this.assertUserExists(dto.userId);

    const exists = await this.prisma.discountCode.findUnique({
      where: { code },
      select: { id: true },
    });
    if (exists) throw new ConflictException('این کد تخفیف قبلاً ثبت شده است');

    const created = await this.prisma.discountCode.create({
      data: {
        code,
        description: dto.description?.trim() || null,
        type: dto.type,
        value: dto.value,
        maxDiscountRial,
        minOrderRial: dto.minOrderRial ?? null,
        startsAt,
        expiresAt,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit === undefined ? 1 : dto.perUserLimit,
        userId: dto.userId || null,
        isActive: dto.isActive ?? true,
        createdById: adminUserId,
      },
    });

    if (created.userId && dto.notifyUser && created.isActive) {
      await this.notifications.notifyUserSms(
        created.userId,
        this.userNotificationText(created),
      );
    }

    this.logger.log(`[Discount] کد ${created.code} ایجاد شد`);
    return this.toAdminDto(created);
  }

  async update(id: string, dto: UpdateDiscountCodeDto) {
    const current = await this.prisma.discountCode.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('کد تخفیف یافت نشد');

    let code = current.code;
    if (dto.code !== undefined) {
      code = this.normalizeCode(dto.code);
      this.assertCodeFormat(code);
      if (code !== current.code) {
        const clash = await this.prisma.discountCode.findUnique({
          where: { code },
          select: { id: true },
        });
        if (clash)
          throw new ConflictException('این کد تخفیف قبلاً ثبت شده است');
      }
    }

    const type = dto.type ?? current.type;
    const value = dto.value ?? Number(current.value);
    const maxDiscountRial =
      type === 'PERCENT'
        ? dto.maxDiscountRial !== undefined
          ? dto.maxDiscountRial
          : current.maxDiscountRial != null
            ? Number(current.maxDiscountRial)
            : null
        : null;
    const minOrderRial =
      dto.minOrderRial !== undefined
        ? dto.minOrderRial
        : current.minOrderRial != null
          ? Number(current.minOrderRial)
          : null;
    const startsAt =
      dto.startsAt !== undefined
        ? this.parseDate(dto.startsAt)
        : current.startsAt;
    const expiresAt =
      dto.expiresAt !== undefined
        ? this.parseDate(dto.expiresAt)
        : current.expiresAt;

    this.assertRules({
      type,
      value,
      maxDiscountRial,
      minOrderRial,
      startsAt,
      expiresAt,
    });
    if (dto.userId !== undefined) await this.assertUserExists(dto.userId);

    const updated = await this.prisma.discountCode.update({
      where: { id },
      data: {
        code,
        type,
        value,
        maxDiscountRial,
        minOrderRial,
        startsAt,
        expiresAt,
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
        ...(dto.perUserLimit !== undefined
          ? { perUserLimit: dto.perUserLimit }
          : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.toAdminDto(updated);
  }

  async remove(id: string) {
    const code = await this.prisma.discountCode.findUnique({
      where: { id },
      include: { _count: { select: { shopOrders: true } } },
    });
    if (!code) throw new NotFoundException('کد تخفیف یافت نشد');

    if (code._count.shopOrders > 0) {
      throw new ConflictException(
        'این کد در سفارش‌ها استفاده شده و برای حفظ سوابق مالی قابل حذف نیست؛ آن را غیرفعال کنید',
      );
    }

    await this.prisma.discountCode.delete({ where: { id } });
    return { message: 'کد تخفیف حذف شد' };
  }

  // ═══════════════════════════════════════════════════════════
  // ── کمکی‌ها ──
  // ═══════════════════════════════════════════════════════════

  describeValue(
    code: Pick<DiscountCode, 'type' | 'value' | 'maxDiscountRial'>,
  ) {
    if (code.type === 'PERCENT') {
      const percent = Number(code.value).toLocaleString('fa-IR');
      const cap =
        code.maxDiscountRial != null
          ? ` (تا سقف ${this.tomanFa(code.maxDiscountRial)} تومان)`
          : '';
      return `${percent}٪ تخفیف${cap}`;
    }
    return `${this.tomanFa(code.value)} تومان تخفیف`;
  }

  private userNotificationText(code: DiscountCode) {
    const until = code.expiresAt
      ? ` — معتبر تا ${formatJalaliDate(code.expiresAt)}`
      : '';
    return `آرکان گلد: کد تخفیف ${code.code} ویژه شما صادر شد؛ ${this.describeValue(code)} برای خرید از فروشگاه${until}`;
  }

  private tomanFa(rial: Prisma.Decimal | number) {
    return new Decimal(rial.toString())
      .dividedBy(10)
      .toNumber()
      .toLocaleString('fa-IR');
  }

  private toToman(rial: Prisma.Decimal | number | null) {
    if (rial == null) return '0';
    return new Decimal(rial.toString()).dividedBy(10).toString();
  }

  private toAdminDto(code: DiscountCode) {
    return {
      id: code.id,
      code: code.code,
      description: code.description,
      type: code.type,
      value: code.value.toString(),
      maxDiscountToman:
        code.maxDiscountRial != null
          ? this.toToman(code.maxDiscountRial)
          : null,
      minOrderToman:
        code.minOrderRial != null ? this.toToman(code.minOrderRial) : null,
      startsAt: code.startsAt?.toISOString() ?? null,
      expiresAt: code.expiresAt?.toISOString() ?? null,
      usageLimit: code.usageLimit,
      perUserLimit: code.perUserLimit,
      isActive: code.isActive,
      userId: code.userId,
      valueLabel: this.describeValue(code),
      createdAt: code.createdAt.toISOString(),
      updatedAt: code.updatedAt.toISOString(),
    };
  }
}
