const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'cardNumber',
  'creditCard',
  'cvv',
  'cvc'
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive.toLowerCase()));
}

function redactCardLike(value: string): string {
  return value.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]');
}

export function redactAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactCardLike(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactAuditValue);

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? '[REDACTED]' : redactAuditValue(nested);
  }
  return output;
}

export const AUDIT_REDACTION_KEYS = [...SENSITIVE_KEYS];
