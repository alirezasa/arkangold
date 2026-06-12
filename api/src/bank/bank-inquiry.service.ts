import { Injectable, Logger } from '@nestjs/common';

export interface BankInquiryResult {
  success: boolean;
  ownerName?: string;
  ownerNationalCode?: string;
  bankName?: string;
  reason?: string;
}

@Injectable()
export class BankInquiryService {
  private readonly logger = new Logger(BankInquiryService.name);

  async inquiryByCard(
    cardNumber: string,
    nationalCode: string,
  ): Promise<BankInquiryResult> {
    this.logger.log(`[BankInquiry] استعلام کارت: ${this.maskCard(cardNumber)}`);

    // TODO: اتصال به وب‌سرویس بانک مرکزی / شاپرک
    // const client = await soap.createClientAsync(process.env.BANK_INQUIRY_WSDL);
    // const result = await client.CardInquiryAsync({ cardNumber, nationalCode });

    // شبیه‌سازی تاخیر شبکه
    await this.delay(400);

    // Mock: فعلاً موفق برمی‌گردونه
    return {
      success: true,
      ownerName: 'در انتظار استعلام',
      ownerNationalCode: nationalCode,
      bankName: this.detectBankByCard(cardNumber),
    };
  }

  async inquiryBySheba(sheba: string): Promise<BankInquiryResult> {
    this.logger.log(`[BankInquiry] استعلام شبا: ${this.maskSheba(sheba)}`);

    await this.delay(400);

    return {
      success: true,
      ownerName: 'در انتظار استعلام',
      bankName: this.detectBankBySheba(sheba),
    };
  }

  // تشخیص بانک از روی ۶ رقم اول کارت (BIN)
  detectBankByCard(cardNumber: string): string {
    const bin = cardNumber.substring(0, 6);
    const banks: Record<string, string> = {
      '603799': 'بانک ملی',
      '589210': 'بانک سپه',
      '627648': 'بانک توسعه صادرات',
      '207177': 'بانک توسعه صادرات',
      '636214': 'بانک آینده',
      '627412': 'بانک اقتصاد نوین',
      '622106': 'بانک پارسیان',
      '639194': 'بانک پارسیان',
      '627884': 'بانک پارسیان',
      '639599': 'بانک قوامین',
      '504172': 'بانک رسالت',
      '627374': 'بانک اصفهان',
      '603770': 'بانک کشاورزی',
      '639217': 'بانک کشاورزی',
      '628023': 'بانک مسکن',
      '627760': 'بانک پست‌بانک',
      '502908': 'بانک توسعه تعاون',
      '627353': 'بانک تجارت',
      '585983': 'بانک تجارت',
      '636795': 'بانک مرکزی',
      '610433': 'بانک ملت',
      '991975': 'بانک ملت',
      '603684': 'بانک رفاه',
      '589463': 'بانک رفاه',
      '621986': 'بانک سامان',
      '639346': 'بانک سینا',
      '639607': 'بانک سرمایه',
      '502806': 'بانک شهر',
      '504706': 'بانک شهر',
      '603769': 'بانک صادرات',
      '610343': 'بانک صادرات',
      '627381': 'بانک انصار',
      '639370': 'بانک مهر اقتصاد',
      '606373': 'بانک مهر اقتصاد',
      '627488': 'بانک کارآفرین',
      '502910': 'بانک کارآفرین',
      '507677': 'بانک ایران زمین',
      '505785': 'بانک ایران زمین',
      '636949': 'بانک حکمت ایرانیان',
      '628157': 'بانک توسعه شهری',
      '505416': 'بانک گردشگری',
    };
    return banks[bin] || 'بانک نامشخص';
  }

  detectBankBySheba(sheba: string): string {
    // ۲ رقم بعد از IR = کد بانک
    const bankCode = sheba.substring(4, 7);
    const banks: Record<string, string> = {
      '017': 'بانک ملی',
      '015': 'بانک سپه',
      '054': 'بانک آینده',
      '012': 'بانک ملت',
      '013': 'بانک رفاه',
      '014': 'بانک مسکن',
      '016': 'بانک صادرات',
      '018': 'بانک تجارت',
      '019': 'بانک صنعت و معدن',
      '020': 'بانک توسعه صادرات',
      '021': 'بانک پست‌بانک',
      '022': 'بانک توسعه تعاون',
      '051': 'بانک توسعه تعاون',
      '055': 'بانک اقتصاد نوین',
      '057': 'بانک پارسیان',
      '058': 'بانک سرمایه',
      '059': 'بانک سینا',
      '061': 'بانک شهر',
      '062': 'بانک آینده',
      '063': 'بانک انصار',
      '064': 'بانک گردشگری',
      '065': 'بانک حکمت ایرانیان',
      '066': 'بانک دی',
      '069': 'بانک ایران زمین',
      '070': 'بانک رسالت',
      '073': 'بانک کارآفرین',
      '075': 'بانک سامان',
      '078': 'بانک تات',
      '080': 'بانک نور',
      '083': 'بانک قوامین',
      '089': 'بانک مهر اقتصاد',
    };
    return banks[bankCode] || 'بانک نامشخص';
  }

  maskCard(cardNumber: string): string {
    return cardNumber.replace(/(\d{4})(\d{8})(\d{4})/, '$1-****-****-$3');
  }

  maskSheba(sheba: string): string {
    return sheba.substring(0, 6) + '****' + sheba.substring(sheba.length - 4);
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
