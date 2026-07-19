// api/src/admin-auth/admin-management.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

interface CreateAdminDto {
  username: string;
  password: string;
  fullName: string;
  roleKey: string;
}

interface UpdateAdminDto {
  fullName?: string;
  roleKey?: string;
  isActive?: boolean;
}

@Injectable()
export class AdminManagementService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const admins = await this.prisma.adminUser.findMany({
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return admins.map((a) => ({
      id: a.id,
      username: a.username,
      fullName: a.fullName,
      isActive: a.isActive,
      totpEnabled: a.totpEnabled,
      role: { key: a.role.key, name: a.role.name },
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt,
    }));
  }

  async listRoles() {
    return this.prisma.adminRole.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(creatorId: string, dto: CreateAdminDto) {
    if (dto.password.length < 12) {
      throw new BadRequestException('رمز عبور باید حداقل ۱۲ کاراکتر باشد');
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
    });
    if (existing)
      throw new ConflictException('این نام کاربری قبلاً استفاده شده است');

    const role = await this.prisma.adminRole.findUnique({
      where: { key: dto.roleKey },
    });
    if (!role) throw new NotFoundException('نقش انتخاب‌شده یافت نشد');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const admin = await this.prisma.adminUser.create({
      data: {
        username: dto.username,
        passwordHash,
        fullName: dto.fullName,
        roleId: role.id,
        createdById: creatorId,
      },
      include: { role: true },
    });

    return {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      role: { key: admin.role.key, name: admin.role.name },
    };
  }

  async update(actorId: string, targetId: string, dto: UpdateAdminDto) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');

    // جلوگیری از غیرفعال کردن یا تنزل نقش خودِ فرد (باید یک SUPER_ADMIN دیگر این کار را بکند)
    if (actorId === targetId && (dto.isActive === false || dto.roleKey)) {
      throw new ForbiddenException(
        'امکان تغییر نقش یا غیرفعال کردن حساب خودتان وجود ندارد',
      );
    }

    let roleId: string | undefined;
    if (dto.roleKey) {
      const role = await this.prisma.adminRole.findUnique({
        where: { key: dto.roleKey },
      });
      if (!role) throw new NotFoundException('نقش انتخاب‌شده یافت نشد');
      roleId = role.id;
    }

    // اگر آخرین SUPER_ADMIN فعال است، اجازه غیرفعال‌سازی یا تغییر نقشش را نده
    if (
      target.role.key === 'SUPER_ADMIN' &&
      (dto.isActive === false || (dto.roleKey && dto.roleKey !== 'SUPER_ADMIN'))
    ) {
      const activeSuperAdmins = await this.prisma.adminUser.count({
        where: { role: { key: 'SUPER_ADMIN' }, isActive: true },
      });
      if (activeSuperAdmins <= 1) {
        throw new ForbiddenException(
          'نمی‌توانید آخرین مدیر ارشد فعال سیستم را غیرفعال یا تنزل دهید',
        );
      }
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: targetId },
      data: {
        fullName: dto.fullName,
        roleId,
        isActive: dto.isActive,
      },
      include: { role: true },
    });

    // اگر غیرفعال شد یا نقشش عوض شد، همه نشست‌هایش را باطل کن
    if (dto.isActive === false || dto.roleKey) {
      await this.prisma.adminSession.deleteMany({
        where: { adminUserId: targetId },
      });
    }

    return {
      id: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      isActive: updated.isActive,
      role: { key: updated.role.key, name: updated.role.name },
    };
  }

  async resetPassword(actorId: string, targetId: string, newPassword: string) {
    if (newPassword.length < 12) {
      throw new BadRequestException('رمز عبور باید حداقل ۱۲ کاراکتر باشد');
    }
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id: targetId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    // ریست رمز یعنی همه نشست‌های فعلی باطل شوند
    await this.prisma.adminSession.deleteMany({
      where: { adminUserId: targetId },
    });

    return { message: 'رمز عبور با موفقیت بازنشانی شد' };
  }
}
