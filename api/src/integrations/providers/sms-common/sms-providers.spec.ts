// قرارداد درخواست/پاسخ Adapterهای قاصدک و sms.ir (axios ماک می‌شود؛ هیچ درخواست واقعی ارسال نمی‌شود)
import axios from 'axios';
import { GhasedakSmsProvider } from '../ghasedak/ghasedak-sms.provider';
import { SmsIrSmsProvider } from '../smsir/smsir-sms.provider';
import { ProviderCredentialService } from '../../credentials/provider-credential.service';
import {
  AuthenticationError,
  BusinessRejectionError,
  ConfigurationError,
  ProviderError,
} from '../../errors/integration-error';
import { isLiveSmsAllowed, normalizeIranMobile } from './sms-live.util';

jest.mock('axios');
// eslint-disable-next-line @typescript-eslint/unbound-method
const request = axios.request as jest.Mock;

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  data: Record<string, unknown>;
}
const lastCall = (): CapturedRequest =>
  (request.mock.calls as CapturedRequest[][])[0][0];

const creds = (values: Record<string, string>) =>
  ({
    getCredential: jest.fn((_p: string, k: string) =>
      values[k] !== undefined
        ? Promise.resolve(values[k])
        : Promise.reject(new Error('missing')),
    ),
  }) as unknown as ProviderCredentialService;

