// api/src/zarpayesh/zarpayesh-users.service.ts
//
// ثبت کاربران آرکان گلد در سامانه ناظر (AddPlatformUsers) و ویرایش آن‌ها (EditPlatformUsers).
// Reserve/MakeDeliveries/GetUserBalance فقط برای کاربری که در سامانه ناظر ثبت شده کار می‌کند
// (در غیر این صورت خطای ۱۰۰۲)؛ پیش از اولین معامله کاربر به‌صورت خودکار ثبت می‌شود.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { maskNationalCode } from '../common/privacy/masking';
import { maskPhone } from '../common/audit/mask.util';
import {
  CallContext,
  PlatformUserRequest,
  ZarPayeshClientService,
} from './zarpayesh-client.service';
import { ZarPayeshError } from './zarpayesh-errors';
import { isValidNationalCode } from './zarpayesh-crypto';

export interface ReportableUser {
  userId: string;
  nationalCode: string;
  request: PlatformUserRequest;
}

@Injectable()
export class ZarPayeshUsersService {
  private readonly logger = new Logger(ZarPayeshUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ZarPayeshClientService,
  ) {}

  /**
   * داده‌ی لازم برای AddPlatformUsers از پروفایل احرازشده‌ی کاربر — اگر ناقص باشد
   * خطای VALIDATION با پیام فارسی (برای نمایش به کاربر/ادمین) برمی‌گردد.
   */
  async buildUser(userId: string): Promise<ReportableUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        identity: {
          select: {
            firstName: true,
            lastName: true,
            nationalCode: true,
            birthDate: true,
            status: true,
          },
        },
        addresses: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { fullAddress: true, postalCode: true, city: true },
        },
        zarPayeshUser: { select: { fkCity: true } },
      },
    });
    if (!user) throw new ZarPayeshError('کاربر یافت نشد', 'VALIDATION');
    const id = user.identity;
    if (!id || id.status !== 'VERIFIED') {
      throw new ZarPayeshError(
        'برای ثبت در سامانه ناظر، احراز هویت کاربر باید تکمیل شده باشد',
        'VALIDATION',
      );
    }
    if (!id.nationalCode || !isValidNationalCode(id.nationalCode)) {
      throw new ZarPayeshError(
        'کد ملی کاربر برای ثبت در سامانه ناظر معتبر نیست',
        'VALIDATION',
        1054,
      );
    }
    const fullname = `${id.firstName ?? ''} ${id.lastName ?? ''}`.trim();
    if (!fullname) {
      throw new ZarPayeshError(
        'نام و نام خانوادگی کاربر ثبت نشده است',
        'VALIDATION',
      );
    }
    if (!id.birthDate) {
      throw new ZarPayeshError(
        'تاریخ تولد کاربر ثبت نشده است (فیلد اجباری سامانه ناظر)',
        'VALIDATION',
      );
    }
    const addr = user.addresses[0];
    return {
      userId: user.id,
      nationalCode: id.nationalCode,
      request: {
        fullname,
        mobile: user.phone,
        nationalCode: id.nationalCode,
        birthdate: id.birthDate.toISOString(),
        address: addr?.fullAddress ?? '',
        postCode: (addr?.postalCode ?? '').replace(/[^\d]/g, ''),
        fkCity: user.zarPayeshUser?.fkCity ?? 0,
      },
    };
  }

  /** کاربر را در صورت نیاز ثبت می‌کند و کد ملی (برای cid) را برمی‌گرداند */
  async ensureRegistered(
    userId: string,
    ctx: CallContext,
    opts: { autoRegister: boolean; force?: boolean },
  ): Promise<string> {
    const built = await this.buildUser(userId);
    const row = await this.prisma.zarPayeshUser.findUnique({
      where: { userId },
    });
    if (row?.status === 'REGISTERED' && !opts.force) return built.nationalCode;
    if (!opts.autoRegister && !opts.force) {
      throw new ZarPayeshError(
        'کاربر هنوز در سامانه ناظر ثبت نشده است (ثبت خودکار خاموش است)',
        'VALIDATION',
        1002,
      );
    }
    await this.register(built, { ...ctx, userId });
    return built.nationalCode;
  }

  private async register(built: ReportableUser, ctx: CallContext) {
    try {
      await this.client.addPlatformUsers(built.request, ctx);
    } catch (err) {
      // ۱۰۱۶ = «کاربر ارسالی تکراری است. اطلاعات موجود میباشد» → یعنی قبلاً ثبت شده
      if (!(err instanceof ZarPayeshError && err.code === 1016)) {
        await this.prisma.zarPayeshUser.upsert({
          where: { userId: built.userId },
          create: {
            userId: built.userId,
            status: 'FAILED',
            lastError: (err as Error).message,
            lastErrorCode: err instanceof ZarPayeshError ? err.logCode : null,
          },
          update: {
            status: 'FAILED',
            lastError: (err as Error).message,
            lastErrorCode: err instanceof ZarPayeshError ? err.logCode : null,
          },
        });
        throw err;
      }
    }
    const now = new Date();
    await this.prisma.zarPayeshUser.upsert({
      where: { userId: built.userId },
      create: {
        userId: built.userId,
        status: 'REGISTERED',
        registeredAt: now,
        lastSyncedAt: now,
        fkCity: built.request.fkCity,
      },
      update: {
        status: 'REGISTERED',
        registeredAt: now,
        lastSyncedAt: now,
        lastError: null,
        lastErrorCode: null,
      },
    });
    this.logger.log(
      `[ZarPayesh] کاربر ${built.userId} (${maskNationalCode(built.nationalCode)}) در سامانه ناظر ثبت شد`,
    );
  }

  /** EditPlatformUsers — همگام‌سازی نام، موبایل، تاریخ تولد، نشانی و شهر (کد ملی غیرقابل ویرایش) */
  async edit(userId: string, ctx: CallContext, fkCity?: number) {
    if (fkCity != null) {
      await this.prisma.zarPayeshUser.upsert({
        where: { userId },
        create: { userId, fkCity },
        update: { fkCity },
      });
    }
    const built = await this.buildUser(userId);
    await this.client.editPlatformUsers(built.request, { ...ctx, userId });
    await this.prisma.zarPayeshUser.upsert({
      where: { userId },
      create: {
        userId,
        status: 'REGISTERED',
        registeredAt: new Date(),
        lastSyncedAt: new Date(),
        fkCity: built.request.fkCity,
      },
      update: {
        lastSyncedAt: new Date(),
        lastError: null,
        lastErrorCode: null,
      },
    });
    return { message: 'اطلاعات کاربر در سامانه ناظر ویرایش شد' };
  }

  async markUnregistered(userId: string) {
    await this.prisma.zarPayeshUser.updateMany({
      where: { userId },
      data: { status: 'PENDING' },
    });
  }

  /** پیش‌نمایش داده‌ی ارسالی (پوشانده) — برای پنل ادمین */
  async preview(userId: string) {
    const built = await this.buildUser(userId);
    return {
      ...built.request,
      mobile: maskPhone(built.request.mobile),
      nationalCode: maskNationalCode(built.request.nationalCode),
    };
  }
}
