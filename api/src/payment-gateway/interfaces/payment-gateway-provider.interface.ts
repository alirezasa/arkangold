export interface PaymentRequestParams {
  amountRial: string; // به‌صورت رشته برای جلوگیری از خطای دقت اعشار
  orderId: string;
  userId: string;
  description: string;
  callbackUrl: string;
}

export interface PaymentRequestResult {
  redirectUrl: string;
  providerRef: string; // authority زرین‌پال یا RefId ملت
}

export interface PaymentVerifyParams {
  providerRef: string;
  amountRial: string;
  callbackQuery: Record<string, string>;
}

export interface PaymentVerifyResult {
  success: boolean;
  trackingCode?: string;
  failureReason?: string;
  rawResponse: unknown;
}

export interface PaymentRefundParams {
  providerRef: string;
  amountRial: string;
}

export interface PaymentRefundResult {
  success: boolean;
  rawResponse: unknown;
}

export interface PaymentGatewayProvider {
  readonly key: 'ZARINPAL' | 'BEHPARDAKHT';
  isEnabled(): Promise<boolean>;
  requestPayment(params: PaymentRequestParams): Promise<PaymentRequestResult>;
  verifyPayment(params: PaymentVerifyParams): Promise<PaymentVerifyResult>;
  refundPayment(params: PaymentRefundParams): Promise<PaymentRefundResult>;
}
