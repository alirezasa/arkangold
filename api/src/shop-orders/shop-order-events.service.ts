// api/src/shop-orders/shop-order-events.service.ts
//
// رویدادهای چرخه‌ی عمر سفارش فروشگاه: ثبت Timeline وضعیت و ارسال پیامک هر مرحله
// (متن پیامک‌ها در «مرکز پیامک» پنل ادمین قابل تعریف است).
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { CredentialEncryptionService } from '../integrations/credentials/credential-encryption.service';

export type OrderActorType = 'USER' | 'ADMIN' | 'SYSTEM' | 'COURIER';

export type OrderSmsEvent =
  | 'CREATED'
  | 'PAID'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DELIVERY_CODE';

export const ORDER_STATUS_FA: Record<ShopOrderStatus, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  CANCELLED: 'لغوشده',
};

@Injectable()
export class ShopOrderEventsService {
  private readonly logger = new Logger(ShopOrderEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsTemplates: SmsTemplateService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  /** ثبت یک ردیف Timeline (داخل همان تراکنش تغییر وضعیت) */
  async recordStatus(
    tx: Prisma.TransactionClient,
    orderId: string,
    from: ShopOrderStatus | null,
    to: ShopOrderStatus,
    actor: { type: OrderActorType; id?: string | null },
    note?: string | null,
  ): Promise<void> {
    await tx.shopOrderStatusHistory.create({
      data: {
        orderId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.id ?? null,
        note: note?.slice(0, 500) ?? null,
      },
    });
  }

  // ─────────────────────────── کد تحویل ───────────────────────────

  private codeContext(orderId: string) {
    return `shop-order-delivery:${orderId}`;
  }

  encryptDeliveryCode(orderId: string, code: string): Promise<string> {
    return this.encryption.encrypt(code, this.codeContext(orderId));
  }

  async decryptDeliveryCode(
    orderId: string,
    enc: string | null | undefined,
  ): Promise<string | null> {
    if (!enc) return null;
    try {
      return await this.encryption.decrypt(enc, this.codeContext(orderId));
    } catch (err) {
      this.logger.error(
        `رمزگشایی کد تحویل سفارش ${orderId} ناموفق بود: ${(err as Error).message}`,
      );
      return null;
    }
  }

  trackingUrl(template: string | null | undefined, code: string | null) {
    if (!template || !code) return null;
    return template.split('{code}').join(encodeURIComponent(code));
  }

  // ─────────────────────────── پیامک ───────────────────────────

  /**
   * پیامک مرحله‌ی سفارش به مشتری — بعد از commit تراکنش صدا زده شود.
   * هرگز throw نمی‌کند؛ نتیجه در گزارش مرکز پیامک ثبت می‌شود.
   */
  async notify(
    orderId: string,
    event: OrderSmsEvent,
    extra: { reason?: string | null } = {},
  ): Promise<void> {
    try {
      const order = await this.prisma.shopOrder.findUnique({
        where: { id: orderId },
        include: {
          shippings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { shippingMethod: true },
          },
        },
      });
      if (!order) return;

      const shipping = order.shippings[0];
      const method = shipping?.shippingMethod;
      const deliveryCode = await this.decryptDeliveryCode(
        order.id,
        shipping?.deliveryCodeEnc,
      );
      const vars = {
        orderNumber: order.orderNumber ?? order.id.slice(0, 8).toUpperCase(),
        amount: Math.round(Number(order.totalRial) / 10).toLocaleString(
          'fa-IR',
        ),
        carrier: method?.name ?? shipping?.carrierName ?? '',
        trackingCode: shipping?.trackingCode ?? '—',
        trackingUrl:
          this.trackingUrl(
            method?.trackingUrlTemplate,
            shipping?.trackingCode ?? null,
          ) ?? '',
        deliveryCode: deliveryCode ?? '—',
        reason: extra.reason ? `\nدلیل: ${extra.reason}` : '',
      };

      let key: string;
      switch (event) {
        case 'CREATED':
          key = 'SHOP_ORDER_CREATED';
          break;
        case 'PAID':
          key = 'SHOP_ORDER_PAID';
          break;
        case 'PROCESSING':
          key = 'SHOP_ORDER_PROCESSING';
          break;
        case 'SHIPPED':
          key =
            method?.type === 'PICKUP'
              ? 'SHOP_ORDER_READY_FOR_PICKUP'
              : 'SHOP_ORDER_SHIPPED';
          break;
        case 'DELIVERED':
          key = 'SHOP_ORDER_DELIVERED';
          break;
        case 'CANCELLED':
          key = 'SHOP_ORDER_CANCELLED';
          break;
        case 'DELIVERY_CODE':
          key = 'SHOP_ORDER_DELIVERY_CODE';
          break;
      }

      await this.smsTemplates.sendToUser(key, order.userId, vars, {
        referenceType: 'SHOP_ORDER',
        referenceId: order.id,
      });
    } catch (err) {
      this.logger.warn(
        `پیامک «${event}» سفارش ${orderId} ارسال نشد: ${(err as Error).message}`,
      );
    }
  }

  /** پیامک لینک ثبت تحویل به پیک */
  async notifyCourier(
    orderId: string,
    courierPhone: string,
    link: string,
  ): Promise<void> {
    try {
      const order = await this.prisma.shopOrder.findUnique({
        where: { id: orderId },
        include: {
          address: { select: { receiverName: true } },
          user: {
            select: {
              identity: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
      if (!order) return;
      const customerName =
        order.address?.receiverName ||
        `${order.user.identity?.firstName ?? ''} ${order.user.identity?.lastName ?? ''}`.trim() ||
        'مشتری';
      await this.smsTemplates.send(
        'SHOP_ORDER_COURIER_ASSIGNED',
        courierPhone,
        {
          orderNumber: order.orderNumber ?? order.id.slice(0, 8).toUpperCase(),
          customerName,
          link,
        },
        { referenceType: 'SHOP_ORDER', referenceId: order.id },
      );
    } catch (err) {
      this.logger.warn(
        `پیامک پیک سفارش ${orderId} ارسال نشد: ${(err as Error).message}`,
      );
    }
  }
}
