import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => CircuitBreaker.resetAll());

  it('opens after threshold failures and fails fast', async () => {
    const b = CircuitBreaker.for('t1', {
      failureThreshold: 2,
      cooldownMs: 60_000,
    });
    const fail = () => Promise.reject(new Error('down'));
    await expect(b.execute(fail)).rejects.toThrow('down');
    await expect(b.execute(fail)).rejects.toThrow('down');
    expect(b.state).toBe('OPEN');
    const fn = jest.fn(() => Promise.resolve(1));
    await expect(b.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('half-opens after cooldown and closes on success', async () => {
    const b = CircuitBreaker.for('t2', { failureThreshold: 1, cooldownMs: 0 });
    await expect(
      b.execute(() => Promise.reject(new Error('x'))),
    ).rejects.toThrow();
    expect(b.state).toBe('HALF_OPEN');
    await expect(b.execute(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(b.state).toBe('CLOSED');
  });

  it('ignores errors not classified as failures', async () => {
    const b = CircuitBreaker.for('t3', { failureThreshold: 1 });
    await expect(
      b.execute(
        () => Promise.reject(new Error('user error')),
        () => false,
      ),
    ).rejects.toThrow();
    expect(b.state).toBe('CLOSED');
  });
});
