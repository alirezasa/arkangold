// api/src/common/documents/document-sequence.service.ts

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { currentJalaliYear, toPersianDigits } from '../utils/jalali.util';

export type DocumentPrefix = 'INV' | 'PRF' | 'DEP' | 'HOLO';

const PREFIX_LABEL: Record<DocumentPrefix, string> = {
  INV: 'INV',
  PRF: 'PRF',
  DEP: 'DEP',
  HOLO: 'HOLO',
};

@Injectable()
export class DocumentSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * شماره سند بعدی را اتمیک تولید می‌کند.
   *
   * از UPSERT ... RETURNING پستگرس استفاده می‌شود که خودش قفل ردیف را
   * می‌گیرد و آزاد می‌کند — هیچ race condition ای ممکن نیست، حتی بدون
   * SELECT ... FOR UPDATE صریح.
   *
   * ⚠ همیشه با tx همان تراکنش مالی صدا زده شود تا اگر تراکنش rollback
   * شد، شماره هم مصرف نشود.
   */
  async next(
    tx: Prisma.TransactionClient,
    prefix: DocumentPrefix,
    date = new Date(),
  ): Promise<string> {
    const jYear = currentJalaliYear(date);
    const key = `${prefix}:${jYear}`;

    const rows = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO "document_sequences" ("key", "last_number", "updated_at")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET "last_number" = "document_sequences"."last_number" + 1,
                    "updated_at"  = NOW()
      RETURNING "last_number"
    `;

    const serial = rows[0].last_number;
    return `AG-${jYear}-${PREFIX_LABEL[prefix]}-${String(serial).padStart(6, '0')}`;
  }

  /** نمایش فارسی شماره سند برای چاپ: AG-۱۴۰۴-INV-۰۰۰۱۲۳ */
  static toDisplay(documentNumber: string): string {
    return documentNumber.replace(/\d+/g, (m) => toPersianDigits(m));
  }
}
