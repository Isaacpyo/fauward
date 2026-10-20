const inputClass =
  "w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-[var(--color-text-primary)] outline-none focus:border-[var(--fauward-navy)] focus:ring-1 focus:ring-[var(--fauward-navy)]";

/** 6-digit TOTP input; pasting "123 456" or "123-456" keeps the digits only. */
export function MfaCodeInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (code: string) => void; autoFocus?: boolean }) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      aria-label="6-digit code"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      className={inputClass}
      placeholder="000000"
    />
  );
}

