import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from '@arkan-gold/shared';
import { Address } from '../generated/prisma/client';
import {
  getProvince,
  isProvinceCode,
  resolveProvinceCode,
} from '../shipping/iran-provinces';

const MAX_ADDRESSES = 10;

const clean = (v: string | undefined) =>
  v === undefined ? undefined : v.trim().replace(/\s+/g, ' ') || null;

/**
 * دفترچه‌ی آدرس کاربر. سفارش‌ها snapshot نشانی را نگه می‌دارند، پس ویرایش آدرس سابقه را تغییر
 * نمی‌دهد؛ حذف «نرم» است تا ارتباط سفارش‌ها و درخواست‌های تحویل قبلی با آدرس حفظ شود.
 */
@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((a) => this.toView(a));
  }

  async create(userId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({
      where: { userId, deletedAt: null },
    });
    if (count >= MAX_ADDRESSES) {
      throw new BadRequestException(`حداکثر ${MAX_ADDRESSES} آدرس مجاز است`);
    }
    // سازگاری با کلاینت‌های قدیمی که نام استان را متنی می‌فرستند
    const provinceCode =
      dto.provinceCode ?? resolveProvinceCode({ province: dto.province });
    const fields = this.validate({
      title: clean(dto.title),
      provinceCode,
      city: clean(dto.city),
      postalCode: clean(dto.postalCode),
      fullAddress: clean(dto.fullAddress),
      plaque: clean(dto.plaque),
      unit: clean(dto.unit),
      receiverName: clean(dto.receiverName),
      receiverPhone: clean(dto.receiverPhone),
    });
    const makeDefault = count === 0 || dto.isDefault === true;

    const address = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: { userId, isDefault: makeDefault, ...fields },
      });
    });
    return this.toView(address);
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    const current = await this.getOwned(userId, addressId);
    const merged = this.validate({
      title: dto.title !== undefined ? clean(dto.title) : current.title,
      provinceCode:
        dto.provinceCode !== undefined
          ? dto.provinceCode
          : resolveProvinceCode(current),
      city: dto.city !== undefined ? clean(dto.city) : current.city,
      postalCode:
        dto.postalCode !== undefined
          ? clean(dto.postalCode)
          : current.postalCode,
      fullAddress:
        dto.fullAddress !== undefined
          ? clean(dto.fullAddress)
          : current.fullAddress,
      plaque: dto.plaque !== undefined ? clean(dto.plaque) : current.plaque,
      unit: dto.unit !== undefined ? clean(dto.unit) : current.unit,
      receiverName:
        dto.receiverName !== undefined
          ? clean(dto.receiverName)
          : current.receiverName,
      receiverPhone:
        dto.receiverPhone !== undefined
          ? clean(dto.receiverPhone)
          : current.receiverPhone,
    });

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true && !current.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          ...merged,
          ...(dto.isDefault === true ? { isDefault: true } : {}),
        },
      });
    });
    return this.toView(address);
  }

  async setDefault(userId: string, addressId: string) {
    await this.getOwned(userId, addressId);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);
    return { message: 'آدرس پیش‌فرض تغییر کرد' };
  }

  async remove(userId: string, addressId: string) {
    const current = await this.getOwned(userId, addressId);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id: addressId },
        data: { deletedAt: new Date(), isDefault: false },
      });
      if (current.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });
    return { message: 'آدرس حذف شد' };
  }

  async getOwned(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
    });
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    return address;
  }

  private validate(f: {
    title: string | null | undefined;
    provinceCode: string | null | undefined;
    city: string | null | undefined;
    postalCode: string | null | undefined;
    fullAddress: string | null | undefined;
    plaque: string | null | undefined;
    unit: string | null | undefined;
    receiverName: string | null | undefined;
    receiverPhone: string | null | undefined;
  }) {
    if (!isProvinceCode(f.provinceCode)) {
      throw new BadRequestException('استان را از فهرست انتخاب کنید');
    }
    if (!f.city || f.city.length < 2) {
      throw new BadRequestException('شهر را وارد کنید');
    }
    if (!f.fullAddress || f.fullAddress.length < 10) {
      throw new BadRequestException('نشانی کامل را حداقل ۱۰ کاراکتر وارد کنید');
    }
    if (f.postalCode && !/^\d{10}$/.test(f.postalCode)) {
      throw new BadRequestException('کد پستی باید ۱۰ رقم باشد');
    }
    if (!f.receiverName || f.receiverName.length < 3) {
      throw new BadRequestException(
        'نام و نام خانوادگی تحویل‌گیرنده را وارد کنید',
      );
    }
    if (!f.receiverPhone || !/^09\d{9}$/.test(f.receiverPhone)) {
      throw new BadRequestException(
        'شماره موبایل تحویل‌گیرنده باید ۱۱ رقم و با ۰۹ شروع شود',
      );
    }
    return {
      title: f.title ?? null,
      provinceCode: f.provinceCode,
      province: getProvince(f.provinceCode).name,
      city: f.city,
      postalCode: f.postalCode ?? null,
      fullAddress: f.fullAddress,
      plaque: f.plaque ?? null,
      unit: f.unit ?? null,
      receiverName: f.receiverName,
      receiverPhone: f.receiverPhone,
    };
  }

  /** کد استان آدرس‌های قدیمی (استان متنی) هم برای فرم ویرایش تشخیص داده می‌شود */
  private toView(a: Address) {
    const provinceCode = resolveProvinceCode(a);
    return {
      id: a.id,
      title: a.title,
      provinceCode,
      province: getProvince(provinceCode)?.name ?? a.province,
      city: a.city,
      postalCode: a.postalCode,
      fullAddress: a.fullAddress,
      plaque: a.plaque,
      unit: a.unit,
      receiverName: a.receiverName,
      receiverPhone: a.receiverPhone,
      isDefault: a.isDefault,
      /** برای ارسال پستی و تطبیق تعرفه تکمیل استان، شهر و کد پستی لازم است */
      incomplete: !provinceCode || !a.city || !a.postalCode,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
