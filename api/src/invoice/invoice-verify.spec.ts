// استعلام عمومی فاکتور از روی QR (بدون ورود): لینک QR، توکن و سطح اطلاعات قابل نمایش
import { InvoiceService } from './invoice.service';

const invoice = {
  id: '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b',
  invoiceNumber: 'AG-1405-INV-000123',
  kind: 'INVOICE',
  status: 'PAID',
  issuedAt: new Date('2026-10-20T08:00:00Z'),
  expiresAt: null,
  cancelledAt: null,
  contentHash: 'a'.repeat(64),
  companySnapshot: { legalName: 'شرکت آرکان گلد' },
};

function setup() {
  const prisma = {
    invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
  };
  const service = new InvoiceService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const fullDoc = {
    id: invoice.id,
    customer: {
      displayName: 'علی رضایی',
      nationalId: '0012345678',
      phone: '09121234567',
    },
    totalRial: '650000000',
  };
  jest.spyOn(service, 'getDocument').mockResolvedValue(fullDoc as never);
  return { service, prisma };
}

const token = InvoiceService.verifyToken(invoice.id, invoice.contentHash);

describe('لینک QR استعلام فاکتور', () => {
  it('به‌طور پیش‌فرض به صفحه‌ی عمومی اپلیکیشن اشاره می‌کند', () => {
    expect(
      InvoiceService.buildVerifyUrl('', invoice.invoiceNumber, token),
    ).toBe(
      `https://app.arkan.gold/verifyInvoice?n=AG-1405-INV-000123&t=${token}`,
    );
  });

  it('توکن برای هر سند ثابت و غیرقابل حدس از شماره‌ی سند است', () => {
    expect(token).toHaveLength(24);
    expect(InvoiceService.verifyToken(invoice.id, invoice.contentHash)).toBe(
      token,
    );
    expect(
      InvoiceService.verifyToken(
        '00000000-0000-4000-8000-000000000000',
        invoice.contentHash,
      ),
    ).not.toBe(token);
  });
});

describe('InvoiceService.verifyPublic', () => {
  it('با توکن QR متن کامل سند را با پوشاندن کد ملی و موبایل برمی‌گرداند', async () => {
    const { service } = setup();
    const r = await service.verifyPublic(invoice.invoiceNumber, token);
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.document).not.toBeNull();
    expect(r.document?.totalRial).toBe('650000000');
    expect(r.document?.id).toBe('');
    expect(r.document?.customer.nationalId).toBe('001*****78');
    expect(r.document?.customer.phone).toBe('0912****567');
  });

  it('بدون توکن فقط اصالت و وضعیت سند تأیید می‌شود', async () => {
    const { service } = setup();
    const r = await service.verifyPublic('ag-۱۴۰۵-inv-۰۰۰۱۲۳');
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.document).toBeNull();
    expect(r.tokenProvided).toBe(false);
    expect(r.issuerLegalName).toBe('شرکت آرکان گلد');
  });

  it('توکن نادرست متن سند را فاش نمی‌کند', async () => {
    const { service } = setup();
    const r = await service.verifyPublic(invoice.invoiceNumber, 'b'.repeat(24));
    expect(r.valid && r.document).toBe(null);
  });

  it('شماره‌ی نامعتبر بدون کوئری رد می‌شود', async () => {
    const { service, prisma } = setup();
    const r = await service.verifyPublic('<script>');
    expect(r.valid).toBe(false);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });
});
