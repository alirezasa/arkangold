import { resolveCorsOrigins } from './cors-origins';

describe('resolveCorsOrigins', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('never allows localhost in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_EXTRA_ORIGINS;
    const origins = resolveCorsOrigins();
    expect(origins).toContain('https://app.arkan.gold');
    expect(origins).toContain('https://panel.arkan.gold');
    expect(origins.some((o) => o.includes('localhost'))).toBe(false);
  });

  it('allows localhost in development and appends extra origins', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_EXTRA_ORIGINS = 'https://staging.arkan.gold, ';
    const origins = resolveCorsOrigins();
    expect(origins).toContain('http://localhost:3000');
    expect(origins).toContain('https://staging.arkan.gold');
  });
});
