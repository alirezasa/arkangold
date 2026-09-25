// api/src/accounting/party-ledger.service.ts
//
// دفتر معین طرف‌حساب‌ها (تأمین‌کنندگان طلا و شرکای فروش). هر ردیف مانده‌ی پس از خود
// را نگه می‌دارد و مانده‌ی طرف حساب با قفل ردیف به‌روز می‌شود؛ همیشه داخل همان
// تراکنش سند دفتر کل صدا زده می‌شود.
//
// قرارداد علامت: مانده‌ی مثبت = طرف حساب به ما بدهکار است (طلب ما)،
// مانده‌ی منفی = ما به طرف حساب بدهکاریم.

import { Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PartyType, Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

export interface PartyLedgerInput {
  partyType: PartyType;
  partyId: string;
  type: string;
  /** افزایش طلب ما / کاهش بدهی ما */
  debitRial?: Decimal;
  /** کاهش طلب ما / افزایش بدهی ما */
  creditRial?: Decimal;
  description: string;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  journalEntryId?: string | null;
  createdByAdminId?: string | null;
}

@Injectable()
export class PartyLedgerService {
  async post(tx: Tx, input: PartyLedgerInput) {
    const table =
      input.partyType === 'SUPPLIER' ? 'suppliers' : 'sales_partners';
    // قفل ردیف طرف حساب تا مانده‌ی ردیف‌های هم‌زمان درست محاسبه شود
    await tx.$executeRawUnsafe(
      `SELECT 1 FROM "${table}" WHERE "id" = $1::uuid FOR UPDATE`,
      input.partyId,
    );
    const party =
      input.partyType === 'SUPPLIER'
        ? await tx.supplier.findUnique({
            where: { id: input.partyId },
            select: { balanceRial: true },
          })
        : await tx.salesPartner.findUnique({
            where: { id: input.partyId },
            select: { balanceRial: true },
          });
    if (!party) throw new NotFoundException('طرف حساب یافت نشد');

    const debit = input.debitRial ?? new Decimal(0);
    const credit = input.creditRial ?? new Decimal(0);
    const balanceAfter = new Decimal(party.balanceRial.toString())
      .plus(debit)
      .minus(credit);

    if (input.partyType === 'SUPPLIER') {
      await tx.supplier.update({
        where: { id: input.partyId },
        data: { balanceRial: balanceAfter.toFixed(0) },
      });
    } else {
      await tx.salesPartner.update({
        where: { id: input.partyId },
        data: { balanceRial: balanceAfter.toFixed(0) },
      });
    }

    return tx.partyLedgerEntry.create({
      data: {
        partyType: input.partyType,
        partyId: input.partyId,
        type: input.type,
        debitRial: debit.toFixed(0),
        creditRial: credit.toFixed(0),
        balanceAfterRial: balanceAfter.toFixed(0),
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceNumber: input.referenceNumber,
        journalEntryId: input.journalEntryId ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      },
    });
  }

  async statement(
    prisma: Tx,
    partyType: PartyType,
    partyId: string,
    query: { page?: number; limit?: number; from?: string; to?: string },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 30), 200);
    const where: Prisma.PartyLedgerEntryWhereInput = { partyType, partyId };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    const [rows, total, sums] = await Promise.all([
      prisma.partyLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.partyLedgerEntry.count({ where }),
      prisma.partyLedgerEntry.aggregate({
        where,
        _sum: { debitRial: true, creditRial: true },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        debitRial: r.debitRial.toString(),
        creditRial: r.creditRial.toString(),
        balanceAfterRial: r.balanceAfterRial.toString(),
        description: r.description,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        referenceNumber: r.referenceNumber,
        journalEntryId: r.journalEntryId,
        createdAt: r.createdAt.toISOString(),
      })),
      totals: {
        debitRial: (sums._sum.debitRial ?? 0).toString(),
        creditRial: (sums._sum.creditRial ?? 0).toString(),
      },
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
