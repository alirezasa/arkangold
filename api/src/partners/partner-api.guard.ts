// api/src/partners/partner-api.guard.ts
//
// احراز هویت API عمومی شرکا با هدر `x-api-key`. کلید فقط به‌صورت هش SHA-256
// نگهداری می‌شود؛ شریک باید فعال، API او روشن و (در صورت تعریف) IP درخواست در
// فهرست مجاز باشد. کل API با تنظیم partner.api.enabled قابل خاموش شدن است.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { SalesPartner } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { extractClientIp } from '../hologram/hologram-ip.util';
import { hashApiKey } from './partners.service';

export interface PartnerRequest extends Request {
  partner: SalesPartner;
}

@Injectable()
export class PartnerApiGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<PartnerRequest>();
    if (!(await this.config.getBoolean('partner.api.enabled', false))) {
      throw new ServiceUnavailableException('API شرکای فروش غیرفعال است');
    }
    const raw = req.headers['x-api-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || key.length < 20 || key.length > 200) {
      throw new UnauthorizedException('کلید API نامعتبر است');
    }
    const hash = hashApiKey(key);
    const partner = await this.prisma.salesPartner.findUnique({
      where: { apiKeyHash: hash },
    });
    if (
      !partner?.apiKeyHash ||
      !timingSafeEqual(Buffer.from(partner.apiKeyHash), Buffer.from(hash))
    ) {
      throw new UnauthorizedException('کلید API نامعتبر است');
    }
    if (!partner.apiEnabled || partner.status !== 'ACTIVE') {
      throw new ForbiddenException('دسترسی API این شریک غیرفعال است');
    }
    if (partner.apiIpWhitelist.length) {
      const ip = extractClientIp(req);
      if (!partner.apiIpWhitelist.includes(ip)) {
        throw new ForbiddenException('IP درخواست در فهرست مجاز شریک نیست');
      }
    }
    req.partner = partner;
    return true;
  }
}
