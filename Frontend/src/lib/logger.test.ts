import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitize, logger } from './logger';

describe('client log redaction', () => {
  it('removes credentials and personal data', () => {
    const out = sanitize({
      password: 'hunter2',
      token: 'abc',
      email: 'aisha@example.com',
      phone: '9876543210',
      name: 'Aisha Khan',
      turfId: 'keep-me',
    }) as Record<string, unknown>;

    expect(out.password).toBe('[redacted]');
    expect(out.token).toBe('[redacted]');
    expect(out.email).toBe('[redacted]');
    expect(out.phone).toBe('[redacted]');
    expect(out.name).toBe('[redacted]');
    // Identifiers are the point of the log line — they must survive.
    expect(out.turfId).toBe('keep-me');
  });

  it('redacts nested and differently-cased keys', () => {
    const out = sanitize({ req: { headers: { Authorization: 'Bearer x' } } }) as {
      req: { headers: Record<string, unknown> };
    };
    expect(out.req.headers.Authorization).toBe('[redacted]');
  });

  it('scrubs bearer tokens and JWTs out of free text', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOjEyMw.SflKxwRJSM';
    expect(sanitize(`failed with Bearer ${jwt}`)).not.toContain(jwt);
    expect(sanitize(`stray token ${jwt} here`)).toContain('<jwt>');
  });

  it('keeps an error message and stack', () => {
    const out = sanitize(new Error('boom')) as { name: string; message: string; stack?: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(out.stack).toBeTruthy();
  });

  it('caps depth so a circular structure cannot hang the logger', () => {
    const a: Record<string, unknown> = { label: 'a' };
    a.self = a;
    expect(() => sanitize(a)).not.toThrow();
    expect(JSON.stringify(sanitize(a))).toContain('[max depth]');
  });

  it('truncates long strings', () => {
    const out = sanitize('x'.repeat(3000)) as string;
    expect(out.length).toBeLessThan(1100);
  });
});

describe('remote reporting', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('never lets a failing log endpoint throw into the caller', async () => {
    // The one property this must have: reporting an error cannot itself
    // become a second error.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => logger.error('something broke', new Error('inner'))).not.toThrow();
    await Promise.resolve();
  });

  it('does not report the same error twice', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('repeated failure');

    logger.error('same message', err);
    const afterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    logger.error('same message', err);
    const afterSecond = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // A component that throws on every render would otherwise flood the API.
    expect(afterSecond).toBe(afterFirst);
  });
});
