import { describe, expect, it } from 'vitest';

import { DomainBusinessError, assertDomainIsAllowed, normalizeDomainInput } from './domain.validator.js';

describe('custom domain validator', () => {
  it('normalizes protocol, path, case, and trailing dot', () => {
    expect(normalizeDomainInput(' HTTPS://Track.Example.COM/path. ')).toBe('track.example.com');
    expect(normalizeDomainInput('track.example.com.')).toBe('track.example.com');
  });

  it('accepts a normal subdomain', () => {
    expect(() => assertDomainIsAllowed('track.example.com')).not.toThrow();
  });

  it('rejects reserved exact match', () => {
    expect(() => assertDomainIsAllowed('fauward.com')).toThrow(DomainBusinessError);
    expect(() => assertDomainIsAllowed('fauward.com')).toThrow(/reserved/i);
  });

  it('rejects reserved suffix', () => {
    expect(() => assertDomainIsAllowed('evil.fauward.com')).toThrow(/reserved/i);
  });

  it('rejects apex domains', () => {
    expect(() => assertDomainIsAllowed('example.com')).toThrow(/apex/i);
  });

  it('rejects IP addresses', () => {
    expect(() => assertDomainIsAllowed('192.168.1.1')).toThrow(/hostname/i);
  });

  it('rejects malformed hostnames', () => {
    expect(() => assertDomainIsAllowed('not a domain')).toThrow(/invalid/i);
  });
});
