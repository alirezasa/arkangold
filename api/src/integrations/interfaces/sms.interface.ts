/**
 * TODO: منتظر مستندات Provider پیامک (Company PO در سند اولیه) است. هیچ Endpoint/فیلدی حدس زده نشده.
 */
export interface SendSmsInput {
  phone: string;
  text: string;
}

export interface SendSmsResult {
  sent: boolean;
  providerRequestId?: string;
}

export interface SmsProvider {
  readonly providerCode: string;
  send(input: SendSmsInput): Promise<SendSmsResult>;
}
