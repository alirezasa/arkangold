import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, $Enums } from '../generated/prisma/client';
import { ReferralService } from '../referral/referral.service';
import { maskNationalCode } from '../common/privacy/masking';

interface ListUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
}

@Injectable()
export class UsersAdminService {
  constructor(
    private prisma: PrismaService,
    private referralService: ReferralService,
  ) {}

  async list(query: ListUsersQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status as $Enums.UserStatus } : {}),
      ...(query.type ? { type: query.type as $Enums.UserType } : {}),
      ...(query.search
        ? {
            OR: [
              { phone: { contains: query.search } },
              {
                identity: {
                  firstName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                identity: {
                  lastName: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          identity: {
            select: { firstName: true, lastName: true, status: true },
          },
          wallet: { select: { rialBalance: true, goldBalanceGrams: true } },
          _count: { select: { sentReferrals: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items.map((u) => ({
        id: u.id,
        phone: u.phone,
        type: u.type,
        status: u.status,
        fullName: u.identity
          ? `${u.identity.firstName ?? ''} ${u.identity.lastName ?? ''}`.trim()
          : null,
        identityStatus: u.identity?.status ?? null,
        mobileVerificationStatus: u.mobileVerificationStatus,
        // اصلاح خطا: استفاده از String() برای تبدیل امن Decimal به رشته
        rialBalance: u.wallet ? String(u.wallet.rialBalance) : '0',
        goldBalanceGrams: u.wallet ? String(u.wallet.goldBalanceGrams) : '0',
        // تعداد دوستانی که این کاربر با کد/لینک دعوتش ثبت‌نام کرده‌اند
        referralCount: u._count.sentReferrals,
        createdAt: u.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        identity: true,
        legalProfile: true,
        wallet: true,
        bankAccounts: true,
        limits: true,
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const [referralStats, referredBy] = await Promise.all([
      this.referralService.statsForReferrer(user.id),
      this.referralService.referrerOf(user.id),
    ]);

    return {
      id: user.id,
      phone: user.phone,
      type: user.type,
      status: user.status,
      referralCode: user.referralCode,
      // وضعیت ورود دومرحله‌ای (بدون هیچ راز یا کد بازیابی)
      mfa: {
        totpEnabled: user.totpEnabled,
        totpEnabledAt: user.totpEnabledAt,
        recoveryCodesRemaining: user.backupCodesHash.length,
      },
      // FDP_ACC_EXT.1.5 / FDP_RIP_EXT.1.3 — فقط فیلدهای لازم؛ کد ملی پوشانده و تاریخ تولد حذف
      // (نمایش کامل با revealIdentity و ثبت در ممیزی)
      identity: user.identity
        ? {
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            nationalCode: maskNationalCode(user.identity.nationalCode),
            birthDate: null,
            hasBirthDate: !!user.identity.birthDate,
            masked: true,
            fatherName: user.identity.fatherName,
            gender: user.identity.gender,
            deathStatus: user.identity.deathStatus,
            status: user.identity.status,
            verifiedAt: user.identity.verifiedAt,
            verifiedByProvider: user.identity.verifiedByProvider,
          }
        : null,
      legalProfile: user.legalProfile,
      wallet: user.wallet
        ? {
            // اصلاح خطا: تبدیل امن Decimal
            rialBalance: String(user.wallet.rialBalance),
            goldBalanceGrams: String(user.wallet.goldBalanceGrams),
            cardNumber: user.wallet.cardNumber,
          }
        : null,
      mobileVerification: {
        status: user.mobileVerificationStatus,
        checkedAt: user.mobileCheckedAt,
        verifiedAt: user.mobileVerifiedAt,
        provider: user.mobileCheckProvider,
        trackId: user.mobileCheckTrackId,
      },
      bankAccounts: user.bankAccounts.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        cardNumber: b.cardNumber,
        sheba: b.sheba,
        accountNumber: b.accountNumber || null,
        ownerName: b.ownerName,
        depositStatus: b.depositStatus,
        status: b.status,
        statusMessage: b.statusMessage,
        isVerified: b.isVerified,
        isDefault: b.isDefault,
        lastInquiryAt: b.lastInquiryAt,
        createdAt: b.createdAt,
      })),
      limits: user.limits,
      referralStats,
      referredBy,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** نمایش کامل کد ملی و تاریخ تولد کاربر برای کارشناس (با درخواست صریح؛ ممیزی در کنترلر) */
  async revealIdentity(userId: string) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { userId },
      select: { nationalCode: true, birthDate: true },
    });
    if (!identity) throw new NotFoundException('اطلاعات هویتی ثبت نشده است');
    return identity;
  }

  async setStatus(userId: string, status: 'ACTIVE' | 'BANNED' | 'INACTIVE') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    await this.prisma.user.update({ where: { id: userId }, data: { status } });

    if (status === 'BANNED') {
      await this.prisma.userSession.deleteMany({ where: { userId } });
    }

    return { message: 'وضعیت کاربر بروزرسانی شد', status };
  }
}
