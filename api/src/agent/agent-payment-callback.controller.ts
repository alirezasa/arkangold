// api/src/agent/agent-payment-callback.controller.ts
//
// بازگشت از درگاه پرداخت برای واریز به کیف پول نماینده (و پرداخت سفارش متصل). مسیر عمومی
// است چون مرورگر از سایت بانک برمی‌گردد؛ اعتبار پرداخت فقط با استعلام مستقیم از درگاه
// (verifyPayment) تعیین می‌شود و پارامترهای بازگشتی به تنهایی مبنای هیچ اثری نیستند.
import { Controller, Get, Logger, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { AgentFundsService } from './agent-funds.service';

const AGENT_PANEL_BASE =
  process.env.AGENT_PANEL_PUBLIC_URL ||
  `https://${process.env.AGENT_PANEL_URL || 'panel.arkan.gold'}`;

@ApiExcludeController()
@Controller('agent-payments')
export class AgentPaymentCallbackController {
  private readonly logger = new Logger(AgentPaymentCallbackController.name);

  constructor(private readonly funds: AgentFundsService) {}

  @Get('callback/:provider')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const providerKey = provider.toUpperCase();
    if (providerKey !== 'ZARINPAL' && providerKey !== 'BEHPARDAKHT') {
      return res.redirect(
        `${AGENT_PANEL_BASE}/agent-portal/wallet?payment=failed`,
      );
    }
    const providerRef =
      providerKey === 'ZARINPAL' ? query['Authority'] : query['RefId'];
    try {
      const r = await this.funds.handleGatewayCallback(
        providerKey,
        String(providerRef ?? ''),
        query,
      );
      const target = r.purchaseOrderId
        ? `/agent-portal/purchase/${r.purchaseOrderId}`
        : '/agent-portal/wallet';
      return res.redirect(
        `${AGENT_PANEL_BASE}${target}?payment=${r.success ? 'success' : 'failed'}`,
      );
    } catch (err) {
      this.logger.error(
        `[AgentPayment] خطا در بازگشت از درگاه: ${(err as Error).message}`,
      );
      return res.redirect(
        `${AGENT_PANEL_BASE}/agent-portal/wallet?payment=failed`,
      );
    }
  }
}
