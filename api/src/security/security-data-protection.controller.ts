// api/src/security/security-data-protection.controller.ts
// بخش «حفاظت داده و فایل» پنل امنیت (کلاس‌های FDP و FPT): وضعیت و تنظیم کنترل‌های تطبیقی نشست،
// دسترسی شبکه/ساعت پنل، تأیید دونفره، ضدبدافزار و امنیت آپلود، قطع‌کننده‌ها و رویدادهای ۷ روز اخیر.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  SessionContextService,
  ipAllowed,
  parseAllowedHours,
  parseIpAllowlist,
  withinHours,
} from '../common/auth-security/session-context.service';
import { AntivirusService } from '../common/file-security/antivirus.service';
import { FileSecurityService } from '../common/file-security/file-security.service';
import {
  CATALOG_IMAGE_POLICY,
  DEPOSIT_RECEIPT_POLICY,
  LEGAL_DOCUMENT_POLICY,
  TICKET_ATTACHMENT_POLICY,
} from '../common/file-security/upload-policies';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';

const DAY_MS = 24 * 60 * 60 * 1000;

class UpdateDataProtectionDto {
  @IsOptional() @IsBoolean() sessionBinding?: boolean;
  @IsOptional() @IsBoolean() adminIpBinding?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) adminIpAllowlist?: string;
  @IsOptional() @IsString() @MaxLength(20) adminAllowedHours?: string;
  @IsOptional() @IsIn(['auto', 'required', 'off']) antivirusMode?:
    'auto' | 'required' | 'off';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1_000_000)
  @Max(200_000_000)
  maxImagePixels?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000_000)
  dualControlThresholdRial?: number;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/security')
