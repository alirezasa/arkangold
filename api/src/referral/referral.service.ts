// api/src/referral/referral.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  AccountingService,
  LedgerLineInput,
} from '../accounting/accounting.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '../generated/prisma/client';
import { maskPhone } from '../common/audit/mask.util';

const D0 = new Prisma.Decimal(0);

/** رویدادی از چرخه عمر کاربر دعوت‌شده که می‌تواند پاداش معرف را آزاد کند */
export type ReferralRewardTrigger = 'SIGNUP' | 'IDENTITY_VERIFIED';
export const REFERRAL_TRIGGERS: ReferralRewardTrigger[] = [
  'SIGNUP',
  'IDENTITY_VERIFIED',
];

const TRIGGER_LABELS: Record<ReferralRewardTrigger, string> = {
  SIGNUP: 'ثبت‌نام',
  IDENTITY_VERIFIED: 'احراز هویت',
};

const CONFIG_KEYS = {
  enabled: 'referral.enabled',
  trigger: 'referral.reward_trigger',
  rewardRial: 'referral.reward_amount_rial',
  rewardMg: 'referral.reward_amount_mg',
} as const;

// کیف پول طلا با دقت ۴ رقم اعشار گرم (۰٫۱ میلی‌گرم) نگهداری می‌شود
const MAX_REWARD_MG = 1_000_000; // سقف منطقی: ۱ کیلوگرم به ازای هر دعوت
const MAX_REWARD_RIAL = 100_000_000_000;

export interface ReferralSettings {
  enabled: boolean;
  trigger: ReferralRewardTrigger;
  rewardRial: string;
  rewardMg: string;
}

export interface UpdateReferralSettingsInput {
  enabled?: boolean;
  trigger?: ReferralRewardTrigger;
  rewardRial?: number;
  rewardMg?: number;
}

interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  referrerId?: string;
  status?: 'REWARDED' | 'PENDING';
}

type IdentityLite = {
  firstName: string | null;
  lastName: string | null;
  status: string;
} | null;

function fullName(identity: IdentityLite): string | null {
  if (!identity) return null;
  const name = `${identity.firstName ?? ''} ${identity.lastName ?? ''}`.trim();
  return name || null;
}

