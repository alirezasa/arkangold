import { stripForbiddenFields } from './response-allowlist.interceptor';

describe('stripForbiddenFields', () => {
  it('removes internal secret fields at any depth', () => {
    const input = {
      id: 'u1',
      passwordHash: 'x',
      totpSecret: 'y',
      nested: [{ apiKeyHash: 'k', name: 'p' }],
      deep: { a: { refreshTokenHash: 'r', ok: true } },
    };
    expect(stripForbiddenFields(input)).toEqual({
      id: 'u1',
      nested: [{ name: 'p' }],
      deep: { a: { ok: true } },
    });
    // ورودی دست‌نخورده می‌ماند
    expect(input.passwordHash).toBe('x');
  });

  it('keeps non-plain values and unrelated objects by reference', () => {
    const d = new Date();
    const obj = { at: d, list: [1, 2] };
    expect(stripForbiddenFields(obj)).toBe(obj);
    expect(stripForbiddenFields('text')).toBe('text');
    expect(stripForbiddenFields(null)).toBeNull();
  });
});
