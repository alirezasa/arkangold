// api/src/agent/agent-order-payment.service.ts
//
// پرداخت سفارش خرید شمش نماینده از محل کیف پول ریالی — نقطه‌ی مشترک سه مسیر پرداخت:
//   ۱) پرداخت مستقیم از کیف پول
//   ۲) درگاه پرداخت: وجه ابتدا به کیف پول واریز و بلافاصله سفارش از کیف پول پرداخت می‌شود
//   ۳) واریز بانکی/حساب به حساب: پس از تأیید مالی، به کیف پول واریز و سفارش پرداخت می‌شود
// به این ترتیب ورود وجه همیشه از یک مسیر (کیف پول ← حساب 2070) ثبت و ردیابی می‌شود.
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { AgentAccountingService, agentTag } from './agent-accounting.service';
import { AgentWalletService } from './agent-wallet.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class AgentOrderPaymentService {
  private readonly logger = new Logger(AgentOrderPaymentService.name);

  constructor(
    private readonly wallet: AgentWalletService,
    private readonly agentAccounting: AgentAccountingService,
  ) {}

  /**
   * پیش‌بررسی قابل پرداخت بودن سفارش (داخل همان تراکنش) — برای مسیرهایی که وجه واقعاً
   * دریافت شده (درگاه/واریز تأییدشده) و نباید شکست پرداخت سفارش، ثبت واریز را برگرداند.
   */
  async isPayable(
    tx: Tx,
    orderId: string,
    opts: { allowAfterLock?: boolean } = {},
  ): Promise<{ ok: boolean; reason?: string }> {
    const order = await tx.agentPurchaseOrder.findUnique({
      where: { id: orderId },
      include: { agent: { select: { status: true } } },
    });
    if (!order) return { ok: false, reason: 'سفارش یافت نشد' };
    if (
      order.status !== 'PENDING_PAYMENT' &&
      order.status !== 'PAYMENT_REVIEW'
    ) {
      return { ok: false, reason: 'سفارش در وضعیت قابل پرداخت نیست' };
    }
    if (
      order.status === 'PENDING_PAYMENT' &&
      !opts.allowAfterLock &&
      order.priceLockedUntil < new Date()
    ) {
      return { ok: false, reason: 'مهلت اعتبار قیمت سفارش گذشته است' };
    }
    if (order.agent.status !== 'ACTIVE') {
      return { ok: false, reason: 'حساب نمایندگی فعال نیست' };
    }
    const wallet = await this.wallet.lockWallet(tx, order.agentId);
    const available = new Decimal(wallet.balanceRial.toString()).minus(
      wallet.blockedRial.toString(),
    );
    if (available.lessThan(order.totalRial.toString())) {
      return {
        ok: false,
        reason: 'موجودی کیف پول برای پرداخت سفارش کافی نیست',
      };
    }
    return { ok: true };
  }

  /**
   * پرداخت سفارش از کیف پول. سفارش در انتظار پرداخت فقط تا پایان مهلت قفل قیمت قابل پرداخت
   * است؛ سفارشی که مشخصات واریز بانکی‌اش در مهلت ثبت شده (PAYMENT_REVIEW) با تأیید مالی پس
   * از مهلت هم پرداخت می‌شود چون نماینده تعهد پرداخت را در مهلت انجام داده است.
   */
  async payFromWallet(
    tx: Tx,
    orderId: string,
    actorAdminId: string | null,
    opts: { allowAfterLock?: boolean } = {},
  ) {
    await tx.$executeRaw`SELECT 1 FROM "agent_purchase_orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.agentPurchaseOrder.findUnique({
      where: { id: orderId },
      include: { agent: { select: { code: true, status: true } } },
    });
    if (!order) throw new NotFoundException('سفارش خرید یافت نشد');
    if (order.status === 'PAID' || order.status === 'APPROVED') return order;
    if (
      order.status !== 'PENDING_PAYMENT' &&
      order.status !== 'PAYMENT_REVIEW'
    ) {
      throw new ConflictException('این سفارش در وضعیت قابل پرداخت نیست');
    }
    if (
      order.status === 'PENDING_PAYMENT' &&
      !opts.allowAfterLock &&
      order.priceLockedUntil < new Date()
    ) {
      throw new ConflictException(
        'مهلت اعتبار قیمت این سفارش به پایان رسیده است؛ سفارش جدید ثبت کنید',
      );
    }
    if (order.agent.status !== 'ACTIVE') {
      throw new ConflictException('حساب نمایندگی فعال نیست');
    }

    const amount = new Decimal(order.totalRial.toString());
    const journal = await this.agentAccounting.journalOrderPayment(tx, {
      agentTag: agentTag(order.agent.code),
      orderNumber: order.orderNumber,
      amountRial: amount,
    });
    await this.wallet.post(tx, {
      agentId: order.agentId,
      type: 'PURCHASE',
      debitRial: amount,
      description: `پرداخت سفارش خرید شمش ${order.orderNumber}`,
      referenceType: 'AGENT_PURCHASE',
      referenceId: order.id,
      referenceNumber: order.orderNumber,
      journalEntryId: journal.id,
      createdByAdminId: actorAdminId,
    });
    const updated = await tx.agentPurchaseOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentJournalId: journal.id,
      },
    });
    this.logger.log(
      `[AgentOrder] سفارش ${order.orderNumber} از کیف پول نماینده ${order.agent.code} پرداخت شد`,
    );
    return updated;
  }
}
