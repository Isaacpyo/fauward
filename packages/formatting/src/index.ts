export function formatDateTime(value: string | number | Date) {
  return new Date(value).toLocaleString();
}

export function formatDate(value: string | number | Date) {
  return new Date(value).toLocaleDateString();
}

export function formatRelative(value: string | number | Date) {
  const d = new Date(value).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatCurrency(value: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
}

export const PLAN_LABEL: Record<string, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
  TRIALING: 'Trial'
};