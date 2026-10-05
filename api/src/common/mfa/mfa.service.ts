// api/src/common/mfa/mfa.service.ts
//
// مدیریت عامل دوم مبتنی بر برنامه‌ی احراز هویت (TOTP) و کدهای بازیابی، مشترک بین کاربران و ادمین‌ها.
// - راز TOTP با سرویس رمزنگاری (AES-256-GCM یا Vault Transit) و زمینه‌ی مختص حساب رمز می‌شود.
// - راه‌اندازی دو مرحله‌ای است: راز موقت در Redis (۱۰ دقیقه) تا وقتی کاربر یک کد درست وارد کند.
// - کدهای بازیابی یک‌بارمصرف‌اند و با bcrypt (نمک ۱۲۸ بیتی) ذخیره می‌شوند (FIA_UAU_EXT.3.2).
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialEncryptionService } from '../../integrations/credentials/credential-encryption.service';
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.util';

export type MfaOwnerKind = 'user' | 'admin';
export interface MfaOwner {
  kind: MfaOwnerKind;
  id: string;
}

const SETUP_TTL_SECONDS = 600;
const RECOVERY_BCRYPT_COST = 10;
const ISSUER = process.env.MFA_ISSUER || 'Arkan Gold';

export type MfaMethodUsed = 'totp' | 'recovery_code';

interface OwnerRow {
  totpSecret: string | null;
  totpEnabled: boolean;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
  backupCodesHash: string[];
}

@Injectable()
export class MfaService {
  constructor(
    private prisma: PrismaService,
    private encryption: CredentialEncryptionService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  private context(o: MfaOwner) {
    return `mfa-totp:${o.kind}:${o.id}`;
  }

  private async load(o: MfaOwner): Promise<OwnerRow | null> {
    const select = {
      totpSecret: true,
      totpEnabled: true,
      totpEnabledAt: true,
      totpLastStep: true,
      backupCodesHash: true,
    } as const;
    return o.kind === 'user'
      ? this.prisma.user.findUnique({ where: { id: o.id }, select })
      : this.prisma.adminUser.findUnique({ where: { id: o.id }, select });
  }

  private async save(o: MfaOwner, data: Partial<OwnerRow>) {
    if (o.kind === 'user') {
      await this.prisma.user.update({ where: { id: o.id }, data });
    } else {
      await this.prisma.adminUser.update({ where: { id: o.id }, data });
    }
  }

  async status(o: MfaOwner) {
    const row = await this.load(o);
    return {
      enabled: !!row?.totpEnabled,
      enabledAt: row?.totpEnabledAt ?? null,
      recoveryCodesRemaining: row?.backupCodesHash.length ?? 0,
    };
  }

  async isEnabled(o: MfaOwner) {
    return !!(await this.load(o))?.totpEnabled;
  }

  /** مرحله‌ی اول راه‌اندازی: راز جدید (هنوز فعال نشده) + QR */
  async beginSetup(o: MfaOwner, accountLabel: string) {
    const secret = generateTotpSecret();
    await this.redis.setex(
      `mfa-setup:${o.kind}:${o.id}`,
      SETUP_TTL_SECONDS,
      secret,
    );
    const uri = otpauthUri(secret, accountLabel, ISSUER);
    const qrSvg = await QRCode.toString(uri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return {
      secret,
      otpauthUri: uri,
      qrSvg,
      expiresIn: SETUP_TTL_SECONDS,
    };
  }

  /** مرحله‌ی دوم: کد درست = فعال‌سازی؛ کدهای بازیابی فقط همین یک‌بار برگردانده می‌شوند */
  async confirmSetup(o: MfaOwner, code: string): Promise<string[]> {
    const key = `mfa-setup:${o.kind}:${o.id}`;
    const secret = await this.redis.get(key);
    if (!secret) {
      throw new BadRequestException(
        'مهلت راه‌اندازی به پایان رسیده است؛ دوباره شروع کنید',
      );
    }
    const step = verifyTotp(secret, normalizeDigits(code), null);
    if (step === null) {
      throw new BadRequestException(
        'کد برنامه‌ی احراز هویت نادرست است؛ ساعت گوشی را بررسی کنید و کد جدید را وارد کنید',
      );
    }
    const codes = generateRecoveryCodes();
    await this.save(o, {
      totpSecret: await this.encryption.encrypt(secret, this.context(o)),
      totpEnabled: true,
      totpEnabledAt: new Date(),
      totpLastStep: step,
      backupCodesHash: await this.hashCodes(codes),
    });
    await this.redis.del(key);
    return codes;
  }

  /**
   * بررسی عامل دوم: کد ۶ رقمی برنامه یا کد بازیابی.
   * null یعنی نادرست؛ شمارش تلاش‌ها بر عهده‌ی فراخواننده است.
   */
  async verify(o: MfaOwner, rawCode: string): Promise<MfaMethodUsed | null> {
    const row = await this.load(o);
    if (!row?.totpEnabled || !row.totpSecret) return null;
    const code = normalizeDigits(rawCode ?? '').trim();

    if (/^\d{6}$/.test(code)) {
      const secret = await this.encryption.decrypt(
        row.totpSecret,
        this.context(o),
      );
      const step = verifyTotp(secret, code, row.totpLastStep);
      if (step === null) return null;
      // به‌روزرسانی شرطی تا دو درخواست هم‌زمان با یک کد هر دو موفق نشوند
      const where = {
        id: o.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      };
      const { count } =
        o.kind === 'user'
          ? await this.prisma.user.updateMany({
              where,
              data: { totpLastStep: step },
            })
          : await this.prisma.adminUser.updateMany({
              where,
              data: { totpLastStep: step },
            });
      return count === 1 ? 'totp' : null;
    }

    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 10) return null;
    for (const hash of row.backupCodesHash) {
      if (await bcrypt.compare(normalized, hash)) {
        const remaining = row.backupCodesHash.filter((h) => h !== hash);
        const where = { id: o.id, backupCodesHash: { has: hash } };
        const { count } =
          o.kind === 'user'
            ? await this.prisma.user.updateMany({
                where,
                data: { backupCodesHash: remaining },
              })
            : await this.prisma.adminUser.updateMany({
                where,
                data: { backupCodesHash: remaining },
              });
        return count === 1 ? 'recovery_code' : null;
      }
    }
    return null;
  }

  async regenerateRecoveryCodes(o: MfaOwner): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await this.save(o, { backupCodesHash: await this.hashCodes(codes) });
    return codes;
  }

  /** ابطال کامل عامل دوم (گم شدن/سرقت گوشی یا بازنشانی توسط مدیر) */
  async disable(o: MfaOwner) {
    await this.save(o, {
      totpSecret: null,
      totpEnabled: false,
      totpEnabledAt: null,
      totpLastStep: null,
      backupCodesHash: [],
    });
    await this.redis.del(`mfa-setup:${o.kind}:${o.id}`);
  }

  private hashCodes(codes: string[]) {
    return Promise.all(
      codes.map((c) =>
        bcrypt.hash(normalizeRecoveryCode(c), RECOVERY_BCRYPT_COST),
      ),
    );
  }

  get recoveryCodeCount() {
    return RECOVERY_CODE_COUNT;
  }
}

export function normalizeDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s/g, '');
}