/** نام دوست دعوت‌شده برای نمایش به معرف: فقط نام کوچک + حرف اول نام خانوادگی */
function maskedName(identity: IdentityLite): string | null {
  if (!identity?.firstName) return null;
  const last = identity.lastName?.trim();
  return last ? `${identity.firstName} ${last[0]}.` : identity.firstName;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
    private readonly accounting: AccountingService,
    private readonly notifications: NotificationsService,
  ) {}

  // ══════════════════════════════════════════
  // ── تنظیمات پاداش ──
  // ══════════════════════════════════════════
  async getSettings(): Promise<ReferralSettings> {
    const [enabled, trigger, rewardRial, rewardMg] = await Promise.all([
      this.config.getBoolean(CONFIG_KEYS.enabled, true),
      this.config.get(CONFIG_KEYS.trigger, 'IDENTITY_VERIFIED'),
      this.config.getDecimal(CONFIG_KEYS.rewardRial, '0'),
      this.config.getDecimal(CONFIG_KEYS.rewardMg, '0'),
    ]);
    return {
      enabled,
      trigger: REFERRAL_TRIGGERS.includes(trigger as ReferralRewardTrigger)
        ? (trigger as ReferralRewardTrigger)
        : 'IDENTITY_VERIFIED',
      rewardRial: rewardRial.gt(0) ? rewardRial.toFixed(0) : '0',
      rewardMg: rewardMg.gt(0) ? rewardMg.toDecimalPlaces(1).toString() : '0',
    };
  }

  async updateSettings(dto: UpdateReferralSettingsInput) {
    if (dto.trigger !== undefined && !REFERRAL_TRIGGERS.includes(dto.trigger)) {
      throw new BadRequestException('زمان پرداخت پاداش نامعتبر است');
    }
    if (
      dto.rewardRial !== undefined &&
      (!Number.isFinite(dto.rewardRial) ||
        dto.rewardRial < 0 ||
        dto.rewardRial > MAX_REWARD_RIAL)
    ) {
      throw new BadRequestException('مبلغ پاداش ریالی نامعتبر است');
    }
    if (
      dto.rewardMg !== undefined &&
      (!Number.isFinite(dto.rewardMg) ||
        dto.rewardMg < 0 ||
        dto.rewardMg > MAX_REWARD_MG)
    ) {
      throw new BadRequestException('مقدار پاداش طلایی نامعتبر است');
    }

    if (dto.enabled !== undefined) {
      await this.config.set(CONFIG_KEYS.enabled, String(dto.enabled));
    }
    if (dto.trigger !== undefined) {
      await this.config.set(CONFIG_KEYS.trigger, dto.trigger);
    }
    if (dto.rewardRial !== undefined) {
      await this.config.set(
        CONFIG_KEYS.rewardRial,
        new Prisma.Decimal(dto.rewardRial).toFixed(0),
      );
    }
    if (dto.rewardMg !== undefined) {
      await this.config.set(
        CONFIG_KEYS.rewardMg,
        new Prisma.Decimal(dto.rewardMg).toDecimalPlaces(1).toString(),
      );
    }
    return this.getSettings();
  }

  // ══════════════════════════════════════════
  // ── پرداخت پاداش ──
  // ══════════════════════════════════════════
  /**
   * در ثبت‌نام و احراز هویت کاربر دعوت‌شده صدا زده می‌شود؛ اگر رویداد با زمان
   * پرداخت تنظیم‌شده یکی باشد پاداش معرف واریز می‌شود. هرگز خطا پرتاب نمی‌کند تا
   * جریان اصلی (ثبت‌نام / احراز هویت) به‌خاطر پاداش شکست نخورد.
   */
  async handleReferredUserEvent(
    referredUserId: string,
    event: ReferralRewardTrigger,
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || settings.trigger !== event) return;

      const referral = await this.prisma.referral.findUnique({
        where: { referredId: referredUserId },
        select: { id: true, rewardClaimed: true },
      });
      if (!referral || referral.rewardClaimed) return;

      await this.grantReward(referral.id, settings, TRIGGER_LABELS[event]);
    } catch (err) {
      this.logger.error(
        `پرداخت پاداش دعوت برای کاربر دعوت‌شده ${referredUserId} ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  /** پرداخت دستی پاداش یک دعوت توسط ادمین (با مقادیر فعلی تنظیمات) */
  async grantManually(referralId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      select: { id: true, rewardClaimed: true },
    });
    if (!referral) throw new NotFoundException('دعوت یافت نشد');
    if (referral.rewardClaimed) {
      throw new BadRequestException('پاداش این دعوت قبلاً پرداخت شده است');
    }
    const settings = await this.getSettings();
    const paid = await this.grantReward(
      referral.id,
      settings,
      'پرداخت دستی ادمین',
      true,
    );
    if (!paid) {
      throw new BadRequestException(
        'مبلغ پاداش در تنظیمات صفر است؛ ابتدا مقدار پاداش را تعیین کنید',
      );
    }
    return { message: 'پاداش دعوت با موفقیت پرداخت شد' };
  }

  /**
   * واریز پاداش به کیف پول معرف — اتمیک و idempotent: علامت rewardClaimed با
   * به‌روزرسانی شرطی در همان تراکنش ست می‌شود، پس دو فراخوانی هم‌زمان هرگز دو بار
   * پاداش نمی‌دهند. خروجی true یعنی پاداشی واریز شد.
   */
  private async grantReward(
    referralId: string,
    settings: ReferralSettings,
    reason: string,
    manual = false,
  ): Promise<boolean> {
    const rewardRial = new Prisma.Decimal(settings.rewardRial);
    const rewardGrams = new Prisma.Decimal(settings.rewardMg)
      .div(1000)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
    if (rewardRial.lte(0) && rewardGrams.lte(0)) return false;

    let paidTo = null as string | null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.referral.updateMany({
          where: { id: referralId, rewardClaimed: false },
          data: { rewardClaimed: true, rewardedAt: new Date() },
        });
        if (claimed.count === 0) return;

        const referral = await tx.referral.findUniqueOrThrow({
          where: { id: referralId },
          include: {
            referrer: { select: { id: true, status: true } },
            referred: { select: { phone: true } },
          },
        });
        // حساب معرف مسدود است — پاداشی واریز نمی‌شود (پرداخت دستی ادمین مستثناست)
        if (!manual && referral.referrer.status === 'BANNED') {
          throw new SkipReward('حساب معرف مسدود است');
        }

        const referrerId = referral.referrer.id;
        const wallet = await tx.wallet.findUnique({
          where: { userId: referrerId },
        });
        if (!wallet) throw new NotFoundException('کیف پول معرف یافت نشد');

        await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;

        const friend = maskPhone(referral.referred.phone) ?? '';
        const description = `پاداش دعوت از دوست (${friend}) - ${reason}`;

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            ...(rewardRial.gt(0)
              ? { rialBalance: { increment: rewardRial } }
              : {}),
            ...(rewardGrams.gt(0)
              ? { goldBalanceGrams: { increment: rewardGrams } }
              : {}),
          },
        });

        // برای هر نوع پاداش یک تراکنش جدا ثبت می‌شود تا در تاریخچه تراکنش‌ها
        // مبلغ ریالی و مقدار طلا هر کدام به‌طور شفاف دیده شوند
        const lines: LedgerLineInput[] = [];
        if (rewardRial.gt(0)) {
          const t = await tx.transaction.create({
            data: {
              userId: referrerId,
              walletId: wallet.id,
              type: 'REFERRAL_REWARD',
              status: 'COMPLETED',
              amountRial: rewardRial,
              description,
            },
          });
          await tx.referralReward.create({
            data: {
              userId: referrerId,
              referralId,
              transactionId: t.id,
              amountRial: rewardRial,
            },
          });
          lines.push(
            { accountCode: '5020', side: 'DEBIT', amountRial: rewardRial },
            { accountCode: '2010', side: 'CREDIT', amountRial: rewardRial },
          );
        }
        if (rewardGrams.gt(0)) {
          const t = await tx.transaction.create({
            data: {
              userId: referrerId,
              walletId: wallet.id,
              type: 'REFERRAL_REWARD',
              status: 'COMPLETED',
              amountGrams: rewardGrams,
              description,
            },
          });
          await tx.referralReward.create({
            data: {
              userId: referrerId,
              referralId,
              transactionId: t.id,
              amountGrams: rewardGrams,
            },
          });
          lines.push(
            { accountCode: '5020', side: 'DEBIT', amountGrams: rewardGrams },
            { accountCode: '2020', side: 'CREDIT', amountGrams: rewardGrams },
          );
        }

        await this.accounting.postJournal(tx, {
          description: `پاداش دعوت از دوست - معرف ${referrerId} - دعوت ${referralId}`,
          totalRial: rewardRial.gt(0) ? rewardRial : D0,
          totalGrams: rewardGrams.gt(0) ? rewardGrams : D0,
          lines,
        });

        paidTo = referrerId;
      });
    } catch (err) {
      if (err instanceof SkipReward) {
        this.logger.warn(`پاداش دعوت ${referralId} پرداخت نشد: ${err.message}`);
        return false;
      }
      throw err;
    }

    if (!paidTo) return false;

    const parts: string[] = [];
    if (rewardRial.gt(0)) {
      parts.push(
        `${rewardRial.div(10).toNumber().toLocaleString('fa-IR')} تومان`,
      );
    }
    if (rewardGrams.gt(0)) {
      parts.push(
        `${rewardGrams.times(1000).toNumber().toLocaleString('fa-IR')} میلی‌گرم طلا`,
      );
    }
    void this.notifications.notifyUserSms(
      paidTo,
      `آرکان گلد: پاداش دعوت از دوست (${parts.join(' و ')}) به کیف پول شما واریز شد.`,
    );
    return true;
  }

  // ══════════════════════════════════════════
  // ── صفحه «دعوت از دوستان» کاربر ──
  // ══════════════════════════════════════════
  async getMyReferrals(userId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(1, limit), 50);
    const skip = (Math.max(1, page) - 1) * take;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const [settings, stats, items] = await Promise.all([
      this.getSettings(),
      this.statsForReferrer(userId),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        include: {
          referred: {
            select: {
              phone: true,
              createdAt: true,
              identity: {
                select: { firstName: true, lastName: true, status: true },
              },
            },
          },
          rewards: { select: { amountRial: true, amountGrams: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return {
      referralCode: user.referralCode,
      settings,
      stats,
      invitees: items.map((r) => {
        const sums = this.sumRewards(r.rewards);
        return {
          id: r.id,
          phone: maskPhone(r.referred.phone),
          name: maskedName(r.referred.identity),
          joinedAt: r.createdAt.toISOString(),
          identityVerified: r.referred.identity?.status === 'VERIFIED',
          rewarded: r.rewardClaimed,
          rewardedAt: r.rewardedAt?.toISOString() ?? null,
          rewardRial: sums.rial,
          rewardGrams: sums.grams,
        };
      }),
      page: Math.max(1, page),
      limit: take,
      total: stats.totalInvites,
      totalPages: Math.max(1, Math.ceil(stats.totalInvites / take)),
    };
  }

  /** آمار دعوت‌های یک کاربر — در صفحه کاربر و جزئیات کاربر در پنل ادمین */
  async statsForReferrer(userId: string) {
    const [totalInvites, verifiedInvites, rewardedInvites, rewardSum] =
      await Promise.all([
        this.prisma.referral.count({ where: { referrerId: userId } }),
        this.prisma.referral.count({
          where: {
            referrerId: userId,
            referred: { identity: { status: 'VERIFIED' } },
          },
        }),
        this.prisma.referral.count({
          where: { referrerId: userId, rewardClaimed: true },
        }),
        this.prisma.referralReward.aggregate({
          where: { userId },
          _sum: { amountRial: true, amountGrams: true },
        }),
      ]);
    return {
      totalInvites,
      verifiedInvites,
      rewardedInvites,
      pendingInvites: totalInvites - rewardedInvites,
      totalRewardRial: (rewardSum._sum.amountRial ?? D0).toFixed(0),
      totalRewardGrams: (rewardSum._sum.amountGrams ?? D0).toString(),
    };
  }

  private sumRewards(
    rewards: {
      amountRial: Prisma.Decimal | null;
      amountGrams: Prisma.Decimal | null;
    }[],
  ) {
    let rial = D0;
    let grams = D0;
    for (const r of rewards) {
      if (r.amountRial) rial = rial.plus(r.amountRial);
      if (r.amountGrams) grams = grams.plus(r.amountGrams);
    }
    return { rial: rial.toFixed(0), grams: grams.toString() };
  }

  // ══════════════════════════════════════════
  // ── پنل ادمین ──
  // ══════════════════════════════════════════
  async adminList(query: ListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const search = query.search?.trim();

    const where: Prisma.ReferralWhereInput = {
      ...(query.referrerId ? { referrerId: query.referrerId } : {}),
      ...(query.status === 'REWARDED' ? { rewardClaimed: true } : {}),
      ...(query.status === 'PENDING' ? { rewardClaimed: false } : {}),
      ...(search
        ? {
            OR: [
              { referrer: { phone: { contains: search } } },
              { referred: { phone: { contains: search } } },
              { referrer: { referralCode: search.toUpperCase() } },
            ],
          }
        : {}),
    };

    const identitySelect = {
      select: { firstName: true, lastName: true, status: true },
    } as const;

    const [items, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        include: {
          referrer: {
            select: {
              id: true,
              phone: true,
              referralCode: true,
              identity: identitySelect,
            },
          },
          referred: {
            select: {
              id: true,
              phone: true,
              status: true,
              identity: identitySelect,
            },
          },
          rewards: { select: { amountRial: true, amountGrams: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      data: items.map((r) => {
        const sums = this.sumRewards(r.rewards);
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          rewarded: r.rewardClaimed,
          rewardedAt: r.rewardedAt?.toISOString() ?? null,
          rewardRial: sums.rial,
          rewardGrams: sums.grams,
          referrer: {
            id: r.referrer.id,
            phone: r.referrer.phone,
            referralCode: r.referrer.referralCode,
            fullName: fullName(r.referrer.identity),
          },
          referred: {
            id: r.referred.id,
            phone: r.referred.phone,
            status: r.referred.status,
            fullName: fullName(r.referred.identity),
            identityStatus: r.referred.identity?.status ?? null,
          },
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminStats() {
    const [total, rewarded, sums, top] = await Promise.all([
      this.prisma.referral.count(),
      this.prisma.referral.count({ where: { rewardClaimed: true } }),
      this.prisma.referralReward.aggregate({
        _sum: { amountRial: true, amountGrams: true },
      }),
      this.prisma.referral.groupBy({
        by: ['referrerId'],
        _count: { _all: true },
        orderBy: { _count: { referrerId: 'desc' } },
        take: 10,
      }),
    ]);

    const topUsers = await this.prisma.user.findMany({
      where: { id: { in: top.map((t) => t.referrerId) } },
      select: {
        id: true,
        phone: true,
        identity: { select: { firstName: true, lastName: true, status: true } },
      },
    });
    const byId = new Map(topUsers.map((u) => [u.id, u]));

    return {
      totalReferrals: total,
      rewardedReferrals: rewarded,
      pendingReferrals: total - rewarded,
      totalRewardRial: (sums._sum.amountRial ?? D0).toFixed(0),
      totalRewardGrams: (sums._sum.amountGrams ?? D0).toString(),
      topReferrers: top.map((t) => {
        const u = byId.get(t.referrerId);
        return {
          userId: t.referrerId,
          phone: u?.phone ?? null,
          fullName: fullName(u?.identity ?? null),
          invites: t._count._all,
        };
      }),
    };
  }

  /** معرفِ یک کاربر (کسی که او را دعوت کرده) — برای جزئیات کاربر در پنل ادمین */
  async referrerOf(userId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: userId },
      include: {
        referrer: {
          select: {
            id: true,
            phone: true,
            identity: {
              select: { firstName: true, lastName: true, status: true },
            },
          },
        },
      },
    });
    if (!referral) return null;
    return {
      referralId: referral.id,
      userId: referral.referrer.id,
      phone: referral.referrer.phone,
      fullName: fullName(referral.referrer.identity),
      rewarded: referral.rewardClaimed,
      createdAt: referral.createdAt.toISOString(),
    };
  }
}

/** خطای داخلی برای لغو تراکنش پاداش بدون ثبت به‌عنوان خطای سیستمی */
class SkipReward extends Error {}
