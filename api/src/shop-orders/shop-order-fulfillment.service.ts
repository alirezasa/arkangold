// api/src/shop-orders/shop-order-fulfillment.service.ts
//
// ارسال و تحویل سفارش فروشگاه:
//   - مراجع ارسال (پست، پیک، پست خصوصی، تحویل حضوری) قابل تعریف در پنل
//   - هنگام ارسال: کد تحویل ۶ رقمی برای مشتری پیامک می‌شود (و در اپ کاربر نمایش داده می‌شود)
//   - تحویل فقط با کد مشتری تأیید می‌شود: توسط ادمین (پنل) یا پیک (لینک یکتای پیامک‌شده)
//   - تأیید تحویل بدون کد فقط با مجوز جداگانه و ثبت دلیل (ADMIN_OVERRIDE)
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Prisma, ShippingMethodType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { ZarPayeshShopOrderService } from '../zarpayesh/zarpayesh-shop-order.service';
import { HologramService } from '../hologram/hologram.service';
import {
  ORDER_STATUS_FA,
  ShopOrderEventsService,
} from './shop-order-events.service';

/** مسیر تأیید دریافت مرسوله (shippings.delivery_confirmed_via / shop_orders.delivery_code_verified_via) */
export type DeliveryConfirmVia =
  'DELIVERY_CODE' | 'COURIER_LINK' | 'USER_APP' | 'ADMIN_OVERRIDE';

/** سقف تلاش ناموفق ورود کد تحویل؛ پس از آن باید کد جدید صادر شود */
export const MAX_DELIVERY_CODE_ATTEMPTS = 5;
const COURIER_LINK_TTL_DAYS = 14;

export interface ShippingMethodInput {
  code?: string;
  name?: string;
  type?: ShippingMethodType;
  description?: string | null;
  trackingUrlTemplate?: string | null;
  requiresTrackingCode?: boolean;
  requiresDeliveryCode?: boolean;
  courierLinkEnabled?: boolean;
  estimatedDays?: number | null;
  contactPhone?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  carrierId?: string | null;
  availableAtCheckout?: boolean;
  requiresPostalCode?: boolean;
  pickupAddress?: string | null;
  pickupHours?: string | null;
}

export interface ShipOrderInput {
  shippingMethodId: string;
  trackingCode?: string;
  estimatedDelivery?: string;
  courierName?: string;
  courierPhone?: string;
  note?: string;
}

const DEFAULT_METHODS: (ShippingMethodInput & {
  code: string;
  name: string;
  type: ShippingMethodType;
})[] = [
  {
    code: 'POST_PISHTAZ',
    name: 'پست پیشتاز',
    type: 'POST',
    description:
      'ارسال بیمه‌شده با پست جمهوری اسلامی؛ تحویل با ارائه‌ی کد تحویل به نامه‌رسان',
    requiresTrackingCode: true,
    requiresDeliveryCode: true,
    courierLinkEnabled: false,
    estimatedDays: 3,
    sortOrder: 1,
  },
  {
    code: 'COURIER',
    name: 'پیک اختصاصی',
    type: 'COURIER',
    description:
      'ارسال درون‌شهری با پیک؛ پیک کد تحویل مشتری را در لینک پیامک‌شده ثبت می‌کند',
    requiresTrackingCode: false,
    requiresDeliveryCode: true,
    courierLinkEnabled: true,
    estimatedDays: 1,
    sortOrder: 2,
  },
  {
    code: 'EXPRESS',
    name: 'پست خصوصی (تیپاکس)',
    type: 'EXPRESS',
    requiresTrackingCode: true,
    requiresDeliveryCode: true,
    courierLinkEnabled: false,
    estimatedDays: 2,
    sortOrder: 3,
  },
  {
    code: 'PICKUP',
    name: 'تحویل حضوری در دفتر',
    type: 'PICKUP',
    description: 'مشتری با کارت ملی و کد تحویل مراجعه می‌کند',
    requiresTrackingCode: false,
    requiresDeliveryCode: true,
    courierLinkEnabled: false,
    sortOrder: 4,
  },
];

