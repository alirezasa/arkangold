import { BankAccountInquiryService } from './bank-account-inquiry.service';
import { BankInquiryService } from './bank-inquiry.service';
import {
  CardNationalIdMatchService,
  CardToIbanService,
} from '../integrations/services/kyc-inquiry.services';
import { MockCardToIbanProvider } from '../integrations/providers/mock/mock-kyc-inquiry.providers';
import { isValidIranIban } from '../common/utils/iban.util';
import {
  ConfigurationError,
  ConnectionError,
} from '../integrations/errors/integration-error';

const CARD = '6037991234567893';
const NID = '0012345679';
const VALID_IBAN = 'IR062960000000100324200001';

function build(
  owner: () => Promise<unknown>,
  iban: () => Promise<unknown>,
): BankAccountInquiryService {
  const cardOwner = {
    match: jest.fn(owner),
  } as unknown as CardNationalIdMatchService;
  const cardToIban = { convert: jest.fn(iban) } as unknown as CardToIbanService;
  return new BankAccountInquiryService(
    cardOwner,
    cardToIban,
    new BankInquiryService(),
  );
}

const ibanOk =
  (depositStatus = '02') =>
  () =>
    Promise.resolve({
      found: true,
      iban: VALID_IBAN,
      bankName: 'ملی',
      deposit: '10.6423499.1',
      depositStatus,
      depositOwners: 'علی رضایی',
      verifiedByProvider: 'FINOTECH',
      providerRequestId: 'trk',
    });

describe('BankAccountInquiryService', () => {
  it('کارت متعلق به کاربر + شبای فعال → VERIFIED و تکمیل اطلاعات حساب', async () => {
    const svc = build(() => Promise.resolve({ matched: true }), ibanOk());
    const out = await svc.inquire(CARD, NID);
    expect(out.kind).toBe('VERIFIED');
    expect(out.data).toMatchObject({
      cardOwnerMatched: true,
      sheba: VALID_IBAN,
      accountNumber: '10.6423499.1',
      bankName: 'بانک ملی',
      ownerName: 'علی رضایی',
      depositStatus: '02',
    });
  });

  it('کارت به نام کاربر نیست → OWNER_MISMATCH و شبا استعلام نمی‌شود', async () => {
    const iban = jest.fn();
    const svc = build(() => Promise.resolve({ matched: false }), iban);
    const out = await svc.inquire(CARD, NID);
    expect(out.kind).toBe('OWNER_MISMATCH');
    expect(iban).not.toHaveBeenCalled();
  });

  it.each(['04', '05'])(
    'حساب با وضعیت %s امکان واریز ندارد → ACCOUNT_BLOCKED',
    async (status) => {
      const svc = build(
        () => Promise.resolve({ matched: true }),
        ibanOk(status),
      );
      expect((await svc.inquire(CARD, NID)).kind).toBe('ACCOUNT_BLOCKED');
    },
  );

  it('حساب مسدود با قابلیت واریز (03) پذیرفته می‌شود', async () => {
    const svc = build(() => Promise.resolve({ matched: true }), ibanOk('03'));
    expect((await svc.inquire(CARD, NID)).kind).toBe('VERIFIED');
  });

  it('وضعیت نامشخص بانک (06) → PENDING برای بررسی کارشناس', async () => {
    const svc = build(() => Promise.resolve({ matched: true }), ibanOk('06'));
    expect((await svc.inquire(CARD, NID)).kind).toBe('PENDING');
  });

  it('قطعی یا غیرفعال بودن سرویس تطبیق کارت → PENDING (رد نمی‌شود)', async () => {
    for (const err of [
      new ConnectionError('down'),
      new ConfigurationError('disabled'),
    ]) {
      const svc = build(() => Promise.reject(err), ibanOk());
      const out = await svc.inquire(CARD, NID);
      expect(out.kind).toBe('PENDING');
      expect(out.data.cardOwnerMatched).toBeNull();
    }
  });

  it('مالکیت تأیید ولی شبا دریافت نشد → PENDING با حفظ نتیجه‌ی تطبیق', async () => {
    const svc = build(
      () => Promise.resolve({ matched: true }),
      () => Promise.reject(new ConnectionError('down')),
    );
    const out = await svc.inquire(CARD, NID);
    expect(out.kind).toBe('PENDING');
    expect(out.data.cardOwnerMatched).toBe(true);
  });

  it('شبای نامعتبر از Provider پذیرفته نمی‌شود', async () => {
    const svc = build(
      () => Promise.resolve({ matched: true }),
      () =>
        Promise.resolve({ found: true, iban: 'IR000000000000000000000000' }),
    );
    expect((await svc.inquire(CARD, NID)).kind).toBe('PENDING');
  });
});

describe('iban util / mock card-to-iban', () => {
  it('رقم کنترل شبا را بررسی می‌کند', () => {
    expect(isValidIranIban(VALID_IBAN)).toBe(true);
    expect(isValidIranIban('IR072960000000100324200001')).toBe(false);
  });

  it('شبای ساختگی Mock معتبر است', async () => {
    const res = await new MockCardToIbanProvider().convert({
      cardNumber: CARD,
    });
    expect(res.iban && isValidIranIban(res.iban)).toBe(true);
  });
});
