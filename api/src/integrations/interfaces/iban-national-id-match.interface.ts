/**
 * TODO: این Contract باید بر اساس مستندات واقعی سرویس «تطبیق شماره شبا و کد ملی»
 * فینوتک تکمیل/تطبیق شود. فعلاً چون آن مستندات ارائه نشده، هیچ Endpoint یا فیلد
 * پاسخی حدس زده نشده — فقط ساختار عمومی (مطابق الگوی identity-verification) تعریف شده
 * تا وقتی مستندات رسید، فقط کافی است یک Adapter مثل FinotechIbanMatchProvider نوشته
 * و در IbanNationalIdMatchService (که باید مشابه IdentityVerificationService ساخته شود) رجیستر شود.
 */
export interface IbanNationalIdMatchInput {
  iban: string;
  nationalCode: string;
}

export interface IbanNationalIdMatchResult {
  matched: boolean;
  reason?: string;
  ownerName?: string;
  providerRequestId?: string;
}

export interface IbanNationalIdMatchProvider {
  readonly providerCode: string;
  match(input: IbanNationalIdMatchInput): Promise<IbanNationalIdMatchResult>;
}