export class SecurityDataProtectionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly sessionContext: SessionContextService,
    private readonly antivirus: AntivirusService,
    private readonly fileSecurity: FileSecurityService,
  ) {}

  @Get('data-protection')
  @RequirePermission('security.crypto.view')
  async status() {
    const since7d = new Date(Date.now() - 7 * DAY_MS);
    const countUser = (action: string | string[]) =>
      this.prisma.auditLog.count({
        where: {
          action: Array.isArray(action) ? { in: action } : action,
          createdAt: { gte: since7d },
        },
      });
    const countAdmin = (action: string | string[]) =>
      this.prisma.adminAuditLog.count({
        where: {
          action: Array.isArray(action) ? { in: action } : action,
          createdAt: { gte: since7d },
        },
      });

    const [
      session,
      av,
      maxPixels,
      dualThreshold,
      userTerminated,
      adminTerminated,
      networkChanged,
      loginDenied,
      undeclared,
      permissionDenied,
      reveals,
      malware,
      rejected,
      rejectedByReason,
    ] = await Promise.all([
      this.sessionContext.settings(),
      this.antivirus.status(),
      this.fileSecurity.maxImagePixels(),
      this.systemConfig.getNumber(
        'withdrawal.dual_control_threshold',
        500_000_000,
      ),
      countUser('auth.session_context_changed'),
      countAdmin('admin_auth.session_context_changed'),
      countUser('auth.session_network_changed'),
      countAdmin('admin_auth.login_context_denied'),
      countAdmin('admin_auth.permission_undeclared'),
      countAdmin('admin_auth.permission_denied'),
      Promise.all([
        countUser('user.identity_revealed'),
        countAdmin('user.identity_revealed'),
      ]).then(([u, a]) => ({ users: u, admins: a })),
      countUser('upload.malware_detected'),
      countUser('upload.rejected'),
      this.prisma.auditLog.findMany({
        where: { action: 'upload.rejected', createdAt: { gte: since7d } },
        select: { newValue: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const reasons: Record<string, number> = {};
    for (const r of rejectedByReason) {
      const reason =
        (r.newValue as { reason?: string } | null)?.reason ?? 'UNKNOWN';
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    const allow = parseIpAllowlist(session.ipAllowlist);
    const pendingDual = await this.prisma.withdrawalRequest.count({
      where: { status: 'APPROVED', amountRial: { gte: dualThreshold } },
    });

    return {
      session: {
        ...session,
        allowlistInvalid: allow?.invalid ?? [],
        allowedHoursValid:
          !session.allowedHours || !!parseAllowedHours(session.allowedHours),
        events7d: {
          userTerminated,
          adminTerminated,
          networkChanged,
          loginDenied,
        },
      },
      rbac: {
        defaultDeny: true,
        undeclared7d: undeclared,
        denied7d: permissionDenied,
      },
      masking: { reveals7d: reveals },
      dualControl: {
        thresholdRial: String(dualThreshold),
        pendingAboveThreshold: pendingDual,
      },
      antivirus: { ...av, malware7d: malware },
      uploads: {
        maxImagePixels: maxPixels,
        rejected7d: rejected,
        rejectedByReason: reasons,
        policies: [
          LEGAL_DOCUMENT_POLICY,
          TICKET_ATTACHMENT_POLICY,
          DEPOSIT_RECEIPT_POLICY,
          CATALOG_IMAGE_POLICY,
        ].map((p) => ({
          purpose: p.purpose,
          allowedExtensions: p.allowedExtensions,
          maxBytes: p.maxBytes,
          maxImageDimension: p.maxImageDimension ?? null,
          archiveInnerExtensions: p.archiveInnerExtensions ?? null,
          archiveLimits: p.archiveLimits ?? null,
        })),
      },
      resilience: { circuits: CircuitBreaker.snapshot() },
    };
  }

  @Put('data-protection/settings')
  @RequirePermission('security.crypto.manage')
  @AuditLog('security.data_protection.update')
  @UseInterceptors(AuditLogInterceptor)
  async update(@Body() dto: UpdateDataProtectionDto, @Req() req: Request) {
    const updates: [string, string][] = [];
    if (dto.sessionBinding !== undefined)
      updates.push([
        'security.session.binding_enabled',
        String(dto.sessionBinding),
      ]);
    if (dto.adminIpBinding !== undefined)
      updates.push([
        'security.session.admin_ip_binding',
        String(dto.adminIpBinding),
      ]);
    if (dto.adminIpAllowlist !== undefined) {
      const raw = dto.adminIpAllowlist.trim();
      const parsed = parseIpAllowlist(raw);
      if (parsed?.invalid.length) {
        throw new BadRequestException(
          `مقادیر نامعتبر در فهرست IP: ${parsed.invalid.join('، ')}`,
        );
      }
      // جلوگیری از قفل‌شدن: شبکه‌ی فعلی همین کارشناس باید در فهرست باشد
      if (
        parsed &&
        this.sessionContext.contextAvailable() &&
        !ipAllowed(parsed.list, req.ip)
      ) {
        throw new BadRequestException(
          'IP فعلی شما در این فهرست نیست؛ با ذخیره‌ی آن دسترسی خودتان قطع می‌شود',
        );
      }
      updates.push(['security.admin.ip_allowlist', raw]);
    }
    if (dto.adminAllowedHours !== undefined) {
      const raw = dto.adminAllowedHours.trim();
      const range = raw ? parseAllowedHours(raw) : null;
      if (raw && !range) {
        throw new BadRequestException(
          'بازه‌ی ساعت باید به شکل 07:00-22:00 باشد',
        );
      }
      if (range && !withinHours(range)) {
        throw new BadRequestException(
          'زمان فعلی خارج از این بازه است؛ با ذخیره‌ی آن دسترسی خودتان قطع می‌شود',
        );
      }
      updates.push(['security.admin.allowed_hours', raw]);
    }
    if (dto.antivirusMode !== undefined)
      updates.push(['upload.antivirus.mode', dto.antivirusMode]);
    if (dto.maxImagePixels !== undefined)
      updates.push(['upload.max_image_pixels', String(dto.maxImagePixels)]);
    if (dto.dualControlThresholdRial !== undefined)
      updates.push([
        'withdrawal.dual_control_threshold',
        String(dto.dualControlThresholdRial),
      ]);

    if (!updates.length) throw new BadRequestException('تغییری ارسال نشده است');
    for (const [key, value] of updates) await this.systemConfig.set(key, value);
    await this.systemConfig.invalidateCache();
    return {
      message: 'تنظیمات حفاظت داده ذخیره شد',
      updated: updates.map(([k]) => k),
    };
  }
}
