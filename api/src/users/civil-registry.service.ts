import { Injectable, Logger } from '@nestjs/common';

export interface CivilRegistryResult {
  matched: boolean;
  reason?: string;
}

/**
 * سرویس وب‌سرویس ثبت احوال
 * در محیط واقعی باید با SOAP/REST ثبت احوال کشور ارتباط برقرار کند.
 * فعلاً یک mock هوشمند پیاده‌سازی شده است.
 */
@Injectable()
export class CivilRegistryService {
  private readonly logger = new Logger(CivilRegistryService.name);

  async verify(
    nationalCode: string,
    firstName: string,
    lastName: string,
    birthDate: string,
  ): Promise<CivilRegistryResult> {
    this.logger.log(
      `[ثبت‌احوال] استعلام: ${nationalCode} - ${firstName} ${lastName} ${birthDate}`,
    );

    // اعتبارسنجی کد ملی با الگوریتم checksum
    if (!this.isValidNationalCode(nationalCode)) {
      return { matched: false, reason: 'کد ملی از نظر الگوریتمی نامعتبر است' };
    }

    // TODO: فراخوانی واقعی وب‌سرویس ثبت احوال
    // const soapClient = await soap.createClientAsync(process.env.CIVIL_REGISTRY_WSDL);
    // const result = await soapClient.InquiryAsync({ ... });

    // Mock: فرض می‌کنیم همیشه تطابق دارد (در محیط واقعی حذف شود)
    await this.delay(300); // شبیه‌سازی تاخیر شبکه
    return { matched: true };
  }

  /**
   * اعتبارسنجی کد ملی ایرانی با الگوریتم checksum
   */
  private isValidNationalCode(code: string): boolean {
    if (!/^\d{10}$/.test(code)) return false;
    if (/^(\d)\1{9}$/.test(code)) return false; // مثل 1111111111

    const digits = code.split('').map(Number);
    const check = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
