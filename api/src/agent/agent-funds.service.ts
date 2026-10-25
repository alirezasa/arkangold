// api/src/agent/agent-funds.service.ts
//
// امور مالی نماینده (کیف پول ریالی جدا از کاربران):
//   • حساب‌های بانکی نماینده — ثبت توسط نماینده/مدیر، تأیید مالکیت توسط واحد مالی. فقط حساب
//     تأییدشده مبدأ واریز بانکی و مقصد برداشت/تسویه است (بند ۵-۱ و ۸-۹ قرارداد).
//   • واریز: درگاه پرداخت (تأیید خودکار با استعلام درگاه) یا واریز بانکی/حساب به حساب
//     (پایا، ساتنا، پل) با شماره پیگیری و تأیید مالی.
//   • برداشت: رزرو مبلغ ← تأیید ← پرداخت بانکی با شماره پیگیری ← سند.
//   • تسویه‌ی بدهی امانی/اعتباری از محل کیف پول و اصلاحیه‌ی کیف پول توسط مالی.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory';
import { AgentAccountingService, agentTag } from './agent-accounting.service';
import { AgentWalletService } from './agent-wallet.service';
import { AgentOrderPaymentService } from './agent-order-payment.service';
import {
  CreateAgentBankAccountDto,
  CreateAgentDepositDto,
  CreateAgentWithdrawalDto,
  TRANSFER_TYPE_FA,
  TradingListQueryDto,
} from './agent-trading.dto';

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

const toman = (rial: Decimal.Value | Prisma.Decimal) =>
  new Decimal(rial.toString())
    .dividedBy(10)
    .toDecimalPlaces(0)
    .toNumber()
    .toLocaleString('fa-IR');

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

/** بررسی رقم کنترل شبا (ISO 13616 — mod 97) */
export function isValidSheba(sheba: string): boolean {
  if (!/^IR\d{24}$/.test(sheba)) return false;
  const rearranged = sheba.slice(4) + '1827' + sheba.slice(2, 4);
  let rem = 0;
  for (const ch of rearranged) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export const DEPOSIT_STATUS_FA: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PENDING_REVIEW: 'در انتظار تأیید مالی',
  APPROVED: 'واریز شد',
  REJECTED: 'رد شد',
  FAILED: 'ناموفق',
  CANCELLED: 'لغو شد',
  EXPIRED: 'منقضی شد',
};

export const WITHDRAWAL_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأییدشده — در صف پرداخت',
  PAID: 'پرداخت شد',
  REJECTED: 'رد شد',
  CANCELLED: 'لغو شد',
};

@Injectable()
export class AgentFundsService {
  private readonly logger = new Logger(AgentFundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: DocumentSequenceService,
    private readonly systemConfig: SystemConfigService,
    private readonly sms: SmsTemplateService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly agentAccounting: AgentAccountingService,
    private readonly wallet: AgentWalletService,
    private readonly orderPayment: AgentOrderPaymentService,
  ) {}

  private async agentOrThrow(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');
    return agent;
  }

  private notify(
    key: string,
    agent: { phone: string; name: string },
    vars: Record<string, string>,
    ref: { type: string; id: string },
  ) {
    void this.sms
      .send(
        key,
        agent.phone,
        { agentName: agent.name, ...vars },
        { referenceType: ref.type, referenceId: ref.id },
      )
      .catch(() => undefined);
  }

  // ══════════════════════════════════════════
  // ── حساب‌های بانکی ──
  // ══════════════════════════════════════════

