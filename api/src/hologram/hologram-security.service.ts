// api/src/hologram/hologram-security.service.ts
//
// محدودیت نرخ + مسدودسازی خودکار IP برای استعلام عمومی اصالت‌سنجی (بند ۵).
// Redis برای شمارش سریع (rate limit در حال حرکت + شمارنده تلاش نامعتبر) استفاده
// می‌شود؛ HologramRateLimitBlock در Postgres مرجع نهایی «آیا این IP مسدود است»
// است تا هم قابل گزارش‌گیری/جستجو در پنل ادمین باشد و هم امکان unblock دستی
// وجود داشته باشد. یک کپی سبک از وضعیت مسدودیت هم در Redis با TTL نگه داشته
// می‌شود تا مسیر پرترافیک (چک هر استعلام) نیازی به query دیتابیس نداشته باشد.

import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { GetHologramRateLimitBlocksQueryDto } from '@arkan-gold/shared';

const RATE_KEY_PREFIX = 'hologram:rate';
const INVALID_KEY_PREFIX = 'hologram:invalid';
const BLOCK_CACHE_PREFIX = 'hologram:blocked';

export interface HologramSecuritySettings {
  rateLimitPerMinute: number;
  invalidAttemptsThreshold: number;
  invalidAttemptsWindowMinutes: number;
  blockDurationMinutes: number;
}

@Injectable()
export class HologramSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getSettings(): Promise<HologramSecuritySettings> {
    const [
      rateLimitPerMinute,
      invalidAttemptsThreshold,
      invalidAttemptsWindowMinutes,
      blockDurationMinutes,
    ] = await Promise.all([
      this.systemConfig.getNumber('hologram.inquiry.rate_limit_per_minute', 5),
      this.systemConfig.getNumber(
        'hologram.inquiry.invalid_attempts_threshold',
        5,
      ),
      this.systemConfig.getNumber(
        'hologram.inquiry.invalid_attempts_window_minutes',
        60,
      ),
      this.systemConfig.getNumber(
        'hologram.inquiry.block_duration_minutes',
        1440,
      ),
    ]);
    return {
      rateLimitPerMinute,
      invalidAttemptsThreshold,
      invalidAttemptsWindowMinutes,
      blockDurationMinutes,
    };
  }

  async updateSettings(
    patch: Partial<HologramSecuritySettings>,
  ): Promise<HologramSecuritySettings> {
    if (patch.rateLimitPerMinute !== undefined) {
      await this.systemConfig.set(
        'hologram.inquiry.rate_limit_per_minute',
        String(patch.rateLimitPerMinute),
      );
    }
    if (patch.invalidAttemptsThreshold !== undefined) {
      await this.systemConfig.set(
        'hologram.inquiry.invalid_attempts_threshold',
        String(patch.invalidAttemptsThreshold),
      );
    }
    if (patch.invalidAttemptsWindowMinutes !== undefined) {
      await this.systemConfig.set(
        'hologram.inquiry.invalid_attempts_window_minutes',
        String(patch.invalidAttemptsWindowMinutes),
      );
    }
    if (patch.blockDurationMinutes !== undefined) {
      await this.systemConfig.set(
        'hologram.inquiry.block_duration_minutes',
        String(patch.blockDurationMinutes),
      );
    }
    return this.getSettings();
  }

  /** باید پیش از پردازش هر استعلام صدا زده شود — هم بلوک فعلی و هم سقف نرخ را بررسی می‌کند */
  async assertAllowed(ipAddress: string): Promise<void> {
    const blockedInCache = await this.redis.get(
      `${BLOCK_CACHE_PREFIX}:${ipAddress}`,
    );
    if (blockedInCache) {
      throw new ForbiddenException('دسترسی شما موقتاً محدود شده است');
    }

    const settings = await this.getSettings();
    const rateKey = `${RATE_KEY_PREFIX}:${ipAddress}`;
    const count = await this.redis.incr(rateKey);
    if (count === 1) {
      await this.redis.expire(rateKey, 60);
    }
    if (count > settings.rateLimitPerMinute) {
      throw new HttpException(
        'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** پس از مشخص شدن نتیجه استعلام صدا زده می‌شود؛ فقط کدهای نامعتبر شمارش می‌شوند */
  async recordAttempt(ipAddress: string, wasValidCode: boolean): Promise<void> {
    if (wasValidCode) return;

    const settings = await this.getSettings();
    const invalidKey = `${INVALID_KEY_PREFIX}:${ipAddress}`;
    const windowSeconds = settings.invalidAttemptsWindowMinutes * 60;
    const count = await this.redis.incr(invalidKey);
    if (count === 1) {
      await this.redis.expire(invalidKey, windowSeconds);
    }

    if (count >= settings.invalidAttemptsThreshold) {
      await this.blockIp(
        ipAddress,
        count,
        `عبور از سقف ${settings.invalidAttemptsThreshold} استعلام نامعتبر در ${settings.invalidAttemptsWindowMinutes} دقیقه`,
        settings.blockDurationMinutes,
      );
      await this.redis.del(invalidKey);
    }
  }

  private async blockIp(
    ipAddress: string,
    failedAttemptsCount: number,
    reason: string,
    blockDurationMinutes: number,
  ): Promise<void> {
    const blockedUntil = new Date(
      Date.now() + blockDurationMinutes * 60 * 1000,
    );

    await this.prisma.hologramRateLimitBlock.upsert({
      where: { ipAddress },
      create: { ipAddress, blockedUntil, reason, failedAttemptsCount },
      update: {
        blockedAt: new Date(),
        blockedUntil,
        reason,
        failedAttemptsCount,
        unblockedAt: null,
        unblockedByAdminId: null,
      },
    });

    await this.redis.setex(
      `${BLOCK_CACHE_PREFIX}:${ipAddress}`,
      blockDurationMinutes * 60,
      '1',
    );
  }

  async listBlocks(query: GetHologramRateLimitBlocksQueryDto) {
    const where = query.includeExpired
      ? {}
      : { blockedUntil: { gt: new Date() }, unblockedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.hologramRateLimitBlock.findMany({
        where,
        orderBy: { blockedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { unblockedByAdmin: { select: { id: true, fullName: true } } },
      }),
      this.prisma.hologramRateLimitBlock.count({ where }),
    ]);
    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async unblock(adminId: string, ipAddress: string) {
    const block = await this.prisma.hologramRateLimitBlock.findUnique({
      where: { ipAddress },
    });
    if (!block)
      return {
        message: 'مسدودیتی برای این IP ثبت نشده است',
        alreadyProcessed: true,
      };

    await this.prisma.hologramRateLimitBlock.update({
      where: { ipAddress },
      data: {
        unblockedAt: new Date(),
        unblockedByAdminId: adminId,
        blockedUntil: new Date(),
      },
    });
    await this.redis.del(`${BLOCK_CACHE_PREFIX}:${ipAddress}`);

    return { message: 'مسدودیت این IP رفع شد', alreadyProcessed: false };
  }
}
