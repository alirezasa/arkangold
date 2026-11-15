// api/src/zarpayesh/zarpayesh-approve-code.spec.ts
//
// approveCode متد SetDeliveries (long، الزامی برای وضعیت ۱) و حذف آن از لاگ فراخوانی‌ها.
import { normalizeApproveCode } from './zarpayesh.constants';
import { sanitizeForLog } from './zarpayesh-api-log.service';

describe('approveCode (SetDeliveries)', () => {
  it('ارقام فارسی/عربی و فاصله نرمال می‌شوند', () => {
    expect(normalizeApproveCode('۷۳۱ ۰۴۲')).toBe('731042');
    expect(normalizeApproveCode('٧٣١٠٤٢')).toBe('731042');
    expect(normalizeApproveCode(' 0012 ')).toBe('12');
  });

  it('صفر، خالی، غیرعددی و خارج از long نامعتبر است', () => {
    expect(normalizeApproveCode('0')).toBeNull();
    expect(normalizeApproveCode('000')).toBeNull();
    expect(normalizeApproveCode('')).toBeNull();
    expect(normalizeApproveCode(undefined)).toBeNull();
    expect(normalizeApproveCode('12a4')).toBeNull();
    expect(normalizeApproveCode('9223372036854775807')).toBe(
      '9223372036854775807',
    );
    expect(normalizeApproveCode('9223372036854775808')).toBeNull();
    expect(normalizeApproveCode('12345678901234567890')).toBeNull();
  });

  it('در لاگ ذخیره نمی‌شود', () => {
    const body = sanitizeForLog({
      trackingcode: 55501,
      setStatusDeleveries: 1,
      approveCode: 731042,
    });
    expect(JSON.stringify(body)).not.toContain('731042');
    expect(body).toMatchObject({ approveCode: '[REDACTED]' });
  });
});
