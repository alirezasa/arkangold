// api/src/partners/providers/not-configured.provider.ts
import { ServiceUnavailableException } from '@nestjs/common';
import {
  InstallmentCreateResult,
  InstallmentProvider,
  InstallmentSettlementRow,
  InstallmentVerifyResult,
} from './installment-provider.interface';

/**
 * آداپتور پایه برای شرکایی که هنوز مستندات/کلید API آن‌ها دریافت نشده است.
 * تا زمان پیاده‌سازی، سفارش‌های این شریک از پنل مدیریت یا API عمومی شرکا
 * (partner-api) ثبت و تأیید می‌شوند و تمام اسناد مالی به‌صورت کامل صادر می‌شود.
 */
export abstract class NotConfiguredInstallmentProvider implements InstallmentProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;

  isConfigured(): boolean {
    return false;
  }

  private fail(): never {
    throw new ServiceUnavailableException(
      `اتصال مستقیم به ${this.displayName} هنوز فعال نشده است؛ سفارش را از پنل یا API شرکا ثبت کنید`,
    );
  }

  create(): Promise<InstallmentCreateResult> {
    return Promise.resolve(this.fail());
  }
  verify(): Promise<InstallmentVerifyResult> {
    return Promise.resolve(this.fail());
  }
  cancel(): Promise<void> {
    return Promise.resolve(this.fail());
  }
  settlements(): Promise<InstallmentSettlementRow[]> {
    return Promise.resolve(this.fail());
  }
}

export class SnappPayProvider extends NotConfiguredInstallmentProvider {
  readonly key = 'SNAPPPAY';
  readonly displayName = 'اسنپ‌پی';
}

export class DigiPayProvider extends NotConfiguredInstallmentProvider {
  readonly key = 'DIGIPAY';
  readonly displayName = 'دیجی‌پی';
}

export class TaraProvider extends NotConfiguredInstallmentProvider {
  readonly key = 'TARA';
  readonly displayName = 'تارا';
}

export class LendoProvider extends NotConfiguredInstallmentProvider {
  readonly key = 'LENDO';
  readonly displayName = 'لندو';
}

export const INSTALLMENT_PROVIDERS: InstallmentProvider[] = [
  new SnappPayProvider(),
  new DigiPayProvider(),
  new TaraProvider(),
  new LendoProvider(),
];
