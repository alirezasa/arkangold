import {
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CivilRegistryService } from './civil-registry.service';
import { SubmitIdentityDto } from '@arkan-gold/shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private civilRegistry: CivilRegistryService,
  ) {}

  // ══════════════════════════════════════════
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        identity: true,
        legalProfile: true,
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
      wallet: user.wallet
        ? {
            goldBalanceGrams: user.wallet.goldBalanceGrams,
            rialBalance: user.wallet.rialBalance,
            cardNumber: user.wallet.cardNumber,
          }
        : null,
      identity: user.identity
        ? {
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            nationalCode: user.identity.nationalCode,
            birthDate: user.identity.birthDate,
            status: user.identity.status,
            verifiedAt: user.identity.verifiedAt,
          }
        : null,
      legalProfile: user.legalProfile ?? null,
      limits: user.limits ?? null,
      createdAt: user.createdAt,
    };
  }

  // ══════════════════════════════════════════
  async submitIdentity(userId: string, dto: SubmitIdentityDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    // اگر قبلاً تایید شده، نمی‌توان دوباره ارسال کرد
    if (user.identity?.status === 'VERIFIED') {
      throw new ConflictException('هویت شما قبلاً تایید شده است');
    }

    // استعلام از وب‌سرویس ثبت احوال
    let civilResult: { matched: boolean; reason?: string };
    try {
      civilResult = await this.civilRegistry.verify(
        dto.nationalCode,
        dto.firstName,
        dto.lastName,
        dto.birthDate,
      );
    } catch (err) {
      this.logger.error('خطا در ارتباط با وب‌سرویس ثبت احوال', err);
      // در صورت خطای وب‌سرویس: ذخیره با وضعیت MANUAL_REVIEW
      await this.upsertIdentity(userId, dto, 'MANUAL_REVIEW');
      throw new ServiceUnavailableException(
        'سرویس احراز هویت موقتاً در دسترس نیست. اطلاعات شما ذخیره شد و بعداً بررسی خواهد شد.',
      );
    }

    if (!civilResult.matched) {
      // ذخیره برای بررسی دستی
      await this.upsertIdentity(userId, dto, 'MANUAL_REVIEW');
      return {
        status: 'MANUAL_REVIEW',
        message:
          'اطلاعات وارد شده با سوابق ثبت احوال تطابق کامل ندارد. درخواست شما برای بررسی دستی ثبت شد.',
      };
    }

    // تایید خودکار
    const identity = await this.upsertIdentity(userId, dto, 'VERIFIED');
    return {
      status: 'VERIFIED',
      message: 'احراز هویت با موفقیت انجام شد',
      identity: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        status: identity.status,
        verifiedAt: identity.verifiedAt,
      },
    };
  }

  // ══════════════════════════════════════════
  private async upsertIdentity(
    userId: string,
    dto: SubmitIdentityDto,
    status: 'VERIFIED' | 'MANUAL_REVIEW' | 'PENDING',
  ) {
    const data = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalCode: dto.nationalCode,
      birthDate: new Date(dto.birthDate),
      status,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    };

    return this.prisma.userIdentity.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
