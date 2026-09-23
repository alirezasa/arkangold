// api/src/security/security-admin.controller.ts
// پنل «امنیت و رمزنگاری» (کلاس FCS): وضعیت اسرار، کلیدهای JWT، رمزنگاری Credentialها،
// نگهداری داده و شکست‌های رمزنگاری. هیچ endpointی مقدار کلید یا راز را برنمی‌گرداند.
import { Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../integrations/credentials/credential-encryption.service';
import { ProviderCredentialService } from '../integrations/credentials/provider-credential.service';
import { RetentionService } from '../common/retention/retention.service';
import { JWT_KEY_NAMES, jwtKeyStatus } from '../common/secrets/jwt-keyring';
import {
  MANAGED_SECRET_NAMES,
  MIN_JWT_SECRET_BYTES,
  getSecretSource,
} from '../common/secrets/load-secrets';
import { BCRYPT_COST, BCRYPT_MAX_BYTES } from '../common/crypto/password.util';

const DAY_MS = 24 * 60 * 60 * 1000;

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/security')
export class SecurityAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CredentialEncryptionService,
    private readonly credentials: ProviderCredentialService,
    private readonly retention: RetentionService,
  ) {}

  @Get('crypto-status')
  @RequirePermission('security.crypto.view')
  async cryptoStatus() {
    const now = Date.now();
    const [inventory, pending, lastRun, failures24h, failures7d] = await Promise.all([
      this.credentials.inventory(),
      this.retention.pendingCounts(),
      this.retention.lastRun(),
      this.prisma.auditLog.count({
        where: { action: 'security.crypto_failure', createdAt: { gte: new Date(now - DAY_MS) } },
      }),
      this.prisma.auditLog.count({
        where: { action: 'security.crypto_failure', createdAt: { gte: new Date(now - 7 * DAY_MS) } },
      }),
    ]);

    const vaultConfigured = !!process.env.VAULT_ADDR;
    return {
      secrets: {
        vault: {
          configured: vaultConfigured,
          kvEnabled: vaultConfigured && process.env.VAULT_KV_DISABLED !== 'true',
          kvPath: vaultConfigured
            ? `${process.env.VAULT_KV_MOUNT ?? 'secret'}/${process.env.VAULT_KV_PATH ?? 'arkangold/api'}`
            : null,
          auth: process.env.VAULT_ROLE_ID ? 'approle' : process.env.VAULT_TOKEN ? 'token' : null,
        },
        items: MANAGED_SECRET_NAMES.filter(
          (n) => !n.endsWith('_PREVIOUS') || !!process.env[n],
        ).map((name) => ({ name, source: getSecretSource(name) })),
      },
      jwt: {
        algorithm: 'HS256',
        minBits: MIN_JWT_SECRET_BYTES * 8,
        keys: jwtKeyStatus().map((k) => ({
          ...k,
          strong: k.bits >= MIN_JWT_SECRET_BYTES * 8,
        })),
        totalKeys: JWT_KEY_NAMES.length,
      },
      credentialEncryption: {
        ...this.encryption.status(),
        maxAgeDays: inventory.maxAgeDays,
        credentials: inventory.items,
      },
      passwordHashing: {
        algorithm: 'bcrypt',
        cost: BCRYPT_COST,
        maxBytes: BCRYPT_MAX_BYTES,
      },
      retention: {
        schedule: 'روزانه ۰۳:۳۰ UTC',
        pending,
        lastRun,
      },
      cryptoFailures: { last24h: failures24h, last7d: failures7d },
    };
  }

  @Post('credentials/re-encrypt')
  @RequirePermission('security.crypto.manage')
  @AuditLog('security.credentials.reencrypt')
  @UseInterceptors(AuditLogInterceptor)
  reencryptCredentials() {
    return this.credentials.reencryptAll();
  }

  @Post('retention/run')
  @RequirePermission('security.crypto.manage')
  @AuditLog('security.retention.run')
  @UseInterceptors(AuditLogInterceptor)
  runRetention() {
    return this.retention.purgeExpired();
  }
}
