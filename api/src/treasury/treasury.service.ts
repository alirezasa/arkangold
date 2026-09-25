// api/src/treasury/treasury.service.ts
//
// خزانه و خرید پوششی طلا:
//   • هر فروش طلای آب‌شده به کاربر (معامله، پاداش، پی‌رول، فروش اقساطی شرکا) بدهی طلایی
//     ایجاد می‌کند که باید معادل آن از بازار خریده و در خزانه نگهداری شود.
//   • «گزارش پوشش» کسری/مازاد خزانه را نسبت به بدهی طلایی کاربران محاسبه و مقدار خرید
//     پیشنهادی را اعلام می‌کند؛ از همان گزارش درخواست خرید (پیش‌نویس) ساخته می‌شود.
//   • چرخه‌ی سفارش خرید: پیش‌نویس ← قطعی (قیمت قفل و بدهی به تأمین‌کننده) ← رسید ورود
//     به خزانه؛ پرداخت‌ها جداگانه با دفتر معین تأمین‌کننده ثبت می‌شوند.
//   • فروش مازاد خزانه، شمارش فیزیکی خزانه (انبارگردانی) و ثبت مغایرت.
//
// نقشه‌ی حساب‌ها: 1020 خزانه آب‌شده (۷۵۰) — 1025 شمش — 1060 در راه — 1080 مالیات خرید —
// 1090 واسط پوشش آب‌شده — 1095 واسط مقداری شمش — 2040 تأمین‌کنندگان — 2030 مالیات —
// 4070/5070 سود/زیان فروش و ارزیابی طلا — 4080 سایر درآمدها — 5090 کسری طلا

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Decimal from 'decimal.js';
import { Prisma, TreasuryOrder } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  AccountingService,
  LedgerLineInput,
  toDecimal,
} from '../accounting/accounting.service';
import { PartyLedgerService } from '../accounting/party-ledger.service';
import { ACC } from '../accounting/accounts.seed';
import { SmsService } from '../integrations/services/sms.service';
import {
  CoverageQueryDto,
  ListOrdersQueryDto,
  ListSuppliersQueryDto,
  PurchaseRequestDto,
  ReceiveOrderDto,
  SupplierDto,
  SupplierPaymentDto,
  TreasuryOrderDto,
  VaultCountDto,
} from './treasury.dto';

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };
const D0 = () => new Decimal(0);
const s = (v: Decimal | Prisma.Decimal | null | undefined) =>
  v == null ? '0' : v.toString();

export const METHOD_FA: Record<string, string> = {
  CASH: 'نقدی',
  BANK_TRANSFER: 'واریز بانکی',
  CARD_TO_CARD: 'کارت به کارت',
  POS: 'کارتخوان',
  CHEQUE: 'چک',
};

function paged<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const r: { gte?: Date; lte?: Date } = {};
  if (from) r.gte = new Date(from);
  if (to) {
    const e = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) e.setHours(23, 59, 59, 999);
    r.lte = e;
  }
  return r;
}

@Injectable()
export class TreasuryService {
  private readonly logger = new Logger(TreasuryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly partyLedger: PartyLedgerService,
    private readonly sequence: DocumentSequenceService,
    private readonly config: SystemConfigService,
    private readonly sms: SmsService,
  ) {}