describe('sms-live.util', () => {
  it('ارسال واقعی فقط در production یا با SMS_LIVE_SEND=true', () => {
    expect(isLiveSmsAllowed({ NODE_ENV: 'production' })).toBe(true);
    expect(
      isLiveSmsAllowed({ NODE_ENV: 'production', SMS_LIVE_SEND: 'false' }),
    ).toBe(false);
    expect(isLiveSmsAllowed({ NODE_ENV: 'development' })).toBe(false);
    expect(
      isLiveSmsAllowed({ NODE_ENV: 'development', SMS_LIVE_SEND: 'true' }),
    ).toBe(true);
  });

  it('نرمال‌سازی شماره موبایل', () => {
    expect(normalizeIranMobile('+98 912 123 4567')).toBe('09121234567');
    expect(normalizeIranMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(normalizeIranMobile('9121234567')).toBe('09121234567');
    expect(normalizeIranMobile('00989121234567')).toBe('09121234567');
    expect(normalizeIranMobile('02112345678')).toBeNull();
  });
});

describe('Adapterهای پیامک', () => {
  const env = process.env.NODE_ENV;
  beforeEach(() => {
    request.mockReset();
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_LIVE_SEND;
  });
  afterAll(() => {
    process.env.NODE_ENV = env;
  });

  describe('قاصدک', () => {
    const provider = new GhasedakSmsProvider(
      creds({ API_KEY: 'gk', LINE_NUMBER: '30005006009009' }),
    );

    it('ارسال متن آزاد با SendSingleSMS و هدر ApiKey', async () => {
      request.mockResolvedValue({
        status: 200,
        data: {
          isSuccess: true,
          statusCode: 200,
          message: 'ok',
          data: { messageId: '777', cost: 1200 },
        },
      });
      const res = await provider.send({
        phone: '+989121234567',
        text: 'سلام',
        clientReferenceId: 'ref-1',
      });
      expect(res).toEqual({ sent: true, providerRequestId: '777', cost: 1200 });
      const cfg = lastCall();
      expect(cfg.method).toBe('POST');
      expect(cfg.url).toBe(
        'https://gateway.ghasedak.me/rest/api/v1/WebService/SendSingleSMS',
      );
      expect(cfg.headers.ApiKey).toBe('gk');
      expect(cfg.data).toEqual({
        lineNumber: '30005006009009',
        receptor: '09121234567',
        message: 'سلام',
        clientReferenceId: 'ref-1',
        udh: false,
      });
    });

    it('ارسال با قالب OTP (SendOtpSMS)', async () => {
      request.mockResolvedValue({
        status: 200,
        data: {
          isSuccess: true,
          statusCode: 200,
          data: { totalCost: 900, items: [{ messageId: '888' }] },
        },
      });
      const res = await provider.send({
        phone: '09121234567',
        text: 'کد: 1234',
        pattern: {
          ghasedakTemplateName: 'otp',
          params: [{ name: 'code', value: '1234' }],
        },
      });
      expect(res.providerRequestId).toBe('888');
      const cfg = lastCall();
      expect(cfg.url).toMatch(/\/SendOtpSMS$/);
      expect(cfg.data).toMatchObject({
        templateName: 'otp',
        receptors: [{ mobile: '09121234567' }],
        inputs: [{ param: 'code', value: '1234' }],
      });
    });

    it('isSuccess=false → BusinessRejectionError با پیام سامانه', async () => {
      request.mockResolvedValue({
        status: 200,
        data: {
          isSuccess: false,
          statusCode: 418,
          message: 'اعتبار کافی نیست',
        },
      });
      await expect(
        provider.send({ phone: '09121234567', text: 'x' }),
      ).rejects.toBeInstanceOf(BusinessRejectionError);
    });

    it('HTTP 401 → AuthenticationError و 503 → ProviderError (قابل Fallback)', async () => {
      request.mockResolvedValueOnce({
        status: 401,
        data: { isSuccess: false, message: 'invalid key' },
      });
      await expect(
        provider.send({ phone: '09121234567', text: 'x' }),
      ).rejects.toBeInstanceOf(AuthenticationError);
      request.mockResolvedValueOnce({ status: 503, data: '' });
      const err = await provider
        .send({ phone: '09121234567', text: 'x' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).retryable).toBe(true);
    });

    it('در محیط غیرعملیاتی هیچ درخواستی ارسال نمی‌شود', async () => {
      process.env.NODE_ENV = 'development';
      const res = await provider.send({ phone: '09121234567', text: 'x' });
      expect(res.dryRun).toBe(true);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('sms.ir', () => {
    const provider = new SmsIrSmsProvider(
      creds({ API_KEY: 'sk', LINE_NUMBER: '30007732000000' }),
    );

    it('ارسال متن آزاد با send/bulk و هدر X-API-KEY', async () => {
      request.mockResolvedValue({
        status: 200,
        data: {
          status: 1,
          message: 'موفق',
          data: { packId: 'p1', messageIds: [9001], cost: 1 },
        },
      });
      const res = await provider.send({ phone: '09121234567', text: 'سلام' });
      expect(res).toEqual({ sent: true, providerRequestId: '9001', cost: 1 });
      const cfg = lastCall();
      expect(cfg.url).toBe('https://api.sms.ir/v1/send/bulk');
      expect(cfg.headers['X-API-KEY']).toBe('sk');
      expect(cfg.data).toEqual({
        lineNumber: 30007732000000,
        messageText: 'سلام',
        mobiles: ['09121234567'],
        sendDateTime: null,
      });
    });

    it('ارسال با قالب Verify', async () => {
      request.mockResolvedValue({
        status: 200,
        data: { status: 1, data: { messageId: 55, cost: 1 } },
      });
      await provider.send({
        phone: '09121234567',
        text: 'x',
        pattern: {
          smsirTemplateId: '123456',
          params: [{ name: 'code', value: '4321' }],
        },
      });
      const cfg = lastCall();
      expect(cfg.url).toBe('https://api.sms.ir/v1/send/verify');
      expect(cfg.data).toEqual({
        mobile: '09121234567',
        templateId: 123456,
        parameters: [{ name: 'code', value: '4321' }],
      });
    });

    it('کد وضعیت غیر ۱ (مثلاً ۱۰۲ اعتبار ناکافی) → BusinessRejectionError', async () => {
      request.mockResolvedValue({
        status: 400,
        data: { status: 102, message: '', data: null },
      });
      await expect(
        provider.send({ phone: '09121234567', text: 'x' }),
      ).rejects.toThrow('اعتبار کافی نیست');
    });

    it('اعتبار و خطوط حساب', async () => {
      request
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 1, data: 4520.5 },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 1, data: [30007732000000] },
        });
      const info = await provider.getAccountInfo();
      expect(info).toEqual({
        credit: 4520.5,
        creditUnit: 'پیامک',
        lines: ['30007732000000'],
      });
    });

    it('بدون کلید API → ConfigurationError', async () => {
      const p = new SmsIrSmsProvider(creds({}));
      await expect(
        p.send({ phone: '09121234567', text: 'x' }),
      ).rejects.toBeInstanceOf(ConfigurationError);
    });
  });
});
