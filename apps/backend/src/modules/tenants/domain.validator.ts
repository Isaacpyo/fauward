import { config } from '../../config/index.js';

const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export class DomainBusinessError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export function normalizeDomainInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export function isDomainFormatValid(domain: string) {
  return domain.length >= 4 && domain.length <= 253 && DOMAIN_PATTERN.test(domain);
}

export function assertDomainIsAllowed(domain: string) {
  const normalized = normalizeDomainInput(domain);

  if (!isDomainFormatValid(normalized)) {
    throw new DomainBusinessError('Invalid domain format', 'INVALID_DOMAIN_FORMAT');
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    throw new DomainBusinessError('Domain must be a hostname, not an IP address', 'IP_NOT_ALLOWED');
  }

  if (config.reservedDomains.some((reserved) => normalized === reserved || normalized.endsWith(`.${reserved}`))) {
    throw new DomainBusinessError('This domain is reserved', 'DOMAIN_RESERVED');
  }

  if (normalized.split('.').length < 3) {
    throw new DomainBusinessError(
      'Use a subdomain such as track.yourdomain.com. Apex domains are not supported yet.',
      'APEX_NOT_SUPPORTED'
    );
  }
}
