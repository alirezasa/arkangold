import {
  ipAllowed,
  parseAllowedHours,
  parseIpAllowlist,
  sameDevice,
  sameNetwork,
  withinHours,
} from './session-context.service';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const CHROME_WIN_NEWER = CHROME_WIN.replace('Chrome/120.0', 'Chrome/121.0');
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

describe('session context helpers', () => {
  it('treats browser version updates as the same device, other browsers as different', () => {
    expect(sameDevice(CHROME_WIN, CHROME_WIN_NEWER)).toBe(true);
    expect(sameDevice(CHROME_WIN, FIREFOX_LINUX)).toBe(false);
    expect(sameDevice(null, FIREFOX_LINUX)).toBe(true);
  });

  it('compares networks at /24 (IPv4) and /64 (IPv6)', () => {
    expect(sameNetwork('5.6.7.8', '5.6.7.200')).toBe(true);
    expect(sameNetwork('5.6.7.8', '5.6.8.8')).toBe(false);
    expect(sameNetwork('::ffff:5.6.7.8', '5.6.7.9')).toBe(true);
    expect(sameNetwork('2001:db8:1:2::1', '2001:db8:1:2:ffff::9')).toBe(true);
    expect(sameNetwork('2001:db8:1:2::1', '2001:db8:1:3::1')).toBe(false);
    expect(sameNetwork('5.6.7.8', '2001:db8::1')).toBe(false);
  });

  it('parses allowlists with CIDR and single addresses', () => {
    const parsed = parseIpAllowlist('185.1.2.0/24, 10.0.0.5 bad/99');
    expect(parsed.invalid).toEqual(['bad/99']);
    expect(ipAllowed(parsed.list, '185.1.2.77')).toBe(true);
    expect(ipAllowed(parsed.list, '10.0.0.5')).toBe(true);
    expect(ipAllowed(parsed.list, '10.0.0.6')).toBe(false);
    expect(parseIpAllowlist('')).toBeNull();
  });

  it('evaluates working hours in Tehran time, including overnight ranges', () => {
    const day = parseAllowedHours('07:00-22:00');
    // 08:00 UTC = 11:30 Tehran
    expect(withinHours(day, new Date('2026-01-01T08:00:00Z'))).toBe(true);
    // 20:00 UTC = 23:30 Tehran
    expect(withinHours(day, new Date('2026-01-01T20:00:00Z'))).toBe(false);
    const night = parseAllowedHours('22:00-06:00');
    expect(withinHours(night, new Date('2026-01-01T20:00:00Z'))).toBe(true);
    expect(parseAllowedHours('nonsense')).toBeNull();
  });
});