  async listBankAccounts(agentId: string, includeArchived = false) {
    return this.prisma.agentBankAccount.findMany({
      where: { agentId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addBankAccount(
    agentId: string,
    dto: CreateAgentBankAccountDto,
    actorId: string,
  ) {
    const agent = await this.agentOrThrow(agentId);
    if (agent.status === 'TERMINATED') {
      throw new ForbiddenException('همکاری این نماینده خاتمه یافته است');
    }
    if (!isValidSheba(dto.sheba)) {
      throw new BadRequestException('شماره شبا معتبر نیست (رقم کنترل نادرست)');
    }
    const max = await this.systemConfig.getNumber(
      'agent.bank_account.max_per_agent',
      5,
    );
    const count = await this.prisma.agentBankAccount.count({
      where: { agentId, archivedAt: null },
    });
    if (count >= max) {
      throw new ConflictException(
        `حداکثر ${max.toLocaleString('fa-IR')} حساب بانکی فعال قابل ثبت است`,
      );
    }
    const existing = await this.prisma.agentBankAccount.findUnique({
      where: { agentId_sheba: { agentId, sheba: dto.sheba } },
    });
    if (existing && !existing.archivedAt) {
      throw new ConflictException('این شماره شبا قبلاً ثبت شده است');
    }
    const data = {
      bankName: dto.bankName.trim(),
      accountNumber: dto.accountNumber || null,
      cardNumber: dto.cardNumber || null,
      ownerName: dto.ownerName.trim(),
      status: 'PENDING' as const,
      isDefault: count === 0,
      rejectionReason: null,
      verifiedAt: null,
      verifiedById: null,
      archivedAt: null,
      createdById: actorId,
    };
    const row = existing
      ? await this.prisma.agentBankAccount.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.agentBankAccount.create({
          data: { agentId, sheba: dto.sheba, ...data },
        });
    return {
      message:
        'حساب بانکی ثبت شد و پس از تأیید مالکیت توسط واحد مالی قابل استفاده است',
      account: row,
    };
  }

  async setDefaultBankAccount(agentId: string, accountId: string) {
    const acc = await this.prisma.agentBankAccount.findFirst({
      where: { id: accountId, agentId, archivedAt: null },
    });
    if (!acc) throw new NotFoundException('حساب بانکی یافت نشد');
    if (acc.status !== 'VERIFIED') {
      throw new ConflictException('فقط حساب تأییدشده می‌تواند پیش‌فرض باشد');
    }
    await this.prisma.$transaction([
      this.prisma.agentBankAccount.updateMany({
        where: { agentId },
        data: { isDefault: false },
      }),
      this.prisma.agentBankAccount.update({
        where: { id: acc.id },
        data: { isDefault: true },
      }),
    ]);
    return { message: 'حساب پیش‌فرض تغییر کرد' };
  }

  async archiveBankAccount(agentId: string, accountId: string) {
    const acc = await this.prisma.agentBankAccount.findFirst({
      where: { id: accountId, agentId, archivedAt: null },
    });
    if (!acc) throw new NotFoundException('حساب بانکی یافت نشد');
    const inUse = await this.prisma.agentWithdrawalRequest.count({
      where: { bankAccountId: acc.id, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (inUse) {
      throw new ConflictException(
        'برای این حساب برداشت در جریان وجود دارد؛ پس از تعیین تکلیف حذف کنید',
      );
    }
    await this.prisma.agentBankAccount.update({
      where: { id: acc.id },
      data: { archivedAt: new Date(), isDefault: false },
    });
    return { message: 'حساب بانکی حذف شد' };
  }

  async reviewBankAccount(
    accountId: string,
    approve: boolean,
    reason: string | undefined,
    adminId: string,
  ) {
    const acc = await this.prisma.agentBankAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.archivedAt) throw new NotFoundException('حساب یافت نشد');
    if (!approve && (!reason || reason.trim().length < 5)) {
      throw new BadRequestException('دلیل رد را وارد کنید');
    }
    const updated = await this.prisma.agentBankAccount.update({
      where: { id: acc.id },
      data: approve
        ? {
            status: 'VERIFIED',
            verifiedAt: new Date(),
            verifiedById: adminId,
            rejectionReason: null,
          }
        : {
            status: 'REJECTED',
            rejectionReason: reason?.trim(),
            isDefault: false,
          },
    });
    // اولین حساب تأییدشده پیش‌فرض می‌شود
    if (approve) {
      const hasDefault = await this.prisma.agentBankAccount.count({
        where: {
          agentId: acc.agentId,
          isDefault: true,
          status: 'VERIFIED',
          archivedAt: null,
        },
      });
      if (!hasDefault) {
        await this.prisma.agentBankAccount.update({
          where: { id: acc.id },
          data: { isDefault: true },
        });
      }
    }
    return {
      message: approve ? 'حساب بانکی تأیید شد' : 'حساب بانکی رد شد',
      account: updated,
    };
  }

  async pendingBankAccounts(query: TradingListQueryDto) {
    const where: Prisma.AgentBankAccountWhereInput = {
      archivedAt: null,
      status:
        (query.status as 'PENDING' | 'VERIFIED' | 'REJECTED') || 'PENDING',
      ...(query.agentId ? { agentId: query.agentId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.agentBankAccount.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: {
            select: {
              id: true,
              code: true,
              name: true,
              managerName: true,
              legalType: true,
            },
          },
        },
      }),
      this.prisma.agentBankAccount.count({ where }),
    ]);
    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** حساب تأییدشده‌ی متعلق به همین نماینده یا خطا */
  async verifiedAccountOrThrow(agentId: string, accountId: string) {
    const acc = await this.prisma.agentBankAccount.findFirst({
      where: { id: accountId, agentId, archivedAt: null },
    });
    if (!acc) throw new NotFoundException('حساب بانکی یافت نشد');
    if (acc.status !== 'VERIFIED') {
      throw new ConflictException(
        'این حساب بانکی هنوز توسط واحد مالی تأیید نشده است',
      );
    }
    return acc;
  }

  // ══════════════════════════════════════════
  // ── واریز ──
  // ══════════════════════════════════════════

  /** حساب رسمی شرکت برای واریز نمایندگان (پیش‌فرض: همان حساب واریز کاربران) */
  async companyDestination() {
    const pick = async (key: string) =>
      (await this.systemConfig.get(`agent.bank_transfer.destination_${key}`)) ||
      (await this.systemConfig.get(`deposit.bank_transfer.destination_${key}`));
    const [owner, accountNumber, sheba, bank] = await Promise.all([
      pick('owner'),
      pick('account'),
      pick('sheba'),
      this.systemConfig.get('agent.bank_transfer.destination_bank'),
    ]);
    if (!sheba && !accountNumber) {
      throw new BadRequestException(
        'حساب رسمی شرکت برای واریز نمایندگان در تنظیمات سیستم تعریف نشده است',
      );
    }
    return { owner, bank: bank ?? '', accountNumber, sheba };
  }

  async gatewayMaxRial() {
    return this.systemConfig.getNumber(
      'agent.gateway.max_amount_rial',
      2_000_000_000,
    );
  }

  private async callbackUrl(providerKey: string) {
    const base = await this.systemConfig.get(
      'payment.gateway.callback_base_url',
      'http://localhost:5000',
    );
    return `${base}/agent-payments/callback/${providerKey.toLowerCase()}`;
  }

  /**
   * ثبت درخواست واریز. درگاه → آدرس انتقال به درگاه؛ واریز بانکی → در انتظار تأیید مالی.
   * با purchaseOrderId، پس از تأیید واریز همان سفارش خودکار از کیف پول پرداخت می‌شود.
   */
  async createDeposit(
    agentId: string,
    actorId: string,
    dto: CreateAgentDepositDto,
    purchaseOrderId?: string,
  ) {
    const agent = await this.agentOrThrow(agentId);
    if (agent.status === 'TERMINATED') {
      throw new ForbiddenException('همکاری این نماینده خاتمه یافته است');
    }
    const amount = Math.round(dto.amountRial);

    if (dto.method === 'GATEWAY') {
      const max = await this.gatewayMaxRial();
      if (max > 0 && amount > max) {
        throw new BadRequestException(
          `سقف پرداخت درگاه ${toman(max)} تومان است؛ برای مبالغ بیشتر از واریز بانکی (پایا/ساتنا/حساب به حساب) با پیش‌فاکتور استفاده کنید`,
        );
      }
      const provider = this.gatewayFactory.get(dto.gateway ?? 'ZARINPAL');
      if (!(await provider.isEnabled())) {
        throw new BadRequestException('این درگاه پرداخت در حال حاضر فعال نیست');
      }
      const deposit = await this.prisma.$transaction(async (tx) => {
        const requestNumber = await this.sequence.next(tx, 'AGD');
        return tx.agentDepositRequest.create({
          data: {
            requestNumber,
            agentId,
            amountRial: amount,
            method: 'GATEWAY',
            status: 'PENDING_PAYMENT',
            gatewayProvider: provider.key,
            purchaseOrderId: purchaseOrderId ?? null,
            agentNote: dto.note,
            expiresAt: new Date(Date.now() + 30 * 60_000),
            createdById: actorId,
          },
        });
      });
      try {
        const result = await provider.requestPayment({
          amountRial: String(amount),
          orderId: deposit.id,
          userId: agentId,
          description: `واریز به کیف پول نماینده ${agent.code} — ${deposit.requestNumber}`,
          callbackUrl: await this.callbackUrl(provider.key),
        });
        await this.prisma.agentDepositRequest.update({
          where: { id: deposit.id },
          data: { gatewayProviderRef: result.providerRef },
        });
        return {
          deposit: { id: deposit.id, requestNumber: deposit.requestNumber },
          redirectUrl: result.redirectUrl,
        };
      } catch (err) {
        await this.prisma.agentDepositRequest.update({
          where: { id: deposit.id },
          data: {
            status: 'FAILED',
            rejectionReason: 'اتصال به درگاه ناموفق بود',
          },
        });
        this.logger.error(
          `[AgentDeposit] اتصال به درگاه برای ${deposit.requestNumber} ناموفق بود: ${(err as Error).message}`,
        );
        throw new BadRequestException(
          'اتصال به درگاه پرداخت ناموفق بود؛ لحظاتی دیگر تلاش کنید',
        );
      }
    }

    // ── واریز بانکی / حساب به حساب ──
    const source = await this.verifiedAccountOrThrow(
      agentId,
      dto.sourceBankAccountId,
    );
    const destination = await this.companyDestination();
    try {
      const deposit = await this.prisma.$transaction(async (tx) => {
        const requestNumber = await this.sequence.next(tx, 'AGD');
        return tx.agentDepositRequest.create({
          data: {
            requestNumber,
            agentId,
            amountRial: amount,
            method: 'BANK_TRANSFER',
            status: 'PENDING_REVIEW',
            transferType: dto.transferType,
            sourceBankAccountId: source.id,
            bankReference: dto.bankReference?.trim(),
            paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
            agentNote: dto.note,
            destinationSnapshot: destination,
            purchaseOrderId: purchaseOrderId ?? null,
            createdById: actorId,
          },
        });
      });
      return {
        message:
          'مشخصات واریز ثبت شد و پس از تطبیق با صورتحساب بانک، به کیف پول شما واریز می‌شود',
        deposit,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'این شماره پیگیری/مرجع بانکی قبلاً ثبت شده است',
        );
      }
      throw err;
    }
  }

  /** بازگشت از درگاه: استعلام پرداخت، واریز به کیف پول و (در صورت اتصال) پرداخت سفارش */
  async handleGatewayCallback(
    providerKey: 'ZARINPAL' | 'BEHPARDAKHT',
    providerRef: string,
    query: Record<string, string>,
  ) {
    const deposit = await this.prisma.agentDepositRequest.findFirst({
      where: { gatewayProvider: providerKey, gatewayProviderRef: providerRef },
    });
    if (!deposit) throw new NotFoundException('تراکنش پرداخت یافت نشد');
    const base = {
      depositId: deposit.id,
      purchaseOrderId: deposit.purchaseOrderId,
    };
    if (deposit.status === 'APPROVED') {
      return { ...base, success: true, alreadyProcessed: true };
    }
    if (deposit.status !== 'PENDING_PAYMENT') {
      return { ...base, success: false, alreadyProcessed: true };
    }

    const provider = this.gatewayFactory.get(providerKey);
    const verify = await provider.verifyPayment({
      providerRef,
      amountRial: d(deposit.amountRial).toFixed(0),
      callbackQuery: query,
    });
    if (!verify.success) {
      await this.prisma.agentDepositRequest.updateMany({
        where: { id: deposit.id, status: 'PENDING_PAYMENT' },
        data: {
          status: 'FAILED',
          rejectionReason: verify.failureReason ?? 'پرداخت ناموفق',
        },
      });
      return { ...base, success: false, alreadyProcessed: false };
    }

    let orderPaid = false;
    let orderError: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const credited = await this.approveDepositTx(tx, deposit.id, null, {
        gatewayTrackingCode: verify.trackingCode ?? null,
      });
      if (!credited) return;
      // پرداخت سفارش متصل — اگر قابل پرداخت نباشد (مثلاً مهلت قیمت گذشته)، وجه در کیف پول
      // می‌ماند و واریز برگردانده نمی‌شود
      if (deposit.purchaseOrderId) {
        const check = await this.orderPayment.isPayable(
          tx,
          deposit.purchaseOrderId,
        );
        if (check.ok) {
          await this.orderPayment.payFromWallet(
            tx,
            deposit.purchaseOrderId,
            null,
          );
          orderPaid = true;
        } else {
          orderError = check.reason ?? null;
        }
      }
    }, TX_OPTIONS);
    if (orderError) {
      this.logger.warn(
        `[AgentDeposit] واریز ${deposit.requestNumber} انجام شد اما پرداخت سفارش ناموفق بود: ${orderError}`,
      );
    }
    return { ...base, success: true, alreadyProcessed: false, orderPaid };
  }

  /**
   * تأیید واریز داخل تراکنش: ثبت سند (بد 1010 / بس 2070) و افزایش کیف پول. ضدتکرار —
   * اگر واریز قبلاً تأیید شده باشد false برمی‌گردد.
   */
  private async approveDepositTx(
    tx: Tx,
    depositId: string,
    adminId: string | null,
    extra: { gatewayTrackingCode?: string | null } = {},
  ): Promise<boolean> {
    await tx.$executeRaw`SELECT 1 FROM "agent_deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;
    const dep = await tx.agentDepositRequest.findUniqueOrThrow({
      where: { id: depositId },
      include: { agent: { select: { code: true } } },
    });
    if (dep.status === 'APPROVED') return false;
    if (dep.status !== 'PENDING_PAYMENT' && dep.status !== 'PENDING_REVIEW') {
      throw new ConflictException('این واریز در وضعیت قابل تأیید نیست');
    }
    const amount = d(dep.amountRial);
    const methodLabel =
      dep.method === 'GATEWAY'
        ? 'درگاه پرداخت'
        : (TRANSFER_TYPE_FA[dep.transferType ?? ''] ?? 'واریز بانکی');
    const journal = await this.agentAccounting.journalWalletDeposit(tx, {
      agentTag: agentTag(dep.agent.code),
      number: dep.requestNumber,
      amountRial: amount,
      methodLabel,
    });
    await this.wallet.post(tx, {
      agentId: dep.agentId,
      type: 'DEPOSIT',
      creditRial: amount,
      description: `واریز ${methodLabel}${
        dep.bankReference ? ` — مرجع ${dep.bankReference}` : ''
      }${extra.gatewayTrackingCode ? ` — کد رهگیری ${extra.gatewayTrackingCode}` : ''}`,
      referenceType: 'AGENT_DEPOSIT',
      referenceId: dep.id,
      referenceNumber: dep.requestNumber,
      journalEntryId: journal.id,
      createdByAdminId: adminId,
    });
    await tx.agentDepositRequest.update({
      where: { id: dep.id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedById: adminId,
        journalEntryId: journal.id,
        ...(extra.gatewayTrackingCode
          ? {
              gatewayTrackingCode: extra.gatewayTrackingCode,
              paidAt: new Date(),
            }
          : {}),
      },
    });
    return true;
  }

  /** تأیید واریز بانکی توسط مالی؛ سفارش متصل در صورت امکان خودکار پرداخت می‌شود */
  async approveDeposit(depositId: string, adminId: string) {
    const dep = await this.prisma.agentDepositRequest.findUnique({
      where: { id: depositId },
      include: { agent: true },
    });
    if (!dep) throw new NotFoundException('درخواست واریز یافت نشد');
    if (dep.method !== 'BANK_TRANSFER') {
      throw new ConflictException(
        'واریز درگاهی فقط با استعلام درگاه تأیید می‌شود',
      );
    }
    let orderMessage = '';
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.approveDepositTx(tx, dep.id, adminId);
      if (!ok) throw new ConflictException('این واریز قبلاً تأیید شده است');
      if (dep.purchaseOrderId) {
        // مشخصات واریز در مهلت ثبت شده بود؛ تأیید مالی پس از مهلت هم معتبر است
        const check = await this.orderPayment.isPayable(
          tx,
          dep.purchaseOrderId,
          {
            allowAfterLock: true,
          },
        );
        if (check.ok) {
          await this.orderPayment.payFromWallet(
            tx,
            dep.purchaseOrderId,
            adminId,
            {
              allowAfterLock: true,
            },
          );
          orderMessage = ' و سفارش متصل پرداخت شد';
        } else {
          orderMessage = `؛ پرداخت سفارش متصل ممکن نشد (${check.reason}) و وجه در کیف پول ماند`;
        }
      }
    }, TX_OPTIONS);
    this.notify(
      'AGENT_WALLET_DEPOSIT',
      dep.agent,
      { amount: toman(dep.amountRial), requestNumber: dep.requestNumber },
      { type: 'AGENT_DEPOSIT', id: dep.id },
    );
    return {
      message: `واریز تأیید و به کیف پول نماینده افزوده شد${orderMessage}`,
    };
  }

  async rejectDeposit(depositId: string, reason: string, adminId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;
      const dep = await tx.agentDepositRequest.findUnique({
        where: { id: depositId },
        include: { agent: true },
      });
      if (!dep) throw new NotFoundException('درخواست واریز یافت نشد');
      if (dep.status !== 'PENDING_REVIEW') {
        throw new ConflictException('فقط واریز در انتظار بررسی قابل رد است');
      }
      await tx.agentDepositRequest.update({
        where: { id: dep.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
      // سفارشی که منتظر همین واریز بود لغو می‌شود (پرداخت در مهلت انجام نشده است)
      if (dep.purchaseOrderId) {
        await tx.agentPurchaseOrder.updateMany({
          where: { id: dep.purchaseOrderId, status: 'PAYMENT_REVIEW' },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: `رد واریز بانکی: ${reason.trim()}`,
          },
        });
      }
      return dep;
    });
    this.notify(
      'AGENT_WALLET_REQUEST_REJECTED',
      result.agent,
      { requestNumber: result.requestNumber, reason: reason.trim() },
      { type: 'AGENT_DEPOSIT', id: result.id },
    );
    return { message: 'واریز رد شد' };
  }

  async listDeposits(agentScope: string | null, query: TradingListQueryDto) {
    const agentId = agentScope ?? query.agentId;
    const range = dateRange(query.from, query.to);
    const where: Prisma.AgentDepositRequestWhereInput = {
      ...(agentId ? { agentId } : {}),
      ...(query.status
        ? {
            status:
              query.status as Prisma.EnumAgentDepositStatusFilter['equals'],
          }
        : {}),
      ...(range ? { createdAt: range } : {}),
      ...(query.search
        ? {
            OR: [
              {
                requestNumber: { contains: query.search, mode: 'insensitive' },
              },
              { bankReference: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.agentDepositRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: { select: { id: true, code: true, name: true } },
          sourceBankAccount: {
            select: { bankName: true, sheba: true, ownerName: true },
          },
          purchaseOrder: {
            select: { id: true, orderNumber: true, status: true },
          },
        },
      }),
      this.prisma.agentDepositRequest.count({ where }),
      this.prisma.agentDepositRequest.aggregate({
        where,
        _sum: { amountRial: true },
      }),
    ]);
    return {
      data: items.map((x) => ({
        ...x,
        statusLabel: DEPOSIT_STATUS_FA[x.status] ?? x.status,
        transferTypeLabel: x.transferType
          ? (TRANSFER_TYPE_FA[x.transferType] ?? x.transferType)
          : null,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      totalAmountRial: d(sum._sum.amountRial).toFixed(0),
    };
  }

  /** درخواست‌های درگاهی رهاشده پس از ۳۰ دقیقه منقضی می‌شوند */
  @Cron('*/10 * * * *', { name: 'expire-agent-gateway-deposits' })
  async expireGatewayDeposits() {
    try {
      await this.prisma.agentDepositRequest.updateMany({
        where: {
          method: 'GATEWAY',
          status: 'PENDING_PAYMENT',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED' },
      });
    } catch (err) {
      this.logger.error(
        `[AgentDeposit] منقضی‌سازی واریزهای درگاهی ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  // ══════════════════════════════════════════
  // ── برداشت ──
  // ══════════════════════════════════════════

  async createWithdrawal(
    agentId: string,
    actorId: string,
    dto: CreateAgentWithdrawalDto,
  ) {
    const agent = await this.agentOrThrow(agentId);
    if (agent.status === 'TERMINATED') {
      throw new ForbiddenException('همکاری این نماینده خاتمه یافته است');
    }
    const account = await this.verifiedAccountOrThrow(
      agentId,
      dto.bankAccountId,
    );
    const amount = new Decimal(Math.round(dto.amountRial));
    const max = await this.systemConfig.getNumber(
      'agent.withdrawal.max_amount_rial',
      0,
    );
    if (max > 0 && amount.greaterThan(max)) {
      throw new BadRequestException(`سقف هر برداشت ${toman(max)} تومان است`);
    }
    // با وجود بدهی سررسیدشده، برداشت مجاز نیست (ابتدا تسویه)
    if (d(agent.balanceRial).greaterThan(0)) {
      const blockOnDebt = await this.systemConfig.getBoolean(
        'agent.withdrawal.block_when_in_debt',
        true,
      );
      if (blockOnDebt) {
        throw new ConflictException(
          'تا زمانی که بدهی به شرکت دارید امکان برداشت نیست؛ ابتدا بدهی را از محل کیف پول تسویه کنید',
        );
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await this.wallet.block(tx, agentId, amount);
      const requestNumber = await this.sequence.next(tx, 'AGW');
      return tx.agentWithdrawalRequest.create({
        data: {
          requestNumber,
          agentId,
          amountRial: amount.toFixed(0),
          bankAccountId: account.id,
          destinationSnapshot: {
            bankName: account.bankName,
            sheba: account.sheba,
            ownerName: account.ownerName,
            accountNumber: account.accountNumber,
          },
          note: dto.note,
          createdById: actorId,
        },
      });
    }, TX_OPTIONS);
    return {
      message: 'درخواست برداشت ثبت شد؛ مبلغ تا زمان پرداخت در کیف پول رزرو است',
      request: row,
    };
  }

  async cancelWithdrawal(agentId: string, requestId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_withdrawal_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const w = await tx.agentWithdrawalRequest.findFirst({
        where: { id: requestId, agentId },
      });
      if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (w.status !== 'PENDING') {
        throw new ConflictException('فقط درخواست در انتظار بررسی قابل لغو است');
      }
      await this.wallet.release(tx, agentId, d(w.amountRial));
      await tx.agentWithdrawalRequest.update({
        where: { id: w.id },
        data: { status: 'CANCELLED' },
      });
    }, TX_OPTIONS);
    return { message: 'درخواست برداشت لغو و مبلغ آزاد شد' };
  }

  async approveWithdrawal(requestId: string, adminId: string) {
    const res = await this.prisma.agentWithdrawalRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
    if (!res.count) {
      throw new ConflictException('درخواست یافت نشد یا قبلاً بررسی شده است');
    }
    return { message: 'برداشت تأیید شد و در صف پرداخت بانکی است' };
  }

  async rejectWithdrawal(requestId: string, reason: string, adminId: string) {
    const w = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_withdrawal_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const row = await tx.agentWithdrawalRequest.findUnique({
        where: { id: requestId },
        include: { agent: true },
      });
      if (!row) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (row.status !== 'PENDING' && row.status !== 'APPROVED') {
        throw new ConflictException('این درخواست قابل رد نیست');
      }
      await this.wallet.release(tx, row.agentId, d(row.amountRial));
      await tx.agentWithdrawalRequest.update({
        where: { id: row.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
      return row;
    }, TX_OPTIONS);
    this.notify(
      'AGENT_WALLET_REQUEST_REJECTED',
      w.agent,
      { requestNumber: w.requestNumber, reason: reason.trim() },
      { type: 'AGENT_WITHDRAWAL', id: w.id },
    );
    return { message: 'درخواست برداشت رد و مبلغ آزاد شد' };
  }

  /** ثبت پرداخت بانکی برداشت: کسر قطعی از کیف پول (و آزادسازی رزرو) + سند بد 2070 / بس 1010 */
  async payWithdrawal(
    requestId: string,
    bankReference: string,
    adminId: string,
  ) {
    const w = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_withdrawal_requests" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const row = await tx.agentWithdrawalRequest.findUnique({
        where: { id: requestId },
        include: { agent: true },
      });
      if (!row) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (row.status !== 'APPROVED') {
        throw new ConflictException('فقط برداشت تأییدشده قابل پرداخت است');
      }
      const amount = d(row.amountRial);
      const journal = await this.agentAccounting.journalWalletWithdrawal(tx, {
        agentTag: agentTag(row.agent.code),
        number: row.requestNumber,
        amountRial: amount,
      });
      await this.wallet.post(tx, {
        agentId: row.agentId,
        type: 'WITHDRAWAL',
        debitRial: amount,
        consumeBlockedRial: amount,
        description: `برداشت به حساب بانکی — مرجع ${bankReference.trim()}`,
        referenceType: 'AGENT_WITHDRAWAL',
        referenceId: row.id,
        referenceNumber: row.requestNumber,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });
      await tx.agentWithdrawalRequest.update({
        where: { id: row.id },
        data: {
          status: 'PAID',
          paidById: adminId,
          paidAt: new Date(),
          bankReference: bankReference.trim(),
          journalEntryId: journal.id,
        },
      });
      return row;
    }, TX_OPTIONS);
    this.notify(
      'AGENT_WITHDRAWAL_PAID',
      w.agent,
      {
        amount: toman(w.amountRial),
        requestNumber: w.requestNumber,
        bankRef: bankReference.trim(),
      },
      { type: 'AGENT_WITHDRAWAL', id: w.id },
    );
    return { message: 'پرداخت برداشت ثبت شد' };
  }

  async listWithdrawals(agentScope: string | null, query: TradingListQueryDto) {
    const agentId = agentScope ?? query.agentId;
    const range = dateRange(query.from, query.to);
    const where: Prisma.AgentWithdrawalRequestWhereInput = {
      ...(agentId ? { agentId } : {}),
      ...(query.status
        ? {
            status:
              query.status as Prisma.EnumAgentWithdrawalStatusFilter['equals'],
          }
        : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.agentWithdrawalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { agent: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.agentWithdrawalRequest.count({ where }),
      this.prisma.agentWithdrawalRequest.aggregate({
        where,
        _sum: { amountRial: true },
      }),
    ]);
    return {
      data: items.map((x) => ({
        ...x,
        statusLabel: WITHDRAWAL_STATUS_FA[x.status] ?? x.status,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      totalAmountRial: d(sum._sum.amountRial).toFixed(0),
    };
  }

  // ══════════════════════════════════════════
  // ── تسویه‌ی بدهی از کیف پول و اصلاحیه ──
  // ══════════════════════════════════════════

  /**
   * تسویه‌ی بدهی امانی/اعتباری نماینده از محل کیف پول: کسر از کیف پول، سند بد 2070 / بس 1040،
   * ردیف تسویه (روش WALLET، تأییدشده) و کاهش مانده‌ی بدهی در صورتحساب نماینده.
   */
  async settleDebtFromWallet(
    agentId: string,
    amountRial: number,
    actorId: string,
  ) {
    const agent = await this.agentOrThrow(agentId);
    const debt = d(agent.balanceRial);
    if (debt.lte(0))
      throw new ConflictException('بدهی‌ای برای تسویه وجود ندارد');
    const amount = Decimal.min(new Decimal(Math.round(amountRial)), debt);
    return this.prisma.$transaction(async (tx) => {
      const settlementNumber = await this.sequence.next(tx, 'AGP');
      const journal = await this.agentAccounting.journalWalletDebtSettlement(
        tx,
        {
          agentTag: agentTag(agent.code),
          number: settlementNumber,
          amountRial: amount,
        },
      );
      await this.wallet.post(tx, {
        agentId,
        type: 'DEBT_SETTLEMENT',
        debitRial: amount,
        description: `تسویه بدهی به شرکت — ${settlementNumber}`,
        referenceType: 'AGENT_SETTLEMENT',
        referenceNumber: settlementNumber,
        journalEntryId: journal.id,
        createdByAdminId: actorId,
      });
      const settlement = await tx.agentSettlement.create({
        data: {
          settlementNumber,
          agentId,
          amountRial: amount.toFixed(0),
          method: 'WALLET',
          paidAt: new Date(),
          status: 'APPROVED',
          submittedByAdminId: actorId,
          reviewedByAdminId: actorId,
          reviewedAt: new Date(),
          journalEntryId: journal.id,
          note: 'برداشت خودکار از کیف پول نماینده',
        },
      });
      await this.agentAccounting.postLedger(tx, {
        agentId,
        type: 'SETTLEMENT',
        creditRial: amount,
        description: 'تسویه از محل کیف پول نماینده',
        referenceType: 'AGENT_SETTLEMENT',
        referenceId: settlement.id,
        referenceNumber: settlementNumber,
        journalEntryId: journal.id,
        createdByAdminId: actorId,
      });
      return {
        message: `${toman(amount)} تومان از بدهی از محل کیف پول تسویه شد`,
        settlementNumber,
      };
    }, TX_OPTIONS);
  }

  async adjustWallet(
    agentId: string,
    dto: { direction: 'CREDIT' | 'DEBIT'; amountRial: number; reason: string },
    adminId: string,
  ) {
    const agent = await this.agentOrThrow(agentId);
    const amount = new Decimal(Math.round(dto.amountRial));
    return this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, 'AGJ');
      const journal = await this.agentAccounting.journalWalletAdjustment(tx, {
        agentTag: agentTag(agent.code),
        number,
        amountRial: amount,
        direction: dto.direction,
        reason: dto.reason.trim(),
      });
      const t = await this.wallet.post(tx, {
        agentId,
        type: 'ADJUSTMENT',
        creditRial: dto.direction === 'CREDIT' ? amount : undefined,
        debitRial: dto.direction === 'DEBIT' ? amount : undefined,
        description: `اصلاحیه: ${dto.reason.trim()}`,
        referenceType: 'AGENT_WALLET_ADJUSTMENT',
        referenceNumber: number,
        journalEntryId: journal.id,
        createdByAdminId: adminId,
      });
      return {
        message: 'اصلاحیه کیف پول ثبت شد',
        number,
        balanceAfterRial: t.balanceAfterRial.toString(),
      };
    }, TX_OPTIONS);
  }
}
