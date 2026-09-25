// api/src/accounting/accounting-manage.service.ts
//
// عملیات مدیریتی حسابداری:
//   • سرفصل حساب‌ها (تعریف حساب معین/تفصیلی، ویرایش، غیرفعال‌سازی)
//   • اسناد دستی با کنترل دوگانه (ثبت ← تأیید/رد ← ثبت در دفتر کل ← برگشت)
//   • سال مالی، قفل دوره، قطعی‌سازی (شماره‌ی دائم) و بستن حساب‌های موقت

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  AccountType,
  ManualVoucherType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  AccountingService,
  LedgerLineInput,
  isDebitNature,
  toDecimal,
} from './accounting.service';
import { ACC } from './accounts.seed';
import { endOfDay } from './accounting-reports.service';

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

const TYPE_PREFIX: Record<AccountType, string> = {
  ASSET: '1',
  LIABILITY: '2',
  EQUITY: '3',
  INCOME: '4',
  EXPENSE: '5',
};

export interface VoucherLine {
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial?: string | number;
  amountGrams?: string | number;
  description?: string;
}

export interface VoucherInput {
  type?: ManualVoucherType;
  entryDate: string;
  description: string;
  attachmentRef?: string;
  lines: VoucherLine[];
}

@Injectable()
export class AccountingManageService {
  private readonly logger = new Logger(AccountingManageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly sequence: DocumentSequenceService,
    private readonly config: SystemConfigService,
  ) {}

