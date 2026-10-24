// api/src/zarpayesh/zarpayesh-delivery.service.ts
//
// ارسال/تحویل دارایی کاربر در سامانه ناظر (متدهای ۶ تا ۹ مستند):
//   MakeDeliveries → کد پیگیری مرسوله (trackingcode)
//   SetDeliveries  → ۱ Approve (تحویل کاربر — نیازمند کد تأیید؛ دارایی از موجودی کاربر کسر و به خزانه
//                    برمی‌گردد)، ۲ Ship، ۳ Delivery، ۴ Cancel
//   GetDeliveries / MakeDeliverFollowup → استعلام
// از پنل ادمین مدیریت می‌شود (تحویل شمش معادل طلای آب‌شده یا تحویل فیزیکی).
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import {
  CallContext,
  ZarPayeshClientService,
} from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { ZarPayeshError } from './zarpayesh-errors';
import {
  DELIVERY_STATUS,
  DUPLICATE_TRACKING_CODES,
} from './zarpayesh.constants';
import { gramsToMg } from './zarpayesh-trade.service';

@Injectable()
export class ZarPayeshDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ZarPayeshConfigService,
    private readonly client: ZarPayeshClientService,
    private readonly users: ZarPayeshUsersService,
  ) {}

  private async nextTrackingNumber(): Promise<bigint> {
    const rows = await this.prisma.$queryRaw<{ v: bigint }[]>`
      SELECT nextval('zarpayesh_src_tracking_seq') AS v`;
    return BigInt(rows[0].v);
  }

  async create(
    adminId: string,
    p: {
      userId: string;
      amountGrams: string;
      description?: string;
      reference?: string;
    },
  ) {
    const cfg = await this.config.getConfig();
    if (cfg.typeId == null) {
      throw new BadRequestException(
        'نوع فلز (typeId) سامانه ناظر تنظیم نشده است',
      );
    }
    const amountMg = gramsToMg(new Prisma.Decimal(p.amountGrams));
    if (amountMg <= 0) throw new BadRequestException('مقدار باید مثبت باشد');
    const ctx: CallContext = { trigger: 'ADMIN', adminId, userId: p.userId };
    const nationalCode = await this.users.ensureRegistered(p.userId, ctx, {
      autoRegister: cfg.autoRegisterUsers,
    });
    let srcTrackingNumber = await this.nextTrackingNumber();
    const row = await this.prisma.zarPayeshDelivery.create({
      data: {
        srcTrackingNumber,
        userId: p.userId,
        typeId: cfg.typeId,
        amountMg: new Prisma.Decimal(amountMg),
        description: p.description ?? null,
        reference: p.reference ?? null,
        createdByAdminId: adminId,
      },
    });
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await this.client.makeDeliveries(
          {
            amount: amountMg,
            description: p.description ?? '',
            nationalCode,
            typeId: cfg.typeId.toString(),
            srcTrackingNumber,
          },
          { ...ctx, srcTrackingNumber },
        );
        const requestedAt = r.requestedAt
          ? new Date(r.requestedAt)
          : new Date();
        await this.prisma.zarPayeshDelivery.update({
          where: { id: row.id },
          data: {
            state: 'REQUESTED',
            trackingCode: BigInt(r.trackingcode),
            requestedAt: Number.isNaN(requestedAt.getTime())
              ? new Date()
              : requestedAt,
            errorCode: null,
            errorMessage: null,
          },
        });
        return {
          message: 'درخواست ارسال دارایی در سامانه ناظر ثبت شد',
          id: row.id,
          trackingCode: String(r.trackingcode),
        };
      } catch (err) {
        const z = err instanceof ZarPayeshError ? err : null;
        if (
          z?.code != null &&
          DUPLICATE_TRACKING_CODES.has(z.code) &&
          attempt < 4
        ) {
          srcTrackingNumber = await this.nextTrackingNumber();
          await this.prisma.zarPayeshDelivery.update({
            where: { id: row.id },
            data: { srcTrackingNumber },
          });
          continue;
        }
        await this.prisma.zarPayeshDelivery.update({
          where: { id: row.id },
          data: {
            // نتیجه‌ی نامشخص: با «پیگیری» (MakeDeliverFollowup) بعداً تعیین تکلیف می‌شود
            state: z?.uncertain ? 'REQUESTING' : 'FAILED',
            errorCode: z?.logCode ?? 'UNKNOWN_ERROR',
            errorMessage: (err as Error).message,
          },
        });
        throw err;
      }
    }
  }

  private async getOrThrow(id: string) {
    const d = await this.prisma.zarPayeshDelivery.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('درخواست ارسال یافت نشد');
    return d;
  }

  async setStatus(
    adminId: string,
    id: string,
    status: number,
    approveCode?: string,
  ) {
    const d = await this.getOrThrow(id);
    if (d.trackingCode == null) {
      throw new BadRequestException(
        'این درخواست هنوز کد پیگیری سامانه ناظر ندارد',
      );
    }
    if (![1, 2, 3, 4].includes(status)) {
      throw new BadRequestException('وضعیت ارسال نامعتبر است');
    }
    // «برای تغییر به وضعیت ۱ (Approve) کد تأیید الزامی است؛ برای ۲، ۳ و ۴ نیازی به ارسال ندارد»
    const code = (approveCode ?? '').trim();
    if (status === DELIVERY_STATUS.APPROVE && !/^\d+$/.test(code)) {
      throw new BadRequestException(
        'برای تحویل به کاربر (Approve) کد تأیید عددی الزامی است',
      );
    }
    const r = await this.client.setDeliveries(
      {
        trackingcode: d.trackingCode.toString(),
        setStatusDeleveries: status,
        approveCode: status === DELIVERY_STATUS.APPROVE ? code : 0,
      },
      {
        trigger: 'ADMIN',
        adminId,
        userId: d.userId,
        srcTrackingNumber: d.srcTrackingNumber,
      },
    );
    const at = r?.actionTime ? new Date(r.actionTime) : new Date();
    const when = Number.isNaN(at.getTime()) ? new Date() : at;
    await this.prisma.zarPayeshDelivery.update({
      where: { id },
      data: {
        remoteStatus: status,
        ...(status === 1 ? { approvedAt: when } : {}),
        ...(status === 2 ? { shippedAt: when } : {}),
        ...(status === 3 ? { deliveredAt: when } : {}),
        ...(status === 4 ? { cancelledAt: when } : {}),
        errorCode: null,
        errorMessage: null,
      },
    });
    return { message: 'وضعیت ارسال در سامانه ناظر به‌روزرسانی شد', result: r };
  }

  /** GetDeliveries + همگام‌سازی تاریخ‌ها */
  async refresh(adminId: string, id: string) {
    const d = await this.getOrThrow(id);
    const ctx: CallContext = {
      trigger: 'ADMIN',
      adminId,
      userId: d.userId,
      srcTrackingNumber: d.srcTrackingNumber,
    };
    if (d.trackingCode == null) {
      // ثبت نامشخص بود → MakeDeliverFollowup
      const f = await this.client.makeDeliverFollowup(d.srcTrackingNumber, ctx);
      if (f?.trackingcode != null) {
        await this.prisma.zarPayeshDelivery.update({
          where: { id },
          data: { trackingCode: BigInt(f.trackingcode), state: 'REQUESTED' },
        });
      }
      return { message: 'نتیجه‌ی ثبت از سامانه ناظر دریافت شد', result: f };
    }
    const g = await this.client.getDeliveries(
      {
        Trackingcode: d.trackingCode.toString(),
        srcTrackingcode: d.srcTrackingNumber.toString(),
      },
      ctx,
    );
    const dt = (v?: string) => {
      if (!v) return undefined;
      const t = new Date(v);
      return Number.isNaN(t.getTime()) || t.getUTCFullYear() < 2000
        ? undefined
        : t;
    };
    await this.prisma.zarPayeshDelivery.update({
      where: { id },
      data: {
        remoteStatus: g?.status != null ? Number(g.status) : undefined,
        approvedAt: dt(g?.approvedAt),
        shippedAt: dt(g?.shippedAt),
        deliveredAt: dt(g?.deliveredAt),
        cancelledAt: dt(g?.cancelledAt),
      },
    });
    return { message: 'وضعیت مرسوله از سامانه ناظر دریافت شد', result: g };
  }
}