@Injectable()
export class ShopOrderFulfillmentService implements OnModuleInit {
  private readonly logger = new Logger(ShopOrderFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ShopOrderEventsService,
    /** سامانه ناظر (زر پایش): ارسال دارایی سفارش‌های تحویل طلای آب‌شده */
    @Optional() private readonly zarpayesh?: ZarPayeshShopOrderService,
    /** ثبت شمش‌ها به نام مالک پس از تأیید کد تحویل */
    @Optional() private readonly hologram?: HologramService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.prisma.shippingMethod.count();
      if (count > 0) return;
      for (const m of DEFAULT_METHODS) {
        await this.prisma.shippingMethod.create({ data: m });
      }
      this.logger.log(
        `[Shop] ${DEFAULT_METHODS.length} مرجع ارسال پیش‌فرض ساخته شد`,
      );
    } catch (err) {
      this.logger.error(
        `[Shop] ساخت مراجع ارسال پیش‌فرض ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  // ═══════════════════════ مراجع ارسال ═══════════════════════

  async listMethods(activeOnly = false) {
    const rows = await this.prisma.shippingMethod.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        carrier: { select: { id: true, name: true, isActive: true } },
        _count: { select: { shippings: true, rates: true } },
      },
    });
    return rows.map(({ _count, ...m }) => ({
      ...m,
      shipmentCount: _count.shippings,
      rateCount: _count.rates,
    }));
  }

  async createMethod(dto: ShippingMethodInput) {
    if (!dto.code || !dto.name || !dto.type) {
      throw new BadRequestException('کد، نام و نوع مرجع ارسال الزامی است');
    }
    await this.validateMethod(dto);
    const code = dto.code.trim().toUpperCase();
    const exists = await this.prisma.shippingMethod.findUnique({
      where: { code },
    });
    if (exists) throw new ConflictException('این کد قبلاً استفاده شده است');
    const row = await this.prisma.shippingMethod.create({
      data: {
        ...this.cleanMethod(dto),
        code,
        name: dto.name.trim(),
        type: dto.type,
      },
    });
    return { message: 'مرجع ارسال ایجاد شد', method: row };
  }

  async updateMethod(id: string, dto: ShippingMethodInput) {
    const row = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('مرجع ارسال یافت نشد');
    await this.validateMethod(dto);
    const updated = await this.prisma.shippingMethod.update({
      where: { id },
      data: {
        ...this.cleanMethod(dto),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.type ? { type: dto.type } : {}),
      },
    });
    return { message: 'مرجع ارسال ذخیره شد', method: updated };
  }

  private async validateMethod(dto: ShippingMethodInput) {
    if (dto.carrierId) {
      const carrier = await this.prisma.shippingCarrier.findUnique({
        where: { id: dto.carrierId },
      });
      if (!carrier)
        throw new BadRequestException('شرکت حمل انتخاب‌شده یافت نشد');
    }
    if (
      dto.code !== undefined &&
      !/^[A-Za-z0-9_-]{2,30}$/.test(dto.code.trim())
    ) {
      throw new BadRequestException(
        'کد فقط شامل حروف انگلیسی، عدد، خط تیره و زیرخط (۲ تا ۳۰ کاراکتر)',
      );
    }
    if (dto.trackingUrlTemplate) {
      const t = dto.trackingUrlTemplate.trim();
      if (!/^https?:\/\//.test(t) || !t.includes('{code}')) {
        throw new BadRequestException(
          'نشانی رهگیری باید با http شروع شود و {code} را داشته باشد',
        );
      }
    }
    if (dto.contactPhone && !/^[0-9+\-\s]{5,20}$/.test(dto.contactPhone)) {
      throw new BadRequestException('شماره تماس نامعتبر است');
    }
  }

  private cleanMethod(
    dto: ShippingMethodInput,
  ): Partial<
    Omit<
      Prisma.ShippingMethodUncheckedCreateInput,
      'id' | 'code' | 'name' | 'type'
    >
  > {
    return {
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.trackingUrlTemplate !== undefined
        ? { trackingUrlTemplate: dto.trackingUrlTemplate?.trim() || null }
        : {}),
      ...(dto.requiresTrackingCode !== undefined
        ? { requiresTrackingCode: dto.requiresTrackingCode }
        : {}),
      ...(dto.requiresDeliveryCode !== undefined
        ? { requiresDeliveryCode: dto.requiresDeliveryCode }
        : {}),
      ...(dto.courierLinkEnabled !== undefined
        ? { courierLinkEnabled: dto.courierLinkEnabled }
        : {}),
      ...(dto.estimatedDays !== undefined
        ? { estimatedDays: dto.estimatedDays }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { contactPhone: dto.contactPhone?.trim() || null }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.carrierId !== undefined
        ? { carrierId: dto.carrierId || null }
        : {}),
      ...(dto.availableAtCheckout !== undefined
        ? { availableAtCheckout: dto.availableAtCheckout }
        : {}),
      ...(dto.requiresPostalCode !== undefined
        ? { requiresPostalCode: dto.requiresPostalCode }
        : {}),
      ...(dto.pickupAddress !== undefined
        ? { pickupAddress: dto.pickupAddress?.trim() || null }
        : {}),
      ...(dto.pickupHours !== undefined
        ? { pickupHours: dto.pickupHours?.trim() || null }
        : {}),
    };
  }

  // ═══════════════════════ ارسال ═══════════════════════

  async ship(orderId: string, dto: ShipOrderInput, adminId: string) {
    const method = await this.prisma.shippingMethod.findUnique({
      where: { id: dto.shippingMethodId },
    });
    if (!method || !method.isActive) {
      throw new BadRequestException('مرجع ارسال انتخاب‌شده معتبر یا فعال نیست');
    }
    const trackingCode = dto.trackingCode?.trim() || null;
    if (method.requiresTrackingCode && !trackingCode) {
      throw new BadRequestException(
        `برای «${method.name}» کد رهگیری مرسوله الزامی است`,
      );
    }
    let courierPhone: string | null = null;
    if (dto.courierPhone?.trim()) {
      courierPhone = normalizeIranMobile(dto.courierPhone);
      if (!courierPhone)
        throw new BadRequestException('شماره موبایل پیک نامعتبر است');
    }
    if (method.courierLinkEnabled && !courierPhone) {
      throw new BadRequestException(
        'برای ارسال با پیک، شماره موبایل پیک را وارد کنید',
      );
    }

    // سفارش تحویل طلای آب‌شده: پیش از ارسال باید در سامانه ناظر ثبت شده باشد؛ در این حالت کد تحویل
    // همان approveCode است که سامانه ناظر مستقیم برای مشتری پیامک کرده (کد آرکان صادر نمی‌شود)
    const zarpayeshCode = this.zarpayesh
      ? await this.zarpayesh.prepareShipment(orderId, adminId)
      : false;
    // قانون تحویل: هر مرسوله کد تحویل دارد (شمش فقط پس از ارائه/ثبت آن به نام مالک ثبت می‌شود)
    const deliveryCode = !zarpayeshCode
      ? String(randomInt(0, 1_000_000)).padStart(6, '0')
      : null;
    const courierToken =
      method.courierLinkEnabled && courierPhone
        ? randomBytes(24).toString('base64url')
        : null;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.shopOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('سفارش یافت نشد');
      if (order.status === 'SHIPPED') {
        return { alreadyProcessed: true as const };
      }
      if (order.status !== 'PROCESSING' && order.status !== 'PAID') {
        throw new ConflictException(
          `سفارش در وضعیت «${ORDER_STATUS_FA[order.status]}» قابل ارسال نیست`,
        );
      }

      // سفارش پرداخت‌شده‌ای که مستقیماً ارسال می‌شود، مرحله‌ی آماده‌سازی را هم در Timeline ثبت می‌کند
      if (order.status === 'PAID') {
        await this.events.recordStatus(tx, orderId, 'PAID', 'PROCESSING', {
          type: 'ADMIN',
          id: adminId,
        });
      }

      await tx.shipping.create({
        data: {
          shopOrderId: orderId,
          shippingMethodId: method.id,
          carrierName: method.name,
          trackingCode,
          estimatedDelivery: dto.estimatedDelivery
            ? new Date(dto.estimatedDelivery)
            : null,
          courierName: dto.courierName?.trim() || null,
          courierPhone,
          deliveryCodeEnc: deliveryCode
            ? await this.events.encryptDeliveryCode(orderId, deliveryCode)
            : null,
          deliveryCodeSentAt: deliveryCode ? new Date() : null,
          deliveryCodeSource: zarpayeshCode ? 'ZARPAYESH' : null,
          courierTokenHash: courierToken ? this.hashToken(courierToken) : null,
          courierTokenExpiresAt: courierToken
            ? new Date(Date.now() + COURIER_LINK_TTL_DAYS * 86_400_000)
            : null,
          deliveryNote: dto.note?.trim() || null,
          shippedByAdminId: adminId,
          status: 'IN_TRANSIT',
        },
      });

      const now = new Date();
      await tx.shopOrder.update({
        where: { id: orderId },
        data: {
          status: 'SHIPPED',
          trackingCode: trackingCode ?? order.trackingCode,
          shippedAt: now,
          processingAt: order.processingAt ?? now,
        },
      });
      // ارسال با روشی غیر از انتخاب مشتری در Timeline ثبت می‌شود (هزینه‌ی دریافتی تغییر نمی‌کند)
      const changed =
        order.shippingMethodId && order.shippingMethodId !== method.id
          ? ` (به‌جای «${order.shippingMethodName}» انتخابی مشتری)`
          : '';
      const cod = order.shippingPayOnDelivery ? ' — پس‌کرایه' : '';
      await this.events.recordStatus(
        tx,
        orderId,
        'PROCESSING',
        'SHIPPED',
        { type: 'ADMIN', id: adminId },
        `${method.name}${changed}${cod}${trackingCode ? ` — کد رهگیری ${trackingCode}` : ''}`,
      );
      return { alreadyProcessed: false as const };
    });

    if (result.alreadyProcessed) {
      return {
        message: 'این سفارش قبلاً ارسال شده است',
        alreadyProcessed: true,
      };
    }

    await this.events.notify(orderId, 'SHIPPED');
    if (zarpayeshCode) {
      void this.zarpayesh.afterShipped(orderId, method.type, adminId);
    }
    if (courierToken && courierPhone) {
      await this.events.notifyCourier(
        orderId,
        courierPhone,
        this.courierLink(courierToken),
      );
    }
    return {
      message: zarpayeshCode
        ? 'سفارش ارسال شد؛ کد تحویل را سامانه ناظر (زر پایش) برای مشتری پیامک کرده است'
        : deliveryCode
          ? 'سفارش ارسال شد و کد تحویل برای مشتری پیامک شد'
          : 'اطلاعات ارسال ثبت شد',
      alreadyProcessed: false,
    };
  }

  // ═══════════════════════ تحویل ═══════════════════════

  /** تأیید تحویل توسط ادمین با کد تحویل مشتری */
  async deliverWithCode(
    orderId: string,
    code: string | undefined,
    adminId: string,
    receivedByName?: string,
  ) {
    return this.confirmDelivery(orderId, {
      code,
      via: 'DELIVERY_CODE',
      actor: { type: 'ADMIN', id: adminId },
      receivedByName,
    });
  }

  /** تأیید تحویل بدون کد — فقط با مجوز shop.delivery.override و ثبت دلیل */
  async deliverOverride(
    orderId: string,
    reason: string,
    adminId: string,
    receivedByName?: string,
  ) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'دلیل تأیید تحویل بدون کد را (حداقل ۱۰ کاراکتر) وارد کنید',
      );
    }
    return this.confirmDelivery(orderId, {
      via: 'ADMIN_OVERRIDE',
      actor: { type: 'ADMIN', id: adminId },
      receivedByName,
      note: reason.trim(),
    });
  }

  /**
   * تأیید دریافت مرسوله.
   *
   * قانون تحویل: شمش‌های سفارش فقط وقتی به نام مالک ثبت می‌شوند که مشتری کد تحویل را ارائه کرده (ادمین یا
   * پیک وارد کرده) یا خودش در اپ ثبت کرده باشد. کد تحویل آرکان است، یا برای تبدیل طلای آب‌شده به شمش کدی
   * که سامانه ناظر (زر پایش) پیامک کرده. «تأیید بدون کد» (ADMIN_OVERRIDE) سفارش را تحویل‌شده می‌کند ولی
   * شمش‌ها در انتظار کد تحویل می‌مانند تا مشتری بعداً کد را ارائه/ثبت کند (همین متد با سفارش DELIVERED).
   */
  private async confirmDelivery(
    orderId: string,
    p: {
      code?: string;
      via: DeliveryConfirmVia;
      actor: { type: 'ADMIN' | 'COURIER' | 'USER'; id?: string | null };
      receivedByName?: string;
      note?: string;
    },
  ) {
    const zarpayeshMode =
      !!this.zarpayesh && (await this.zarpayesh.usesZarPayeshCode(orderId));
    let zarpayeshApproved = false;
    if (zarpayeshMode && p.via !== 'ADMIN_OVERRIDE') {
      const early = await this.approveWithZarPayesh(orderId, p);
      if (early) return early;
      zarpayeshApproved = true;
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "shop_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: {
          shippings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { shippingMethod: true },
          },
        },
      });
      if (!order) throw new NotFoundException('سفارش یافت نشد');
      // سفارش تحویل‌شده (بدون کد) که هنوز کد تحویلش ثبت نشده: فقط ثبت کد و مالکیت
      const lateVerify =
        order.status === 'DELIVERED' &&
        !order.deliveryCodeVerifiedAt &&
        p.via !== 'ADMIN_OVERRIDE';
      if (order.status === 'DELIVERED' && !lateVerify) {
        return { kind: 'already' as const };
      }
      if (order.status !== 'SHIPPED' && !lateVerify) {
        throw new ConflictException('این سفارش هنوز ارسال نشده است');
      }
      const shipping = order.shippings[0];
      const codeRequired = !!shipping?.deliveryCodeEnc;

      if (p.via !== 'ADMIN_OVERRIDE' && codeRequired) {
        if (shipping.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS) {
          throw new ForbiddenException(
            'کد تحویل به‌دلیل ورود نادرست مکرر قفل شده است؛ کد جدید برای مشتری صادر کنید',
          );
        }
        const expected = await this.events.decryptDeliveryCode(
          orderId,
          shipping.deliveryCodeEnc,
        );
        const given = (p.code ?? '')
          .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
          .replace(/\D/g, '');
        if (!expected || !this.safeEqual(expected, given)) {
          await tx.shipping.update({
            where: { id: shipping.id },
            data: { deliveryCodeAttempts: { increment: 1 } },
          });
          return {
            kind: 'wrong' as const,
            remaining: Math.max(
              0,
              MAX_DELIVERY_CODE_ATTEMPTS - shipping.deliveryCodeAttempts - 1,
            ),
          };
        }
      }
      if (lateVerify && !codeRequired && !zarpayeshApproved) {
        throw new ConflictException(
          'برای این مرسوله کد تحویلی صادر نشده است؛ ابتدا «صدور کد جدید» را بزنید تا مشتری کد را ثبت کند',
        );
      }

      const now = new Date();
      const viaFa =
        p.via === 'COURIER_LINK'
          ? 'ثبت پیک با کد تحویل مشتری'
          : p.via === 'DELIVERY_CODE'
            ? 'تأیید با کد تحویل مشتری'
            : p.via === 'USER_APP'
              ? 'ثبت کد تحویل توسط خود مشتری در اپ'
              : `تأیید بدون کد: ${p.note ?? ''}`;
      if (!lateVerify) {
        if (shipping) {
          await tx.shipping.update({
            where: { id: shipping.id },
            data: {
              status: 'DELIVERED',
              deliveredAt: now,
              deliveryConfirmedVia: p.via,
              receivedByName: p.receivedByName?.trim() || null,
              deliveredByAdminId:
                p.actor.type === 'ADMIN' ? (p.actor.id ?? null) : null,
              // لینک پیک پس از تحویل بی‌اثر می‌شود
              courierTokenExpiresAt: now,
            },
          });
        }
        await tx.shopOrder.update({
          where: { id: orderId },
          data: { status: 'DELIVERED', deliveredAt: now },
        });
        await this.events.recordStatus(
          tx,
          orderId,
          'SHIPPED',
          'DELIVERED',
          p.actor,
          `${viaFa}${p.receivedByName ? ` — تحویل‌گیرنده: ${p.receivedByName.trim()}` : ''}`,
        );
      }

      // کد تحویل تأیید شد → شمش‌های سفارش به نام مالک ثبت می‌شوند
      const verified =
        p.via !== 'ADMIN_OVERRIDE' && (codeRequired || zarpayeshApproved);
      let owned = 0;
      if (verified) {
        await tx.shopOrder.update({
          where: { id: orderId },
          data: { deliveryCodeVerifiedAt: now, deliveryCodeVerifiedVia: p.via },
        });
        owned = this.hologram
          ? await this.hologram.finalizeOrderOwnership(tx, orderId)
          : 0;
        if (lateVerify || owned > 0) {
          await this.events.recordStatus(
            tx,
            orderId,
            'DELIVERED',
            'DELIVERED',
            p.actor,
            `${lateVerify ? `${viaFa} — ` : ''}${owned.toLocaleString('fa-IR')} شمش به نام مالک ثبت شد`,
          );
        }
      }
      return { kind: 'ok' as const, lateVerify, verified, owned };
    });

    if (outcome.kind === 'already') {
      return {
        message: 'این سفارش قبلاً تحویل داده شده و کد تحویل آن ثبت شده است',
        alreadyProcessed: true,
      };
    }
    if (outcome.kind === 'wrong') {
      throw new BadRequestException(
        outcome.remaining > 0
          ? `کد تحویل نادرست است (${outcome.remaining.toLocaleString('fa-IR')} تلاش باقی‌مانده)`
          : 'کد تحویل نادرست است و قفل شد؛ کد جدید برای مشتری صادر کنید',
      );
    }
    if (zarpayeshMode && p.via === 'ADMIN_OVERRIDE') {
      void this.zarpayesh.noteDeliveredWithoutCode(orderId);
    }
    if (!outcome.lateVerify) await this.events.notify(orderId, 'DELIVERED');
    const ownedText =
      outcome.owned > 0
        ? ` و ${outcome.owned.toLocaleString('fa-IR')} شمش به نام مالک ثبت شد`
        : '';
    return {
      message: outcome.lateVerify
        ? `کد تحویل ثبت شد${ownedText}`
        : outcome.verified
          ? `تحویل سفارش ثبت شد${ownedText}`
          : 'تحویل ثبت شد؛ شمش‌ها تا ارائه یا ثبت کد تحویل توسط مشتری به نام او ثبت نمی‌شوند',
      alreadyProcessed: false,
      ownershipRegistered: outcome.owned,
    };
  }

  /** ثبت کد تحویل توسط خود مشتری در اپ (پس از دریافت مرسوله) */
  async confirmByUser(userId: string, orderId: string, code: string) {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return this.confirmDelivery(orderId, {
      code,
      via: 'USER_APP',
      actor: { type: 'USER', id: userId },
    });
  }

  /**
   * کد تحویل مرسوله‌ای که سامانه ناظر صادر کرده: Approve (SetDeliveries ۱) با همان کد در سامانه ناظر.
   * کد نادرست مثل کد آرکان شمرده و پس از ۵ بار قفل می‌شود. خروجی غیر null یعنی کار تمام است.
   */
  private async approveWithZarPayesh(
    orderId: string,
    p: {
      code?: string;
      actor: { type: 'ADMIN' | 'COURIER' | 'USER'; id?: string | null };
    },
  ) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: { shippings: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.status === 'DELIVERED' && order.deliveryCodeVerifiedAt) {
      return {
        message: 'این سفارش قبلاً تحویل داده شده و کد تحویل آن ثبت شده است',
        alreadyProcessed: true,
      };
    }
    if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
      throw new ConflictException('این سفارش هنوز ارسال نشده است');
    }
    const shipping = order.shippings[0];
    if (shipping.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS) {
      throw new ForbiddenException(
        'ثبت کد تحویل به‌دلیل ورود نادرست مکرر قفل شده است؛ پس از بررسی پیامک زر پایش مشتری، از پنل «باز کردن قفل کد تحویل» را بزنید',
      );
    }
    const r = await this.zarpayesh.approve(
      orderId,
      p.code,
      p.actor.type === 'ADMIN'
        ? { trigger: 'ADMIN', adminId: p.actor.id ?? null }
        : {
            trigger: 'SYSTEM',
            userId: p.actor.type === 'USER' ? p.actor.id : null,
          },
    );
    if (r.kind === 'ok') return null;
    const updated = await this.prisma.shipping.update({
      where: { id: shipping.id },
      data: { deliveryCodeAttempts: { increment: 1 } },
      select: { deliveryCodeAttempts: true },
    });
    const remaining = Math.max(
      0,
      MAX_DELIVERY_CODE_ATTEMPTS - updated.deliveryCodeAttempts,
    );
    throw new BadRequestException(
      remaining > 0
        ? `${r.message} (${remaining.toLocaleString('fa-IR')} تلاش باقی‌مانده)`
        : `${r.message} و ثبت کد قفل شد`,
    );
  }

  /** ارسال مجدد کد تحویل (در صورت قفل شدن، کد جدید صادر می‌شود) */
  async resendDeliveryCode(
    orderId: string,
    adminId: string,
    regenerate = false,
  ) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: { shippings: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    // سفارش تحویل‌شده‌ی بدون کد هم تا ثبت کد تحویل، کد می‌گیرد (شرط ثبت شمش به نام مالک)
    const awaitingCode =
      order.status === 'DELIVERED' && !order.deliveryCodeVerifiedAt;
    if (order.status !== 'SHIPPED' && !awaitingCode) {
      throw new ConflictException(
        'کد تحویل فقط برای سفارش ارسال‌شده (یا تحویل‌شده‌ی در انتظار کد) قابل ارسال است',
      );
    }
    const shipping = order.shippings[0];
    if (!shipping)
      throw new ConflictException('اطلاعات ارسال سفارش ثبت نشده است');

    if (shipping.deliveryCodeSource === 'ZARPAYESH') {
      // کد را سامانه ناظر صادر و پیامک کرده؛ آرکان کد نمی‌سازد — فقط قفل تلاش‌های نادرست باز می‌شود
      await this.prisma.$transaction(async (tx) => {
        await tx.shipping.update({
          where: { id: shipping.id },
          data: { deliveryCodeAttempts: 0 },
        });
        await this.events.recordStatus(
          tx,
          orderId,
          order.status,
          order.status,
          { type: 'ADMIN', id: adminId },
          'باز کردن قفل کد تحویل سامانه ناظر',
        );
      });
      return {
        message:
          'قفل ثبت کد باز شد. کد تحویل این سفارش را سامانه ناظر (زر پایش) برای مشتری پیامک کرده است و آرکان آن را دوباره ارسال نمی‌کند',
      };
    }

    const mustRegenerate =
      regenerate ||
      !shipping.deliveryCodeEnc ||
      shipping.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS;
    if (mustRegenerate) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.prisma.$transaction(async (tx) => {
        await tx.shipping.update({
          where: { id: shipping.id },
          data: {
            deliveryCodeEnc: await this.events.encryptDeliveryCode(
              orderId,
              code,
            ),
            deliveryCodeAttempts: 0,
            deliveryCodeSentAt: new Date(),
          },
        });
        await this.events.recordStatus(
          tx,
          orderId,
          order.status,
          order.status,
          { type: 'ADMIN', id: adminId },
          'صدور کد تحویل جدید',
        );
      });
    } else {
      await this.prisma.shipping.update({
        where: { id: shipping.id },
        data: { deliveryCodeSentAt: new Date() },
      });
    }
    await this.events.notify(orderId, 'DELIVERY_CODE');
    return {
      message: mustRegenerate
        ? 'کد تحویل جدید صادر و برای مشتری پیامک شد'
        : 'کد تحویل مجدداً برای مشتری پیامک شد',
    };
  }

  // ═══════════════════════ لینک پیک (عمومی) ═══════════════════════

  courierLink(token: string) {
    const base = (
      process.env.NEXT_PUBLIC_APP_URL || 'https://app.arkan.gold'
    ).replace(/\/+$/, '');
    return `${base}/courier/${token}`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeEqual(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }

  private async findByCourierToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
      throw new NotFoundException('لینک تحویل نامعتبر است');
    }
    const shipping = await this.prisma.shipping.findUnique({
      where: { courierTokenHash: this.hashToken(token) },
      include: {
        shippingMethod: true,
        shopOrder: {
          include: {
            address: true,
            items: {
              include: {
                product: true,
                variant: { include: { product: true } },
              },
            },
          },
        },
      },
    });
    if (!shipping?.shopOrder)
      throw new NotFoundException('لینک تحویل نامعتبر است');
    return shipping;
  }

  /** اطلاعات حداقلی مرسوله برای پیک — بدون اطلاعات مالی */
  async courierInfo(token: string) {
    const s = await this.findByCourierToken(token);
    const order = s.shopOrder;
    const expired =
      !s.courierTokenExpiresAt || s.courierTokenExpiresAt < new Date();
    const receiver = order.address?.receiverName ?? '';
    const active = !expired && order.status === 'SHIPPED';
    return {
      orderNumber: order.orderNumber ?? order.id.slice(0, 8).toUpperCase(),
      status: order.status,
      statusLabel: ORDER_STATUS_FA[order.status],
      delivered: order.status === 'DELIVERED',
      linkActive: active,
      method: s.shippingMethod?.name ?? s.carrierName,
      courierName: s.courierName,
      receiverName: receiver,
      city: [order.address?.province, order.address?.city]
        .filter(Boolean)
        .join('، '),
      // پس از تحویل یا انقضای لینک، نشانی و تلفن گیرنده نمایش داده نمی‌شود
      address: active ? (order.address?.fullAddress ?? '') : '',
      receiverPhone: active ? (order.address?.receiverPhone ?? null) : null,
      itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
      deliveryCodeSource: s.deliveryCodeSource ?? 'ARKAN',
      attemptsLeft: Math.max(
        0,
        MAX_DELIVERY_CODE_ATTEMPTS - s.deliveryCodeAttempts,
      ),
      deliveredAt: order.deliveredAt,
    };
  }

  async courierConfirm(token: string, code: string, receivedByName?: string) {
    const s = await this.findByCourierToken(token);
    if (!s.courierTokenExpiresAt || s.courierTokenExpiresAt < new Date()) {
      throw new ForbiddenException('اعتبار این لینک به پایان رسیده است');
    }
    return this.confirmDelivery(s.shopOrder.id, {
      code,
      via: 'COURIER_LINK',
      actor: { type: 'COURIER', id: s.courierPhone },
      receivedByName,
    });
  }

  // ═══════════════════════ جزئیات برای پنل و اپ ═══════════════════════

  /** جزئیات ارسال برای نمایش (کد تحویل فقط برای مالک سفارش و ادمین مجاز) */
  async deliveryView(orderId: string, includeCode: boolean) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        shippings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            shippingMethod: {
              include: { carrier: { select: { trackingUrlTemplate: true } } },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) return null;
    const s = order.shippings[0];
    const awaitingCode =
      order.status === 'SHIPPED' ||
      (order.status === 'DELIVERED' && !order.deliveryCodeVerifiedAt);
    const code =
      includeCode && awaitingCode
        ? await this.events.decryptDeliveryCode(order.id, s?.deliveryCodeEnc)
        : null;
    // شمش‌هایی که به سفارش متصل شده‌اند ولی تا ثبت کد تحویل به نام مالک ثبت نمی‌شوند
    const ownershipPending = await this.prisma.hologramCode.count({
      where: {
        status: 'AWAITING_DELIVERY',
        shopOrderItem: { orderId: order.id },
      },
    });
    return {
      orderNumber: order.orderNumber,
      timestamps: {
        paidAt: order.paidAt,
        processingAt: order.processingAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt,
      },
      cancelReason: order.cancelReason,
      /** کد تحویل (آرکان یا زر پایش) تأیید شده و شمش‌ها به نام مالک ثبت شده‌اند */
      deliveryCodeVerifiedAt: order.deliveryCodeVerifiedAt,
      deliveryCodeVerifiedVia: order.deliveryCodeVerifiedVia,
      /** مشتری باید کد تحویل را ارائه/ثبت کند (ارسال‌شده، یا تحویل بدون کد) */
      awaitingDeliveryCode: awaitingCode && !!s,
      ownershipPending,
      shipping: s
        ? {
            method: s.shippingMethod
              ? {
                  id: s.shippingMethod.id,
                  name: s.shippingMethod.name,
                  type: s.shippingMethod.type,
                }
              : null,
            carrierName: s.carrierName,
            trackingCode: s.trackingCode,
            trackingUrl: this.events.trackingUrl(
              s.shippingMethod?.trackingUrlTemplate ??
                s.shippingMethod?.carrier?.trackingUrlTemplate,
              s.trackingCode,
            ),
            estimatedDelivery: s.estimatedDelivery,
            courierName: s.courierName,
            courierPhone: s.courierPhone,
            contactPhone: s.shippingMethod?.contactPhone ?? null,
            deliveryCodeRequired:
              !!s.deliveryCodeEnc || s.deliveryCodeSource === 'ZARPAYESH',
            /** ZARPAYESH = کد را سامانه ناظر پیامک کرده (در اپ نمایش داده نمی‌شود) */
            deliveryCodeSource: s.deliveryCodeSource ?? 'ARKAN',
            deliveryCode: code,
            deliveryCodeAttempts: s.deliveryCodeAttempts,
            deliveryCodeLocked:
              s.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS,
            deliveryCodeSentAt: s.deliveryCodeSentAt,
            deliveredAt: s.deliveredAt,
            deliveryConfirmedVia: s.deliveryConfirmedVia,
            receivedByName: s.receivedByName,
            note: s.deliveryNote,
          }
        : null,
      timeline: order.statusHistory.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        toStatusLabel: ORDER_STATUS_FA[h.toStatus],
        actorType: h.actorType,
        note: h.note,
        createdAt: h.createdAt,
      })),
    };
  }
}
