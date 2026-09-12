/**
 * TODO: منتظر مستندات دقیق سرویس «استعلام اطلاعات شرکت» است. هیچ Endpoint/فیلدی حدس زده نشده.
 * توجه: پروژه از قبل مدل LegalProfile را دارد (companyName, nationalId, economicCode,
 * registrationNumber) — خروجی این سرویس باید نهایتاً به همان ساختار Map شود.
 */
export interface CompanyInquiryInput {
  companyNationalId: string;
}

export interface CompanyInquiryResult {
  found: boolean;
  companyName?: string;
  registrationNumber?: string;
  economicCode?: string;
  status?: string;
  providerRequestId?: string;
}

export interface CompanyInquiryProvider {
  readonly providerCode: string;
  inquire(input: CompanyInquiryInput): Promise<CompanyInquiryResult>;
}
