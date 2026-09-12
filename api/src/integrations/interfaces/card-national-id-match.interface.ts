/**
 * TODO: مشابه iban-national-id-match — منتظر مستندات دقیق سرویس «تطبیق شماره کارت و کد ملی»
 * فینوتک است. هیچ Endpoint/فیلدی حدس زده نشده.
 */
export interface CardNationalIdMatchInput {
  cardNumber: string;
  nationalCode: string;
}

export interface CardNationalIdMatchResult {
  matched: boolean;
  reason?: string;
  ownerName?: string;
  providerRequestId?: string;
}

export interface CardNationalIdMatchProvider {
  readonly providerCode: string;
  match(input: CardNationalIdMatchInput): Promise<CardNationalIdMatchResult>;
}
