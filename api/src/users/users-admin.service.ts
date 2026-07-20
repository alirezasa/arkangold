import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, $Enums } from '../generated/prisma/client';

interface ListUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
}

@Injectable()
export class UsersAdminService {
  constructor(private prisma: PrismaService) {}

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
        // اصلاح خطا: استفاده از String() برای تبدیل امن Decimal به رشته
        rialBalance: u.wallet ? String(u.wallet.rialBalance) : '0',
        goldBalanceGrams: u.wallet ? String(u.wallet.goldBalanceGrams) : '0',
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

    return {
      id: user.id,
      phone: user.phone,
      type: user.type,
      status: user.status,
      referralCode: user.referralCode,
      identity: user.identity,
      legalProfile: user.legalProfile,
      wallet: user.wallet
        ? {
            // اصلاح خطا: تبدیل امن Decimal
            rialBalance: String(user.wallet.rialBalance),
            goldBalanceGrams: String(user.wallet.goldBalanceGrams),
            cardNumber: user.wallet.cardNumber,
          }
        : null,
      bankAccounts: user.bankAccounts.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        cardNumber: b.cardNumber,
        isVerified: b.isVerified,
        isDefault: b.isDefault,
      })),
      limits: user.limits,
      createdAt: user.createdAt.toISOString(),
    };
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
