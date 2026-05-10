const secretKeyPattern = /\b(fw_(?:live|test)_[A-Za-z0-9_-]*)([A-Za-z0-9_-]{4})\b/g;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const emailPattern = /\b([A-Z0-9._%+-])([A-Z0-9._%+-]*?)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const phonePattern = /(\+?\d{1,3})?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;

const sensitiveKeys = new Set([
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'apiKey',
  'secret',
  'webhookSecret',
  'mfaSecret',
  'paymentGatewayKey',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'providerRef'
]);

function redactString(value: string) {
  return value
    .replace(secretKeyPattern, (_match, prefix, suffix) => `${String(prefix).slice(0, 8)}****${suffix}`)
    .replace(bearerPattern, 'Bearer ****')
    .replace(emailPattern, (_match, first, _middle, domain) => `${first.toLowerCase()}***@${domain.toLowerCase()}`)
    .replace(phonePattern, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 8) return match;
      return `${match.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}******${digits.slice(-4)}`;
    });
}

export function redactPlatformLogValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactPlatformLogValue);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if (sensitiveKeys.has(key) || /password|secret|token|api.?key|card|payment/i.test(key)) {
        if (typeof child === 'string' && key.toLowerCase().includes('apikey')) {
          return [key, redactString(child)];
        }
        return [key, '****'];
      }
      return [key, redactPlatformLogValue(child)];
    })
  );
}