  // ═══════════════════════════════════════════
  // تأمین‌کنندگان
  // ═══════════════════════════════════════════
  private async nextSupplierCode(): Promise<string> {
    const last = await this.prisma.supplier.findFirst({
      where: { code: { startsWith: 'SUP-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const n = last ? Number(last.code.replace('SUP-', '')) || 0 : 0;
    return `SUP-${String(n + 1).padStart(4, '0')}`;
  }

  async createSupplier(dto: SupplierDto) {
    const code = await this.nextSupplierCode();
    const sup = await this.prisma.supplier.create({
      data: {
        code,
        name: dto.name.trim(),
        kind: dto.kind ?? 'MELTED_GOLD_DEALER',
        nationalId: dto.nationalId,
        economicCode: dto.economicCode,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        address: dto.address,
        iban: dto.iban,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
    return { message: 'تأمین‌کننده تعریف شد', id: sup.id, code };
  }

  async updateSupplier(id: string, dto: Partial<SupplierDto>) {
    await this.getSupplierOrThrow(id);
    await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        kind: dto.kind,
        nationalId: dto.nationalId,
        economicCode: dto.economicCode,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        address: dto.address,
        iban: dto.iban,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });
    return { message: 'تأمین‌کننده به‌روزرسانی شد' };
  }

  private async getSupplierOrThrow(id: string) {
    const sup = await this.prisma.supplier.findUnique({ where: { id } });
    if (!sup) throw new NotFoundException('تأمین‌کننده یافت نشد');
    return sup;
  }

  async listSuppliers(query: ListSuppliersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.SupplierWhereInput = {};
    if (query.activeOnly) where.isActive = true;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    const stats = await this.prisma.treasuryOrder.groupBy({
      by: ['supplierId', 'side'],
      where: {
        supplierId: { in: rows.map((r) => r.id) },
        status: { in: ['CONFIRMED', 'RECEIVED'] },
      },
      _sum: { fineGrams: true, totalRial: true },
      _count: true,
    });
    return paged(
      rows.map((r) => {
        const buy = stats.find(
          (x) => x.supplierId === r.id && x.side === 'BUY',
        );
        const sell = stats.find(
          (x) => x.supplierId === r.id && x.side === 'SELL',
        );
        return {
          ...r,
          balanceRial: r.balanceRial.toString(),
          boughtGrams: s(buy?._sum.fineGrams),
          boughtRial: s(buy?._sum.totalRial),
          soldGrams: s(sell?._sum.fineGrams),
          soldRial: s(sell?._sum.totalRial),
          orderCount: (buy?._count ?? 0) + (sell?._count ?? 0),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
      total,
      page,
      limit,
    );
  }

  async supplierStatement(
    id: string,
    query: { page?: number; limit?: number; from?: string; to?: string },
  ) {
    const sup = await this.getSupplierOrThrow(id);
    const st = await this.partyLedger.statement(
      this.prisma,
      'SUPPLIER',
      id,
      query,
    );
    return {
      supplier: { ...sup, balanceRial: sup.balanceRial.toString() },
      ...st,
    };
  }

  // ═══════════════════════════════════════════
  // سفارش خرید/فروش طلا با بازار
  // ═══════════════════════════════════════════
  private computeAmounts(dto: TreasuryOrderDto) {
    const gross = new Decimal(dto.grossWeightGrams);
    if (gross.lte(0))
      throw new BadRequestException('وزن باید بیشتر از صفر باشد');
    if (gross.decimalPlaces() > 4) {
      throw new BadRequestException('دقت وزن حداکثر ۴ رقم اعشار است');
    }
    const price = new Decimal(dto.pricePerGramRial);
    if (price.lte(0)) throw new BadRequestException('قیمت نامعتبر است');
    if (dto.assetType === 'MELTED_GOLD' && dto.purityMillesimal > 1000) {
      throw new BadRequestException('عیار نامعتبر است');
    }
    // آب‌شده: تبدیل به گرم ۷۵۰ (مبنای بدهی کاربران و قیمت بازار)؛ شمش: وزن فیزیکی
    const fine =
      dto.assetType === 'MELTED_GOLD'
        ? gross
            .times(dto.purityMillesimal)
            .div(750)
            .toDecimalPlaces(4, Decimal.ROUND_DOWN)
        : gross;
    const wage = new Decimal(dto.wageRial ?? 0);
    const fee = new Decimal(dto.feeRial ?? 0);
    const tax = new Decimal(dto.taxRial ?? 0);
    for (const [v, label] of [
      [wage, 'اجرت'],
      [fee, 'کارمزد'],
      [tax, 'مالیات'],
    ] as const) {
      if (v.isNegative() || !v.isInteger()) {
        throw new BadRequestException(
          `${label} باید عدد صحیح نامنفی (ریال) باشد`,
        );
      }
    }
    const goldValue = fine.times(price).toDecimalPlaces(0);
    // خرید: بهای کل = ارزش طلا + اجرت + کارمزد + مالیات
    // فروش: خالص دریافتی = ارزش طلا + اجرت + مالیات − کارمزد کسرشده توسط خریدار
    const total =
      dto.side === 'BUY'
        ? goldValue.plus(wage).plus(fee).plus(tax)
        : goldValue.plus(wage).plus(tax).minus(fee);
    if (total.lte(0)) throw new BadRequestException('مبلغ کل نامعتبر است');
    return { gross, fine, price, goldValue, wage, fee, tax, total };
  }

  async createOrder(
    adminId: string,
    dto: TreasuryOrderDto,
    extra: { coverageSnapshot?: unknown } = {},
  ) {
    const sup = await this.getSupplierOrThrow(dto.supplierId);
    if (!sup.isActive) throw new BadRequestException('تأمین‌کننده غیرفعال است');
    const a = this.computeAmounts(dto);
    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.sequence.next(
        tx,
        dto.side === 'BUY' ? 'TRP' : 'TRS',
      );
      const order = await tx.treasuryOrder.create({
        data: {
          orderNumber,
          side: dto.side,
          assetType: dto.assetType,
          supplierId: dto.supplierId,
          grossWeightGrams: a.gross.toString(),
          purityMillesimal: dto.purityMillesimal,
          fineGrams: a.fine.toString(),
          barCount: dto.barCount,
          pricePerGramRial: a.price.toFixed(0),
          goldValueRial: a.goldValue.toFixed(0),
          wageRial: a.wage.toFixed(0),
          feeRial: a.fee.toFixed(0),
          taxRial: a.tax.toFixed(0),
          totalRial: a.total.toFixed(0),
          requestedGrams: dto.requestedGrams,
          coverageSnapshot: (extra.coverageSnapshot ??
            undefined) as Prisma.InputJsonValue,
          supplierInvoiceNo: dto.supplierInvoiceNo,
          assayCertificateNo: dto.assayCertificateNo,
          vaultLocation: dto.vaultLocation,
          note: dto.note,
          createdByAdminId: adminId,
        },
      });
      return {
        message: 'سفارش پیش‌نویس ثبت شد',
        id: order.id,
        orderNumber,
      };
    }, TX_OPTIONS);
  }

  async updateOrder(id: string, dto: TreasuryOrderDto) {
    const order = await this.getOrderOrThrow(id);
    if (order.status !== 'DRAFT') {
      throw new ConflictException('فقط سفارش پیش‌نویس قابل ویرایش است');
    }
    if (dto.side !== order.side) {
      throw new BadRequestException('نوع سفارش (خرید/فروش) قابل تغییر نیست');
    }
    const a = this.computeAmounts(dto);
    await this.prisma.treasuryOrder.update({
      where: { id },
      data: {
        assetType: dto.assetType,
        supplierId: dto.supplierId,
        grossWeightGrams: a.gross.toString(),
        purityMillesimal: dto.purityMillesimal,
        fineGrams: a.fine.toString(),
        barCount: dto.barCount,
        pricePerGramRial: a.price.toFixed(0),
        goldValueRial: a.goldValue.toFixed(0),
        wageRial: a.wage.toFixed(0),
        feeRial: a.fee.toFixed(0),
        taxRial: a.tax.toFixed(0),
        totalRial: a.total.toFixed(0),
        supplierInvoiceNo: dto.supplierInvoiceNo,
        assayCertificateNo: dto.assayCertificateNo,
        vaultLocation: dto.vaultLocation,
        note: dto.note,
      },
    });
    return { message: 'سفارش ویرایش شد' };
  }

  private async getOrderOrThrow(id: string) {
    const o = await this.prisma.treasuryOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('سفارش یافت نشد');
    return o;
  }

  private async lockOrder(tx: Tx, id: string): Promise<TreasuryOrder> {
    await tx.$executeRaw`SELECT 1 FROM "treasury_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const o = await tx.treasuryOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('سفارش یافت نشد');
    return o;
  }

  private assetLabel(o: { assetType: string }) {
    return o.assetType === 'MELTED_GOLD' ? 'طلای آب‌شده' : 'شمش';
  }

  /**
   * قطعی‌سازی:
   *  خرید — قیمت قفل و تعهد به تأمین‌کننده ثبت می‌شود؛ کسری پوشش همین‌جا کاهش می‌یابد:
   *    بدهکار 1060 طلای در راه (ارزش + اجرت + کارمزد، گرم) / بدهکار 1080 مالیات خرید
   *    بستانکار 2040 تأمین‌کننده (کل) / بستانکار 1090 یا 1095 (گرم)
   *  فروش — طلا همزمان تحویل می‌شود:
   *    بدهکار 2040 خریدار (خالص دریافتی) / بستانکار 1020 یا 1025 (بهای میانگین، گرم) /
   *    بدهکار 1090 یا 1095 (گرم) / بستانکار 2030 مالیات / سود 4070 یا زیان 5070
   */
  async confirmOrder(adminId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (o.status !== 'DRAFT') {
        throw new ConflictException('فقط سفارش پیش‌نویس قابل قطعی‌سازی است');
      }
      const sup = await tx.supplier.findUnique({ where: { id: o.supplierId } });
      if (!sup?.isActive)
        throw new BadRequestException('تأمین‌کننده غیرفعال است');

      const fine = toDecimal(o.fineGrams);
      const total = toDecimal(o.totalRial);
      const tax = toDecimal(o.taxRial);
      const melted = o.assetType === 'MELTED_GOLD';
      const clearing = melted ? ACC.GOLD_COVERAGE : ACC.BULLION_CLEARING;
      const tag = `${o.orderNumber} — ${sup.name} [${sup.code}]`;
      const lines: LedgerLineInput[] = [];
      let description: string;
      let gainRial: Decimal | null = null;

      if (o.side === 'BUY') {
        const cost = total.minus(tax);
        lines.push(
          {
            accountCode: ACC.GOLD_IN_TRANSIT,
            side: 'DEBIT',
            amountRial: cost,
            amountGrams: fine,
          },
          {
            accountCode: ACC.SUPPLIER_PAYABLE,
            side: 'CREDIT',
            amountRial: total,
          },
          { accountCode: clearing, side: 'CREDIT', amountGrams: fine },
        );
        if (tax.gt(0)) {
          lines.push({
            accountCode: ACC.VAT_RECEIVABLE,
            side: 'DEBIT',
            amountRial: tax,
          });
        }
        description = `خرید ${this.assetLabel(o)} از بازار (قطعی) — ${fine.toString()} گرم — ${tag}`;
      } else {
        const inventory = melted ? ACC.GOLD_VAULT : ACC.BULLION;
        const invAcc = await tx.account.findUnique({
          where: { code: inventory },
        });
        if (toDecimal(invAcc?.balanceGrams).lt(fine)) {
          throw new BadRequestException(
            `موجودی دفتری ${this.assetLabel(o)} خزانه (${s(invAcc?.balanceGrams)} گرم) کمتر از مقدار فروش است`,
          );
        }
        const cost = await this.accounting.averageCostRial(tx, inventory, fine);
        const net = total.minus(tax);
        gainRial = net.minus(cost);
        lines.push(
          {
            accountCode: ACC.SUPPLIER_PAYABLE,
            side: 'DEBIT',
            amountRial: total,
          },
          {
            accountCode: inventory,
            side: 'CREDIT',
            amountRial: cost,
            amountGrams: fine,
          },
          { accountCode: clearing, side: 'DEBIT', amountGrams: fine },
        );
        if (tax.gt(0)) {
          lines.push({
            accountCode: ACC.TAX_PAYABLE,
            side: 'CREDIT',
            amountRial: tax,
          });
        }
        if (!gainRial.isZero()) {
          lines.push({
            accountCode: gainRial.gt(0) ? ACC.GOLD_GAIN : ACC.GOLD_LOSS,
            side: gainRial.gt(0) ? 'CREDIT' : 'DEBIT',
            amountRial: gainRial.abs(),
          });
        }
        description = `فروش ${this.assetLabel(o)} خزانه به بازار — ${fine.toString()} گرم — ${tag}`;
      }

      const journal = await this.accounting.postJournal(tx, {
        description,
        totalRial: total,
        totalGrams: fine,
        source: 'TREASURY',
        referenceType: 'TREASURY_ORDER',
        referenceId: o.id,
        createdByAdminId: adminId,
        lines,
      });

      await this.partyLedger.post(tx, {
        partyType: 'SUPPLIER',
        partyId: o.supplierId,
        type: o.side === 'BUY' ? 'PURCHASE' : 'SALE',
        debitRial: o.side === 'SELL' ? total : undefined,
        creditRial: o.side === 'BUY' ? total : undefined,
        description,
        referenceType: 'TREASURY_ORDER',
        referenceId: o.id,
        referenceNumber: o.orderNumber,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });

      const now = new Date();
      await tx.treasuryOrder.update({
        where: { id },
        data: {
          status: o.side === 'BUY' ? 'CONFIRMED' : 'RECEIVED',
          confirmedAt: now,
          confirmedByAdminId: adminId,
          confirmJournalId: journal.id,
          ...(o.side === 'SELL'
            ? { receivedAt: now, receivedByAdminId: adminId }
            : {}),
        },
      });
      this.logger.log(
        `[Treasury] ${o.orderNumber} قطعی شد (${o.side} ${fine.toString()}g) توسط ${adminId}`,
      );
      return {
        message:
          o.side === 'BUY'
            ? 'خرید قطعی شد؛ پس از تحویل طلا رسید ورود به خزانه را ثبت کنید'
            : 'فروش ثبت و طلا از خزانه خارج شد',
        journalEntryId: journal.id,
        gainRial: gainRial?.toString() ?? null,
      };
    }, TX_OPTIONS);
  }

  /** رسید ورود به خزانه: بدهکار 1020/1025 — بستانکار 1060 (همان بها و وزن) */
  async receiveOrder(adminId: string, id: string, dto: ReceiveOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (o.side !== 'BUY' || o.status !== 'CONFIRMED') {
        throw new ConflictException(
          'رسید ورود فقط برای سفارش خرید قطعی‌شده ثبت می‌شود',
        );
      }
      const fine = toDecimal(o.fineGrams);
      const cost = toDecimal(o.totalRial).minus(toDecimal(o.taxRial));
      const journal = await this.accounting.postJournal(tx, {
        description: `رسید ورود ${this.assetLabel(o)} به خزانه — ${fine.toString()} گرم — ${o.orderNumber}${
          dto.vaultLocation ? ` — محل: ${dto.vaultLocation}` : ''
        }`,
        totalRial: cost,
        totalGrams: fine,
        source: 'TREASURY',
        referenceType: 'TREASURY_ORDER',
        referenceId: o.id,
        createdByAdminId: adminId,
        lines: [
          {
            accountCode:
              o.assetType === 'MELTED_GOLD' ? ACC.GOLD_VAULT : ACC.BULLION,
            side: 'DEBIT',
            amountRial: cost,
            amountGrams: fine,
          },
          {
            accountCode: ACC.GOLD_IN_TRANSIT,
            side: 'CREDIT',
            amountRial: cost,
            amountGrams: fine,
          },
        ],
      });
      await tx.treasuryOrder.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
          receivedByAdminId: adminId,
          receiveJournalId: journal.id,
          vaultLocation: dto.vaultLocation ?? o.vaultLocation,
          assayCertificateNo: dto.assayCertificateNo ?? o.assayCertificateNo,
          note: dto.note
            ? [o.note, dto.note].filter(Boolean).join('\n')
            : o.note,
        },
      });
      return {
        message: 'طلا وارد خزانه شد',
        journalEntryId: journal.id,
      };
    }, TX_OPTIONS);
  }

  /** ابطال: پیش‌نویس بدون سند؛ خرید قطعیِ دریافت‌نشده با سند برگشتی */
  async cancelOrder(adminId: string, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const o = await this.lockOrder(tx, id);
      if (o.status === 'CANCELLED') {
        throw new ConflictException('سفارش قبلاً ابطال شده است');
      }
      if (o.status === 'RECEIVED') {
        throw new ConflictException(
          o.side === 'BUY'
            ? 'طلای این سفارش وارد خزانه شده؛ برای برگشت، سفارش فروش ثبت کنید'
            : 'فروش تحویل‌شده قابل ابطال نیست؛ برای برگشت، سفارش خرید ثبت کنید',
        );
      }
      let cancelJournalId: string | null = null;
      if (o.status === 'CONFIRMED' && o.confirmJournalId) {
        const rev = await this.accounting.reverseJournal(
          tx,
          o.confirmJournalId,
          {
            description: `ابطال سفارش خزانه ${o.orderNumber} — ${reason}`,
            createdByAdminId: adminId,
          },
        );
        cancelJournalId = rev.id;
        await this.partyLedger.post(tx, {
          partyType: 'SUPPLIER',
          partyId: o.supplierId,
          type: 'CANCEL',
          debitRial: toDecimal(o.totalRial),
          description: `ابطال سفارش ${o.orderNumber} — ${reason}`,
          referenceType: 'TREASURY_ORDER',
          referenceId: o.id,
          referenceNumber: o.orderNumber,
          journalEntryId: rev.id,
          createdByAdminId: adminId,
        });
      }
      await tx.treasuryOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason,
          cancelJournalId,
        },
      });
      return {
        message: o.paidRial.gt(0)
          ? 'سفارش ابطال شد؛ مبلغ پرداخت‌شده به‌عنوان طلب از تأمین‌کننده در صورتحساب او باقی است'
          : 'سفارش ابطال شد',
      };
    }, TX_OPTIONS);
  }

  async listOrders(query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.TreasuryOrderWhereInput = {};
    if (query.status) where.status = query.status as never;
    if (query.side) where.side = query.side as never;
    if (query.assetType) where.assetType = query.assetType as never;
    if (query.supplierId) where.supplierId = query.supplierId;
    const range = dateRange(query.from, query.to);
    if (range) where.createdAt = range;
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { supplierInvoiceNo: { contains: query.search, mode: 'insensitive' } },
        { assayCertificateNo: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total, sums] = await Promise.all([
      this.prisma.treasuryOrder.findMany({
        where,
        include: { supplier: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.treasuryOrder.count({ where }),
      this.prisma.treasuryOrder.groupBy({
        by: ['side'],
        where: { ...where, status: { in: ['CONFIRMED', 'RECEIVED'] } },
        _sum: { fineGrams: true, totalRial: true, paidRial: true },
      }),
    ]);
    return {
      ...paged(
        rows.map((o) => this.orderDto(o)),
        total,
        page,
        limit,
      ),
      totals: sums.map((x) => ({
        side: x.side,
        grams: s(x._sum.fineGrams),
        totalRial: s(x._sum.totalRial),
        paidRial: s(x._sum.paidRial),
      })),
    };
  }

  async getOrder(id: string) {
    const o = await this.prisma.treasuryOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!o) throw new NotFoundException('سفارش یافت نشد');
    const adminIds = [
      o.createdByAdminId,
      o.confirmedByAdminId,
      o.receivedByAdminId,
    ].filter(Boolean);
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, fullName: true },
    });
    const name = (id: string | null) =>
      id ? (admins.find((a) => a.id === id)?.fullName ?? null) : null;
    return {
      ...this.orderDto(o),
      supplier: {
        ...o.supplier,
        balanceRial: o.supplier.balanceRial.toString(),
      },
      coverageSnapshot: o.coverageSnapshot,
      createdBy: name(o.createdByAdminId),
      confirmedBy: name(o.confirmedByAdminId),
      receivedBy: name(o.receivedByAdminId),
      payments: o.payments.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        direction: p.direction,
        amountRial: p.amountRial.toString(),
        method: p.method,
        referenceNumber: p.referenceNumber,
        paidAt: p.paidAt.toISOString(),
        journalEntryId: p.journalEntryId,
      })),
    };
  }

  private orderDto(
    o: TreasuryOrder & { supplier?: { name: string; code: string } },
  ) {
    const total = toDecimal(o.totalRial);
    const paid = toDecimal(o.paidRial);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      side: o.side,
      assetType: o.assetType,
      status: o.status,
      supplierId: o.supplierId,
      supplierName: o.supplier?.name,
      supplierCode: o.supplier?.code,
      grossWeightGrams: o.grossWeightGrams.toString(),
      purityMillesimal: o.purityMillesimal,
      fineGrams: o.fineGrams.toString(),
      barCount: o.barCount,
      pricePerGramRial: o.pricePerGramRial.toString(),
      goldValueRial: o.goldValueRial.toString(),
      wageRial: o.wageRial.toString(),
      feeRial: o.feeRial.toString(),
      taxRial: o.taxRial.toString(),
      totalRial: total.toString(),
      paidRial: paid.toString(),
      remainingRial:
        o.status === 'CANCELLED' ? '0' : total.minus(paid).toString(),
      requestedGrams: o.requestedGrams?.toString() ?? null,
      supplierInvoiceNo: o.supplierInvoiceNo,
      assayCertificateNo: o.assayCertificateNo,
      vaultLocation: o.vaultLocation,
      note: o.note,
      cancelReason: o.cancelReason,
      confirmJournalId: o.confirmJournalId,
      receiveJournalId: o.receiveJournalId,
      cancelJournalId: o.cancelJournalId,
      confirmedAt: o.confirmedAt?.toISOString() ?? null,
      receivedAt: o.receivedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  }

  // ═══════════════════════════════════════════
  // پرداخت/دریافت با تأمین‌کننده
  // ═══════════════════════════════════════════
  async recordPayment(adminId: string, dto: SupplierPaymentDto) {
    const amount = new Decimal(dto.amountRial);
    if (amount.lte(0) || !amount.isInteger()) {
      throw new BadRequestException('مبلغ باید عدد صحیح مثبت (ریال) باشد');
    }
    const cashCode = dto.cashAccountCode ?? ACC.CASH;
    return this.prisma.$transaction(async (tx) => {
      const sup = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!sup) throw new NotFoundException('تأمین‌کننده یافت نشد');
      const cashAcc = await tx.account.findUnique({
        where: { code: cashCode },
      });
      if (!cashAcc?.isActive) {
        throw new BadRequestException('حساب نقد/بانک انتخاب‌شده معتبر نیست');
      }
      let order: TreasuryOrder | null = null;
      if (dto.orderId) {
        order = await this.lockOrder(tx, dto.orderId);
        if (order.supplierId !== sup.id) {
          throw new BadRequestException('سفارش متعلق به این تأمین‌کننده نیست');
        }
        if (order.status === 'DRAFT') {
          throw new BadRequestException('ابتدا سفارش را قطعی کنید');
        }
        const expected = order.side === 'BUY' ? 'PAY' : 'RECEIVE';
        if (dto.direction !== expected) {
          throw new BadRequestException(
            order.side === 'BUY'
              ? 'برای سفارش خرید فقط «پرداخت» ثبت می‌شود'
              : 'برای سفارش فروش فقط «دریافت» ثبت می‌شود',
          );
        }
      }
      const paymentNumber = await this.sequence.next(tx, 'SPY');
      const pay = dto.direction === 'PAY';
      const description = `${pay ? 'پرداخت به' : 'دریافت از'} ${sup.name} [${sup.code}] — ${paymentNumber} (${METHOD_FA[dto.method]}${
        dto.referenceNumber ? ` — پیگیری ${dto.referenceNumber}` : ''
      })${order ? ` — بابت ${order.orderNumber}` : ''}`;
      const journal = await this.accounting.postJournal(tx, {
        description,
        totalRial: amount,
        totalGrams: 0,
        source: 'TREASURY',
        referenceType: 'SUPPLIER_PAYMENT',
        createdByAdminId: adminId,
        lines: [
          {
            accountCode: pay ? ACC.SUPPLIER_PAYABLE : cashCode,
            side: 'DEBIT',
            amountRial: amount,
          },
          {
            accountCode: pay ? cashCode : ACC.SUPPLIER_PAYABLE,
            side: 'CREDIT',
            amountRial: amount,
          },
        ],
      });
      const payment = await tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: sup.id,
          orderId: order?.id,
          direction: dto.direction,
          amountRial: amount.toFixed(0),
          method: dto.method,
          cashAccountCode: cashCode,
          referenceNumber: dto.referenceNumber,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          note: dto.note,
          journalEntryId: journal.id,
          createdByAdminId: adminId,
        },
      });
      await tx.journalEntry.update({
        where: { id: journal.id },
        data: { referenceId: payment.id },
      });
      await this.partyLedger.post(tx, {
        partyType: 'SUPPLIER',
        partyId: sup.id,
        type: pay ? 'PAYMENT' : 'RECEIPT',
        debitRial: pay ? amount : undefined,
        creditRial: pay ? undefined : amount,
        description,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: payment.id,
        referenceNumber: paymentNumber,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });
      if (order) {
        await tx.treasuryOrder.update({
          where: { id: order.id },
          data: { paidRial: { increment: amount.toFixed(0) } },
        });
      }
      return { message: 'پرداخت ثبت شد', id: payment.id, paymentNumber };
    }, TX_OPTIONS);
  }

  async listPayments(query: {
    supplierId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.SupplierPaymentWhereInput = query.supplierId
      ? { supplierId: query.supplierId }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where,
        include: {
          supplier: { select: { name: true, code: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);
    return paged(
      rows.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        supplierName: p.supplier.name,
        supplierCode: p.supplier.code,
        orderNumber: p.order?.orderNumber ?? null,
        direction: p.direction,
        amountRial: p.amountRial.toString(),
        method: p.method,
        cashAccountCode: p.cashAccountCode,
        referenceNumber: p.referenceNumber,
        paidAt: p.paidAt.toISOString(),
        note: p.note,
        journalEntryId: p.journalEntryId,
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    );
  }

  // ═══════════════════════════════════════════
  // شمارش فیزیکی خزانه (انبارگردانی)
  // ═══════════════════════════════════════════
  /**
   * کسری: بستانکار 1020/1025 (بهای میانگین) + بدهکار 5090 کسری طلا + بدهکار 1090/1095 (گرم)
   *        — کسری آب‌شده دوباره در گزارش خرید دیده می‌شود تا جبران شود.
   * اضافی: بدهکار 1020/1025 + بستانکار 4080 سایر درآمدها + بستانکار 1090/1095 (گرم)
   */
  async recordVaultCount(adminId: string, dto: VaultCountDto) {
    const counted = new Decimal(dto.countedGrams);
    if (counted.isNegative() || counted.decimalPlaces() > 4) {
      throw new BadRequestException('وزن شمارش‌شده نامعتبر است');
    }
    return this.prisma.$transaction(async (tx) => {
      const melted = dto.assetType === 'MELTED_GOLD';
      const invCode = melted ? ACC.GOLD_VAULT : ACC.BULLION;
      const clearing = melted ? ACC.GOLD_COVERAGE : ACC.BULLION_CLEARING;
      await tx.$executeRaw`SELECT 1 FROM "accounts" WHERE "code" = ${invCode} FOR UPDATE`;
      const inv = await tx.account.findUnique({ where: { code: invCode } });
      const book = toDecimal(inv?.balanceGrams);
      const diff = counted.minus(book);
      const countNumber = await this.sequence.next(tx, 'VCT');
      let journalId: string | null = null;

      if (!diff.isZero()) {
        const g = diff.abs();
        const shortage = diff.isNegative();
        // ارزش مغایرت به بهای میانگین فعلی موجودی
        const value = shortage
          ? await this.accounting.averageCostRial(tx, invCode, g)
          : book.gt(0) && toDecimal(inv?.balanceRial).gt(0)
            ? toDecimal(inv?.balanceRial).div(book).times(g).toDecimalPlaces(0)
            : D0();
        const lines: LedgerLineInput[] = shortage
          ? [
              {
                accountCode: invCode,
                side: 'CREDIT',
                amountRial: value,
                amountGrams: g,
              },
              { accountCode: clearing, side: 'DEBIT', amountGrams: g },
            ]
          : [
              {
                accountCode: invCode,
                side: 'DEBIT',
                amountRial: value,
                amountGrams: g,
              },
              { accountCode: clearing, side: 'CREDIT', amountGrams: g },
            ];
        if (value.gt(0)) {
          lines.push(
            shortage
              ? {
                  accountCode: ACC.GOLD_SHRINKAGE,
                  side: 'DEBIT',
                  amountRial: value,
                }
              : { accountCode: '4080', side: 'CREDIT', amountRial: value },
          );
        }
        const journal = await this.accounting.postJournal(tx, {
          description: `${shortage ? 'کسری' : 'اضافی'} شمارش خزانه (${melted ? 'آب‌شده' : 'شمش'}) — ${countNumber}: دفتری ${book.toString()} / شمارش ${counted.toString()} گرم${
            dto.note ? ` — ${dto.note}` : ''
          }`,
          totalRial: value,
          totalGrams: g,
          source: 'INVENTORY',
          referenceType: 'VAULT_COUNT',
          createdByAdminId: adminId,
          lines,
        });
        journalId = journal.id;
      }
      const vc = await tx.vaultCount.create({
        data: {
          countNumber,
          assetType: dto.assetType,
          bookGrams: book.toString(),
          countedGrams: counted.toString(),
          differenceGrams: diff.toString(),
          note: dto.note,
          journalEntryId: journalId,
          countedByAdminId: adminId,
        },
      });
      if (journalId) {
        await tx.journalEntry.update({
          where: { id: journalId },
          data: { referenceId: vc.id },
        });
      }
      return {
        message: diff.isZero()
          ? 'شمارش با دفاتر مطابقت دارد'
          : `مغایرت ${diff.toString()} گرم ثبت و سند اصلاحی صادر شد`,
        countNumber,
        differenceGrams: diff.toString(),
        journalEntryId: journalId,
      };
    }, TX_OPTIONS);
  }

  async listVaultCounts(query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const [rows, total] = await Promise.all([
      this.prisma.vaultCount.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vaultCount.count(),
    ]);
    return paged(
      rows.map((r) => ({
        ...r,
        bookGrams: r.bookGrams.toString(),
        countedGrams: r.countedGrams.toString(),
        differenceGrams: r.differenceGrams.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    );
  }

  // ═══════════════════════════════════════════
  // گزارش پوشش ذخایر و خرید پیشنهادی طلای آب‌شده
  // ═══════════════════════════════════════════
  async coverageReport(query: CoverageQueryDto = {}) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
      to.setHours(23, 59, 59, 999);
    }
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 6 * 86400_000);
    if (!query.from) from.setHours(0, 0, 0, 0);

    const [
      walletSum,
      holdSum,
      accounts,
      inTransitAgg,
      draftAgg,
      price,
      targetPercent,
      bufferGrams,
      lotGrams,
      alertPercent,
      lastPurchase,
    ] = await Promise.all([
      this.prisma.wallet.aggregate({ _sum: { goldBalanceGrams: true } }),
      this.prisma.walletHold.aggregate({
        where: { amountGrams: { not: null }, expiresAt: { gt: now } },
        _sum: { amountGrams: true },
      }),
      this.prisma.account.findMany({
        where: {
          code: { in: [ACC.GOLD_VAULT, ACC.USER_GOLD, ACC.GOLD_COVERAGE] },
        },
      }),
      this.prisma.treasuryOrder.aggregate({
        where: { side: 'BUY', assetType: 'MELTED_GOLD', status: 'CONFIRMED' },
        _sum: { fineGrams: true },
        _count: true,
      }),
      this.prisma.treasuryOrder.aggregate({
        where: { side: 'BUY', assetType: 'MELTED_GOLD', status: 'DRAFT' },
        _sum: { fineGrams: true },
        _count: true,
      }),
      this.accounting.currentGoldPriceRial(),
      this.config.getDecimal('treasury.target_reserve_percent', '100'),
      this.config.getDecimal('treasury.safety_buffer_grams', '0'),
      this.config.getDecimal('treasury.purchase_lot_grams', '0'),
      this.config.getDecimal('treasury.alert_coverage_percent', '95'),
      this.prisma.treasuryOrder.findFirst({
        where: {
          side: 'BUY',
          assetType: 'MELTED_GOLD',
          status: { in: ['CONFIRMED', 'RECEIVED'] },
        },
        orderBy: { confirmedAt: 'desc' },
        select: {
          orderNumber: true,
          confirmedAt: true,
          fineGrams: true,
          pricePerGramRial: true,
        },
      }),
    ]);
    const acc = (c: string) => accounts.find((a) => a.code === c);

    const liability = toDecimal(walletSum._sum.goldBalanceGrams);
    const ledgerLiability = toDecimal(acc(ACC.USER_GOLD)?.balanceGrams);
    const vault = toDecimal(acc(ACC.GOLD_VAULT)?.balanceGrams);
    const inTransit = toDecimal(inTransitAgg._sum.fineGrams);
    const drafts = toDecimal(draftAgg._sum.fineGrams);
    const covered = vault.plus(inTransit);
    const required = liability
      .times(new Decimal(targetPercent.toString()))
      .div(100)
      .plus(new Decimal(bufferGrams.toString()))
      .toDecimalPlaces(4, Decimal.ROUND_UP);
    const shortfall = required.minus(covered);
    let recommended = Decimal.max(0, shortfall.minus(drafts));
    const lot = new Decimal(lotGrams.toString());
    if (recommended.gt(0) && lot.gt(0)) {
      recommended = recommended.div(lot).ceil().times(lot);
    }
    const coveragePercent = liability.gt(0)
      ? covered.div(liability).times(100).toDecimalPlaces(2)
      : new Decimal(100);
    const status = shortfall.lte(0)
      ? 'COVERED'
      : coveragePercent.lt(new Decimal(alertPercent.toString()))
        ? 'CRITICAL'
        : 'SHORTFALL';

    const flows = await this.dailyFlows(from, to);
    const sinceLast = lastPurchase?.confirmedAt
      ? await this.netDemandSince(lastPurchase.confirmedAt)
      : null;

    return {
      generatedAt: now.toISOString(),
      unit: 'گرم طلای ۷۵۰ (۱۸ عیار)',
      pricePerGramRial: price.toString(),
      liability: {
        walletGrams: s(liability),
        ledgerGrams: s(ledgerLiability),
        differenceGrams: s(liability.minus(ledgerLiability)),
        heldGrams: s(holdSum._sum.amountGrams),
      },
      reserves: {
        vaultGrams: s(vault),
        vaultBookValueRial: s(acc(ACC.GOLD_VAULT)?.balanceRial),
        inTransitGrams: s(inTransit),
        inTransitOrders: inTransitAgg._count,
        draftPurchaseGrams: s(drafts),
        draftPurchaseOrders: draftAgg._count,
        coveredGrams: s(covered),
      },
      policy: {
        targetReservePercent: targetPercent.toString(),
        safetyBufferGrams: bufferGrams.toString(),
        purchaseLotGrams: lotGrams.toString(),
        alertCoveragePercent: alertPercent.toString(),
      },
      requiredGrams: s(required),
      shortfallGrams: s(Decimal.max(0, shortfall)),
      surplusGrams: s(Decimal.max(0, shortfall.neg())),
      coveragePercent: s(coveragePercent),
      status,
      recommendedPurchaseGrams: s(recommended),
      estimatedPurchaseCostRial: s(recommended.times(price).toDecimalPlaces(0)),
      ledgerCoverageClearingGrams: s(acc(ACC.GOLD_COVERAGE)?.balanceGrams),
      lastPurchase: lastPurchase
        ? {
            orderNumber: lastPurchase.orderNumber,
            confirmedAt: lastPurchase.confirmedAt?.toISOString() ?? null,
            grams: lastPurchase.fineGrams.toString(),
            pricePerGramRial: lastPurchase.pricePerGramRial.toString(),
          }
        : null,
      netDemandSinceLastPurchase: sinceLast,
      period: { from: from.toISOString(), to: to.toISOString() },
      flows,
    };
  }

  /** گردش روزانه‌ی طلای آب‌شده (به وقت تهران) از تراکنش‌های کاربران و سفارش‌های خزانه */
  private async dailyFlows(from: Date, to: Date) {
    const txRows = await this.prisma.$queryRaw<
      { day: string; type: string; grams: Prisma.Decimal; cnt: bigint }[]
    >`
      SELECT to_char(("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS day,
             "type"::text AS type, COALESCE(SUM("amountGrams"), 0) AS grams, COUNT(*) AS cnt
      FROM "transactions"
      WHERE "status" = 'COMPLETED'::"TransactionStatus"
        AND "amountGrams" IS NOT NULL
        AND "type" IN ('BUY_GOLD','SELL_GOLD','SALARY','REFERRAL_REWARD','INSTALLMENT_PURCHASE','PHYSICAL_DELIVERY')
        AND "created_at" >= ${from} AND "created_at" <= ${to}
      GROUP BY 1, 2`;
    const trRows = await this.prisma.$queryRaw<
      { day: string; side: string; grams: Prisma.Decimal }[]
    >`
      SELECT to_char(("confirmed_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS day,
             "side"::text AS side, COALESCE(SUM("fine_grams"), 0) AS grams
      FROM "treasury_orders"
      WHERE "asset_type" = 'MELTED_GOLD'::"TreasuryAssetType"
        AND "status" IN ('CONFIRMED'::"TreasuryOrderStatus", 'RECEIVED'::"TreasuryOrderStatus")
        AND "confirmed_at" >= ${from} AND "confirmed_at" <= ${to}
      GROUP BY 1, 2`;

    const days = new Map<string, Record<string, Decimal>>();
    const row = (day: string) => {
      if (!days.has(day)) {
        days.set(day, {
          userBuy: D0(),
          userSell: D0(),
          rewards: D0(),
          partner: D0(),
          delivery: D0(),
          treasuryBuy: D0(),
          treasurySell: D0(),
        });
      }
      return days.get(day);
    };
    const map: Record<string, string> = {
      BUY_GOLD: 'userBuy',
      SELL_GOLD: 'userSell',
      SALARY: 'rewards',
      REFERRAL_REWARD: 'rewards',
      INSTALLMENT_PURCHASE: 'partner',
      PHYSICAL_DELIVERY: 'delivery',
    };
    for (const r of txRows) {
      const k = map[r.type];
      const d = row(r.day);
      d[k] = d[k].plus(toDecimal(r.grams).abs());
    }
    for (const r of trRows) {
      const d = row(r.day);
      const k = r.side === 'BUY' ? 'treasuryBuy' : 'treasurySell';
      d[k] = d[k].plus(toDecimal(r.grams));
    }
    const totals: Record<string, Decimal> = {};
    const data = [...days.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([day, v]) => {
        // تقاضای خالص = طلایی که به کیف پول کاربران اضافه شده و باید پوشش داده شود
        const netDemand = v.userBuy
          .plus(v.rewards)
          .plus(v.partner)
          .minus(v.userSell);
        const netTreasury = v.treasuryBuy.minus(v.treasurySell);
        const out: Record<string, string> = { day };
        for (const [k, val] of Object.entries({
          ...v,
          netDemand,
          netTreasury,
        })) {
          out[k] = val.toString();
          totals[k] = (totals[k] ?? D0()).plus(val);
        }
        out.gap = netDemand.minus(netTreasury).toString();
        totals.gap = (totals.gap ?? D0()).plus(netDemand.minus(netTreasury));
        return out;
      });
    return {
      data,
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, v.toString()]),
      ),
    };
  }

  private async netDemandSince(since: Date) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        status: 'COMPLETED',
        createdAt: { gt: since },
        type: {
          in: [
            'BUY_GOLD',
            'SELL_GOLD',
            'SALARY',
            'REFERRAL_REWARD',
            'INSTALLMENT_PURCHASE',
          ],
        },
        amountGrams: { not: null },
      },
      _sum: { amountGrams: true },
    });
    const g = (t: string) =>
      toDecimal(rows.find((r) => r.type === t)?._sum.amountGrams).abs();
    const buys = g('BUY_GOLD')
      .plus(g('SALARY'))
      .plus(g('REFERRAL_REWARD'))
      .plus(g('INSTALLMENT_PURCHASE'));
    const sells = g('SELL_GOLD');
    return {
      since: since.toISOString(),
      inflowGrams: buys.toString(),
      userSellGrams: sells.toString(),
      netGrams: buys.minus(sells).toString(),
    };
  }

  /** ساخت درخواست خرید (سفارش پیش‌نویس) از روی گزارش پوشش، با snapshot گزارش برای ممیزی */
  async createPurchaseRequest(adminId: string, dto: PurchaseRequestDto) {
    const report = await this.coverageReport();
    const grams = dto.grams
      ? new Decimal(dto.grams)
      : new Decimal(report.recommendedPurchaseGrams);
    if (grams.lte(0)) {
      throw new BadRequestException(
        'طبق گزارش پوشش نیازی به خرید نیست؛ مقدار را دستی وارد کنید',
      );
    }
    const price = dto.pricePerGramRial
      ? new Decimal(dto.pricePerGramRial)
      : new Decimal(report.pricePerGramRial);
    const { flows: _flows, ...snapshot } = report;
    void _flows;
    return this.createOrder(
      adminId,
      {
        side: 'BUY',
        assetType: 'MELTED_GOLD',
        supplierId: dto.supplierId,
        grossWeightGrams: grams.toString(),
        purityMillesimal: 750,
        pricePerGramRial: price.toFixed(0),
        requestedGrams: report.recommendedPurchaseGrams,
        note:
          dto.note ??
          `درخواست خرید از گزارش پوشش — پوشش ${report.coveragePercent}٪، کسری ${report.shortfallGrams} گرم`,
      },
      { coverageSnapshot: snapshot },
    );
  }

  // ═══════════════════════════════════════════
  // هشدار خودکار کسری پوشش (هر ساعت؛ حداکثر یک پیامک در روز)
  // ═══════════════════════════════════════════
  @Cron('15 * * * *', { name: 'treasury-coverage-alert' })
  async coverageAlert() {
    try {
      const r = await this.coverageReport();
      if (r.status !== 'CRITICAL') return;
      this.logger.warn(
        `[Treasury][ALERT] پوشش خزانه ${r.coveragePercent}٪ — کسری ${r.shortfallGrams} گرم؛ خرید پیشنهادی ${r.recommendedPurchaseGrams} گرم`,
      );
      const today = new Date().toISOString().slice(0, 10);
      const last = await this.config.get('treasury.last_alert_date', '');
      if (last === today) return;
      await this.config.set('treasury.last_alert_date', today);
      const admins = await this.prisma.adminUser.findMany({
        where: {
          isActive: true,
          phone: { not: null },
          role: { key: { in: ['SUPER_ADMIN', 'FINANCE_ADMIN'] } },
        },
        select: { phone: true },
      });
      for (const a of admins) {
        await this.sms
          .send({
            phone: a.phone,
            text: `آرکان گلد — هشدار خزانه: پوشش طلای کاربران ${r.coveragePercent}٪ است. خرید پیشنهادی: ${r.recommendedPurchaseGrams} گرم.`,
          })
          .catch(() => undefined);
      }
    } catch (err) {
      this.logger.error(
        '[Treasury] خطا در بررسی هشدار پوشش',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