  // ═══════════════════════════════════════════
  // سرفصل حساب‌ها
  // ═══════════════════════════════════════════
  async listAccounts() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
    });
    const children = new Map<string, string[]>();
    for (const a of accounts) {
      if (!a.parentId) continue;
      children.set(a.parentId, [...(children.get(a.parentId) ?? []), a.id]);
    }
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const rolled = (id: string): { rial: Decimal; grams: Decimal } => {
      const a = byId.get(id);
      let rial = toDecimal(a?.balanceRial);
      let grams = toDecimal(a?.balanceGrams);
      for (const c of children.get(id) ?? []) {
        const r = rolled(c);
        rial = rial.plus(r.rial);
        grams = grams.plus(r.grams);
      }
      return { rial, grams };
    };
    return accounts.map((a) => {
      const total = rolled(a.id);
      const balRial = toDecimal(a.balanceRial);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        subType: a.subType,
        description: a.description,
        parentId: a.parentId,
        parentCode: a.parentId ? (byId.get(a.parentId)?.code ?? null) : null,
        hasChildren: (children.get(a.id)?.length ?? 0) > 0,
        isSystem: a.isSystem,
        isActive: a.isActive,
        allowManualEntry: a.allowManualEntry,
        isDebitNature: isDebitNature(a.code),
        balanceRial: balRial.toString(),
        balanceToman: balRial.dividedBy(10).toString(),
        balanceGrams: toDecimal(a.balanceGrams).toString(),
        totalBalanceRial: total.rial.toString(),
        totalBalanceGrams: total.grams.toString(),
      };
    });
  }

  async createAccount(dto: {
    code: string;
    name: string;
    type: AccountType;
    parentCode?: string;
    description?: string;
    allowManualEntry?: boolean;
  }) {
    const code = dto.code.trim();
    if (!/^\d{4,10}$/.test(code)) {
      throw new BadRequestException('کد حساب باید ۴ تا ۱۰ رقم باشد');
    }
    if (!code.startsWith(TYPE_PREFIX[dto.type])) {
      throw new BadRequestException(
        `کد حساب‌های این گروه باید با رقم ${TYPE_PREFIX[dto.type]} شروع شود (ماهیت حساب از رقم اول تعیین می‌شود)`,
      );
    }
    let parentId: string | null = null;
    if (dto.parentCode) {
      const parent = await this.prisma.account.findUnique({
        where: { code: dto.parentCode },
      });
      if (!parent) throw new NotFoundException('حساب والد یافت نشد');
      if (parent.type !== dto.type) {
        throw new BadRequestException('نوع حساب باید با حساب والد یکسان باشد');
      }
      if (!code.startsWith(parent.code) || code === parent.code) {
        throw new BadRequestException(
          `کد حساب زیرمجموعه باید با کد والد (${parent.code}) شروع شود و از آن طولانی‌تر باشد`,
        );
      }
      parentId = parent.id;
    }
    const exists = await this.prisma.account.findUnique({ where: { code } });
    if (exists) throw new ConflictException('این کد حساب قبلاً تعریف شده است');

    const created = await this.prisma.account.create({
      data: {
        code,
        name: dto.name.trim(),
        type: dto.type,
        parentId,
        description: dto.description?.trim() || null,
        allowManualEntry: dto.allowManualEntry ?? true,
        isSystem: false,
      },
    });
    return { message: 'حساب جدید تعریف شد', id: created.id };
  }

  async updateAccount(
    id: string,
    dto: {
      name?: string;
      description?: string;
      isActive?: boolean;
      allowManualEntry?: boolean;
    },
  ) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    if (account.isSystem) {
      if (dto.isActive === false || dto.allowManualEntry !== undefined) {
        throw new BadRequestException(
          'وضعیت و مجوز سند دستیِ حساب‌های پایه‌ی سیستم قابل تغییر نیست',
        );
      }
      if (dto.name !== undefined) {
        throw new BadRequestException(
          'نام حساب‌های پایه‌ی سیستم ثابت است؛ برای جزئیات بیشتر زیرحساب تعریف کنید',
        );
      }
    }
    if (dto.isActive === false) {
      if (
        !toDecimal(account.balanceRial).isZero() ||
        !toDecimal(account.balanceGrams).isZero()
      ) {
        throw new BadRequestException(
          'حساب دارای مانده را نمی‌توان غیرفعال کرد؛ ابتدا مانده را با سند منتقل کنید',
        );
      }
    }
    await this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        isActive: dto.isActive,
        allowManualEntry: dto.allowManualEntry,
      },
    });
    return { message: 'حساب به‌روزرسانی شد' };
  }

  // ═══════════════════════════════════════════
  // اسناد دستی
  // ═══════════════════════════════════════════
  private async validateVoucher(
    tx: Tx | PrismaService,
    input: VoucherInput,
  ): Promise<{
    entryDate: Date;
    lines: LedgerLineInput[];
    totalRial: Decimal;
    totalGrams: Decimal;
  }> {
    const entryDate = new Date(input.entryDate);
    if (Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException('تاریخ سند نامعتبر است');
    }
    if (entryDate.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('تاریخ سند نمی‌تواند در آینده باشد');
    }
    if (!input.description?.trim()) {
      throw new BadRequestException('شرح سند الزامی است');
    }
    if (!Array.isArray(input.lines) || input.lines.length < 2) {
      throw new BadRequestException('سند باید حداقل دو سطر داشته باشد');
    }
    if (input.lines.length > 200) {
      throw new BadRequestException('حداکثر ۲۰۰ سطر در هر سند مجاز است');
    }

    const codes = [...new Set(input.lines.map((l) => l.accountCode))];
    const accounts = await tx.account.findMany({
      where: { code: { in: codes } },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a]));

    let dr = new Decimal(0);
    let cr = new Decimal(0);
    let drG = new Decimal(0);
    let crG = new Decimal(0);
    const lines = input.lines.map((l, i) => {
      const a = byCode.get(l.accountCode);
      if (!a) {
        throw new BadRequestException(
          `سطر ${i + 1}: حساب ${l.accountCode} یافت نشد`,
        );
      }
      if (!a.isActive) {
        throw new BadRequestException(
          `سطر ${i + 1}: حساب ${a.code} غیرفعال است`,
        );
      }
      if (!a.allowManualEntry && input.type !== 'OPENING') {
        throw new BadRequestException(
          `سطر ${i + 1}: «${a.name}» حساب کنترلی است و فقط از مسیر عملیات سیستمی تغییر می‌کند`,
        );
      }
      if (l.side !== 'DEBIT' && l.side !== 'CREDIT') {
        throw new BadRequestException(`سطر ${i + 1}: جهت سطر نامعتبر است`);
      }
      let rial: Decimal;
      let grams: Decimal;
      try {
        rial = toDecimal(l.amountRial ?? 0);
        grams = toDecimal(l.amountGrams ?? 0);
      } catch {
        throw new BadRequestException(`سطر ${i + 1}: مبلغ نامعتبر است`);
      }
      if (rial.isNegative() || grams.isNegative()) {
        throw new BadRequestException(`سطر ${i + 1}: مبلغ منفی مجاز نیست`);
      }
      if (!rial.isInteger()) {
        throw new BadRequestException(
          `سطر ${i + 1}: مبلغ ریالی باید عدد صحیح باشد`,
        );
      }
      if (grams.decimalPlaces() > 4) {
        throw new BadRequestException(
          `سطر ${i + 1}: دقت وزن حداکثر ۴ رقم اعشار است`,
        );
      }
      if (rial.isZero() && grams.isZero()) {
        throw new BadRequestException(`سطر ${i + 1}: مبلغ و وزن هر دو صفر است`);
      }
      if (l.side === 'DEBIT') {
        dr = dr.plus(rial);
        drG = drG.plus(grams);
      } else {
        cr = cr.plus(rial);
        crG = crG.plus(grams);
      }
      return {
        accountCode: a.code,
        side: l.side,
        amountRial: rial.toString(),
        amountGrams: grams.toString(),
        description: l.description?.trim() || undefined,
      };
    });
    if (!dr.equals(cr)) {
      throw new BadRequestException(
        `سند تراز نیست: جمع بدهکار ${dr.toString()} ≠ جمع بستانکار ${cr.toString()} ریال`,
      );
    }
    if (!drG.equals(crG)) {
      throw new BadRequestException(
        `سند از نظر وزن تراز نیست: بدهکار ${drG.toString()} ≠ بستانکار ${crG.toString()} گرم`,
      );
    }
    await this.accounting.assertPostingDateAllowed(tx, entryDate);
    return { entryDate, lines, totalRial: dr, totalGrams: drG };
  }

  async createVoucher(adminId: string, input: VoucherInput) {
    const v = await this.validateVoucher(this.prisma, input);
    return this.prisma.$transaction(async (tx) => {
      const voucherNumber = await this.sequence.next(tx, 'MJV');
      const created = await tx.manualVoucher.create({
        data: {
          voucherNumber,
          type: input.type ?? 'GENERAL',
          entryDate: v.entryDate,
          description: input.description.trim(),
          attachmentRef: input.attachmentRef?.trim() || null,
          lines: v.lines as unknown as Prisma.InputJsonValue,
          totalRial: v.totalRial.toFixed(0),
          totalGrams: v.totalGrams.toString(),
          createdByAdminId: adminId,
        },
      });
      return {
        message: 'سند دستی ثبت شد و در انتظار تأیید است',
        id: created.id,
        voucherNumber,
      };
    }, TX_OPTIONS);
  }

  async updateVoucher(adminId: string, id: string, input: VoucherInput) {
    const voucher = await this.getVoucherOrThrow(id);
    if (voucher.status !== 'DRAFT') {
      throw new ConflictException('فقط سند پیش‌نویس قابل ویرایش است');
    }
    const v = await this.validateVoucher(this.prisma, input);
    await this.prisma.manualVoucher.update({
      where: { id },
      data: {
        type: input.type ?? voucher.type,
        entryDate: v.entryDate,
        description: input.description.trim(),
        attachmentRef: input.attachmentRef?.trim() || null,
        lines: v.lines as unknown as Prisma.InputJsonValue,
        totalRial: v.totalRial.toFixed(0),
        totalGrams: v.totalGrams.toString(),
        // ویرایش‌کننده مسئول محتوای جدید است (کنترل دوگانه)
        createdByAdminId: adminId,
      },
    });
    return { message: 'سند ویرایش شد' };
  }

  private async getVoucherOrThrow(id: string) {
    const v = await this.prisma.manualVoucher.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('سند دستی یافت نشد');
    return v;
  }

  async approveVoucher(adminId: string, id: string) {
    const selfApprove = await this.config.getBoolean(
      'accounting.allow_self_approve',
      false,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "manual_vouchers" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const voucher = await tx.manualVoucher.findUnique({ where: { id } });
      if (!voucher) throw new NotFoundException('سند دستی یافت نشد');
      if (voucher.status !== 'DRAFT') {
        throw new ConflictException('این سند در وضعیت پیش‌نویس نیست');
      }
      if (voucher.createdByAdminId === adminId && !selfApprove) {
        throw new ForbiddenException(
          'کنترل دوگانه: تأیید سند باید توسط شخصی غیر از ثبت‌کننده انجام شود',
        );
      }
      const v = await this.validateVoucher(tx, {
        type: voucher.type,
        entryDate: voucher.entryDate.toISOString(),
        description: voucher.description,
        lines: voucher.lines as unknown as VoucherLine[],
      });
      const journal = await this.accounting.postJournal(tx, {
        description: `${voucher.voucherNumber} — ${voucher.description}`,
        totalRial: v.totalRial,
        totalGrams: v.totalGrams,
        entryDate: v.entryDate,
        source: voucher.type === 'OPENING' ? 'OPENING' : 'MANUAL',
        referenceType: 'MANUAL_VOUCHER',
        referenceId: voucher.id,
        createdByAdminId: voucher.createdByAdminId,
        lines: v.lines,
      });
      await tx.manualVoucher.update({
        where: { id },
        data: {
          status: 'POSTED',
          approvedByAdminId: adminId,
          approvedAt: new Date(),
          journalEntryId: journal.id,
        },
      });
      this.logger.log(
        `[Accounting] سند دستی ${voucher.voucherNumber} توسط ${adminId} تأیید و ثبت شد`,
      );
      return {
        message: 'سند تأیید و در دفتر کل ثبت شد',
        journalEntryId: journal.id,
      };
    }, TX_OPTIONS);
  }

  async rejectVoucher(adminId: string, id: string, reason: string) {
    const voucher = await this.getVoucherOrThrow(id);
    if (voucher.status !== 'DRAFT') {
      throw new ConflictException('فقط سند پیش‌نویس قابل رد است');
    }
    await this.prisma.manualVoucher.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: reason,
        approvedByAdminId: adminId,
        approvedAt: new Date(),
      },
    });
    return { message: 'سند رد شد' };
  }

  async cancelVoucher(adminId: string, id: string) {
    const voucher = await this.getVoucherOrThrow(id);
    if (voucher.status !== 'DRAFT') {
      throw new ConflictException('فقط سند پیش‌نویس قابل ابطال است');
    }
    await this.prisma.manualVoucher.update({
      where: { id },
      data: { status: 'CANCELLED', rejectReason: `ابطال توسط ${adminId}` },
    });
    return { message: 'سند پیش‌نویس ابطال شد' };
  }

  async reverseVoucher(adminId: string, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "manual_vouchers" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const voucher = await tx.manualVoucher.findUnique({ where: { id } });
      if (!voucher) throw new NotFoundException('سند دستی یافت نشد');
      if (voucher.status !== 'POSTED' || !voucher.journalEntryId) {
        throw new ConflictException('فقط سند ثبت‌شده قابل برگشت است');
      }
      await this.accounting.assertPostingDateAllowed(tx, new Date());
      const rev = await this.accounting.reverseJournal(
        tx,
        voucher.journalEntryId,
        {
          description: `برگشت سند ${voucher.voucherNumber} — ${reason}`,
          createdByAdminId: adminId,
        },
      );
      await tx.manualVoucher.update({
        where: { id },
        data: { status: 'REVERSED', reversalJournalEntryId: rev.id },
      });
      return { message: 'سند برگشتی ثبت شد', journalEntryId: rev.id };
    }, TX_OPTIONS);
  }

  async listVouchers(query: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 30), 100);
    const where: Prisma.ManualVoucherWhereInput = {};
    if (query.status) where.status = query.status as never;
    if (query.type) where.type = query.type as never;
    if (query.search) {
      where.OR = [
        { voucherNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.manualVoucher.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.manualVoucher.count({ where }),
    ]);
    const adminIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.createdByAdminId, r.approvedByAdminId])
          .filter(Boolean),
      ),
    ] as string[];
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, fullName: true },
    });
    const name = (id: string | null) =>
      id ? (admins.find((a) => a.id === id)?.fullName ?? null) : null;
    return {
      data: rows.map((r) => ({
        id: r.id,
        voucherNumber: r.voucherNumber,
        type: r.type,
        status: r.status,
        entryDate: r.entryDate.toISOString(),
        description: r.description,
        totalRial: r.totalRial.toString(),
        totalGrams: r.totalGrams.toString(),
        lines: r.lines,
        attachmentRef: r.attachmentRef,
        createdBy: name(r.createdByAdminId),
        createdByAdminId: r.createdByAdminId,
        approvedBy: name(r.approvedByAdminId),
        approvedAt: r.approvedAt?.toISOString() ?? null,
        rejectReason: r.rejectReason,
        journalEntryId: r.journalEntryId,
        reversalJournalEntryId: r.reversalJournalEntryId,
        createdAt: r.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ═══════════════════════════════════════════
  // سال مالی، قفل دوره و قطعی‌سازی
  // ═══════════════════════════════════════════
  async listFiscalYears() {
    const [years, lock] = await Promise.all([
      this.prisma.fiscalYear.findMany({ orderBy: { startDate: 'desc' } }),
      this.config.get('accounting.locked_until', ''),
    ]);
    const counts = await Promise.all(
      years.map((y) =>
        Promise.all([
          this.prisma.journalEntry.count({
            where: { entryDate: { gte: y.startDate, lte: y.endDate } },
          }),
          this.prisma.journalEntry.count({
            where: { fiscalYearId: y.id, permanentNumber: { not: null } },
          }),
        ]),
      ),
    );
    return {
      lockedUntil: lock || null,
      data: years.map((y, i) => ({
        id: y.id,
        title: y.title,
        startDate: y.startDate.toISOString(),
        endDate: y.endDate.toISOString(),
        status: y.status,
        closedAt: y.closedAt?.toISOString() ?? null,
        closingJournalId: y.closingJournalId,
        journalCount: counts[i][0],
        finalizedCount: counts[i][1],
      })),
    };
  }

  async createFiscalYear(dto: {
    title: string;
    startDate: string;
    endDate: string;
  }) {
    const start = new Date(dto.startDate);
    const end = endOfDay(dto.endDate);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('بازه‌ی سال مالی نامعتبر است');
    }
    const overlap = await this.prisma.fiscalYear.findFirst({
      where: { startDate: { lte: end }, endDate: { gte: start } },
    });
    if (overlap) {
      throw new ConflictException(
        `با سال مالی «${overlap.title}» هم‌پوشانی دارد`,
      );
    }
    const y = await this.prisma.fiscalYear.create({
      data: { title: dto.title.trim(), startDate: start, endDate: end },
    });
    return { message: 'سال مالی تعریف شد', id: y.id };
  }

  async setLockDate(date: string | null) {
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new BadRequestException('قالب تاریخ باید YYYY-MM-DD باشد');
      }
      if (endOfDay(date).getTime() >= Date.now()) {
        throw new BadRequestException('تاریخ قفل باید قبل از امروز باشد');
      }
      const current = await this.config.get('accounting.locked_until', '');
      if (current && date < current) {
        const closed = await this.prisma.fiscalYear.findFirst({
          where: { status: 'CLOSED', endDate: { gte: new Date(date) } },
        });
        if (closed) {
          throw new BadRequestException(
            `سال مالی «${closed.title}» بسته شده؛ قفل را نمی‌توان به قبل از پایان آن برگرداند`,
          );
        }
      }
    }
    await this.config.set('accounting.locked_until', date ?? '');
    return {
      message: date ? `دوره‌ی مالی تا ${date} قفل شد` : 'قفل دوره برداشته شد',
    };
  }

  /**
   * قطعی‌سازی: به اسناد تا تاریخ مشخص (به ترتیب تاریخ و شماره عطف) شماره‌ی دائم
   * بدون فاصله در هر سال مالی داده و دوره تا همان تاریخ قفل می‌شود.
   */
  async finalizeJournals(upTo: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(upTo)) {
      throw new BadRequestException('قالب تاریخ باید YYYY-MM-DD باشد');
    }
    const until = endOfDay(upTo);
    if (until.getTime() >= Date.now()) {
      throw new BadRequestException('قطعی‌سازی فقط برای روزهای گذشته ممکن است');
    }
    const years = await this.prisma.fiscalYear.findMany({
      where: { startDate: { lte: until } },
      orderBy: { startDate: 'asc' },
    });
    if (!years.length) {
      throw new BadRequestException('ابتدا سال مالی را تعریف کنید');
    }
    let finalized = 0;
    await this.prisma.$transaction(
      async (tx) => {
        for (const y of years) {
          const yearEnd = y.endDate < until ? y.endDate : until;
          finalized += await tx.$executeRaw`
          WITH base AS (
            SELECT COALESCE(MAX("permanent_number"), 0) AS m
            FROM "journal_entries" WHERE "fiscal_year_id" = ${y.id}::uuid
          ), numbered AS (
            SELECT "id", ROW_NUMBER() OVER (ORDER BY "entry_date", "reference_number") AS rn
            FROM "journal_entries"
            WHERE "permanent_number" IS NULL
              AND "entry_date" >= ${y.startDate} AND "entry_date" <= ${yearEnd}
          )
          UPDATE "journal_entries" j
          SET "permanent_number" = (SELECT m FROM base) + n.rn,
              "fiscal_year_id" = ${y.id}::uuid,
              "finalized_at" = NOW()
          FROM numbered n WHERE j."id" = n."id"`;
        }
      },
      { maxWait: 5000, timeout: 60000 },
    );
    const current = await this.config.get('accounting.locked_until', '');
    if (!current || current < upTo) {
      await this.config.set('accounting.locked_until', upTo);
    }
    return {
      message: `${finalized} سند قطعی شد و دوره تا ${upTo} قفل گردید`,
      finalized,
    };
  }

  /**
   * بستن سال مالی: مانده‌ی ریالی حساب‌های درآمد و هزینه تا پایان سال به حساب
   * سود (زیان) انباشته منتقل می‌شود (سند اختتامیه‌ی حساب‌های موقت).
   */
  async closeFiscalYear(adminId: string, id: string) {
    return this.prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "fiscal_years" WHERE "id" = ${id}::uuid FOR UPDATE`;
          const year = await tx.fiscalYear.findUnique({ where: { id } });
          if (!year) throw new NotFoundException('سال مالی یافت نشد');
          if (year.status === 'CLOSED') {
            throw new ConflictException('این سال مالی قبلاً بسته شده است');
          }
          if (year.endDate.getTime() > Date.now()) {
            throw new BadRequestException('سال مالی هنوز به پایان نرسیده است');
          }
          const openBefore = await tx.fiscalYear.findFirst({
            where: { status: 'OPEN', endDate: { lt: year.startDate } },
          });
          if (openBefore) {
            throw new BadRequestException(
              `ابتدا سال مالی قبلی «${openBefore.title}» را ببندید`,
            );
          }

          const rows = await tx.$queryRaw<
            { code: string; dr: Prisma.Decimal; cr: Prisma.Decimal }[]
          >`
        SELECT a."code",
          COALESCE(SUM(CASE WHEN le."side"='DEBIT'  THEN le."amount_rial" END),0) AS dr,
          COALESCE(SUM(CASE WHEN le."side"='CREDIT' THEN le."amount_rial" END),0) AS cr
        FROM "ledger_entries" le
        JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        JOIN "accounts" a ON a."id" = le."account_id"
        WHERE a."type" IN ('INCOME'::"AccountType", 'EXPENSE'::"AccountType")
          AND je."entry_date" <= ${year.endDate}
        GROUP BY a."code"`;

          const lines: LedgerLineInput[] = [];
          let net = new Decimal(0); // + سود
          for (const r of rows) {
            const diff = toDecimal(r.dr).minus(toDecimal(r.cr)); // + مانده بدهکار
            if (diff.isZero()) continue;
            lines.push({
              accountCode: r.code,
              side: diff.gt(0) ? 'CREDIT' : 'DEBIT',
              amountRial: diff.abs(),
            });
            net = net.minus(diff);
          }
          let journalId: string | null = null;
          if (lines.length) {
            if (!net.isZero()) {
              lines.push({
                accountCode: ACC.RETAINED_EARNINGS,
                side: net.gt(0) ? 'CREDIT' : 'DEBIT',
                amountRial: net.abs(),
              });
            }
            const total = lines
              .filter((l) => l.side === 'DEBIT')
              .reduce(
                (t, l) => t.plus(toDecimal(l.amountRial)),
                new Decimal(0),
              );
            const journal = await this.accounting.postJournal(tx, {
              description: `سند اختتامیه‌ی حساب‌های موقت — ${year.title} (${net.gte(0) ? 'سود' : 'زیان'} خالص ${net.abs().toString()} ریال)`,
              totalRial: total,
              totalGrams: 0,
              entryDate: year.endDate,
              source: 'CLOSING',
              referenceType: 'FISCAL_YEAR',
              referenceId: year.id,
              createdByAdminId: adminId,
              lines,
            });
            journalId = journal.id;
          }
          await tx.fiscalYear.update({
            where: { id },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              closedByAdminId: adminId,
              closingJournalId: journalId,
            },
          });
          return {
            message: `سال مالی بسته شد — ${net.gte(0) ? 'سود' : 'زیان'} خالص: ${net.abs().toString()} ریال`,
            netProfitRial: net.toString(),
            closingJournalId: journalId,
          };
        },
        { maxWait: 5000, timeout: 30000 },
      )
      .then(async (res) => {
        const year = await this.prisma.fiscalYear.findUnique({ where: { id } });
        if (year) {
          const d = year.endDate.toISOString().slice(0, 10);
          const current = await this.config.get('accounting.locked_until', '');
          if (!current || current < d) {
            await this.config.set('accounting.locked_until', d);
          }
        }
        return res;
      });
  }
}
