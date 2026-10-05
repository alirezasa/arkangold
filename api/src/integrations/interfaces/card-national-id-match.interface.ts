/**
 * تطبیق شماره کارت و کد ملی
 * (فینوتک: POST /kyc/v2/clients/{clientId}/cardOwnerVerification — body {card, nid})
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
  /** توسط CardNationalIdMatchService پر می‌شود */
  verifiedByProvider?: string;
}

export interface CardNationalIdMatchProvider {
  readonly providerCode: string;
  match(input: CardNationalIdMatchInput): Promise<CardNationalIdMatchResult>;
}
