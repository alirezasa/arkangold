// api/src/deposit/deposit-tracking.service.ts

import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { SystemConfigService } from '../system-config/system-config.service';
import { withLuhn } from '../common/utils/luhn.util';

@Injectable()
export class DepositTrackingService {
  constructor(private readonly systemConfig: SystemConfigService) {}

  /**
   * شناسه واریز اختصاصی — ۱۶ رقم:
   *   [۴ رقم کد پذیرنده][۱۱ رقم تصادفی][۱ رقم کنترل Luhn]
   *
   * عددی خالص است چون فیلد «شناسه پایا» در بانک‌های ایرانی حروف
   * نمی‌پذیرد. رقم کنترل خطای تایپی کاربر را قبل از بانک می‌گیرد.
   */
  async generate(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = (
      await this.systemConfig.get('proforma.tracking_prefix', '1023')
    )
      .replace(/\D/g, '')
      .padStart(4, '0')
      .slice(0, 4);

    // تصادفی است، پس احتمال برخورد وجود دارد → retry (همان الگوی cardNumber کیف پول)
    for (let attempt = 0; attempt < 5; attempt++) {
      let body = '';
      for (let i = 0; i < 11; i++) body += String(randomInt(0, 10));
      const candidate = withLuhn(prefix + body);

      const clash = await tx.depositRequest.findUnique({
        where: { depositTrackingId: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    throw new Error('تولید شناسه واریز یکتا ناموفق بود');
  }
}
