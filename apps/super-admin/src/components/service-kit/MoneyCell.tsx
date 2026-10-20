/** Formats the API's decimal string with its own currency; never assumes GBP (service kit §6.2). */
export function formatMoney(amount: string | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined || amount === "") return "-";
  if (!currency) return amount;
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function MoneyCell({ amount, currency }: { amount: string | null | undefined; currency: string | null | undefined }) {
  return <span className="font-mono tabular-nums">{formatMoney(amount, currency)}</span>;
}
