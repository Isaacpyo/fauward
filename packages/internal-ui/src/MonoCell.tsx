import { useState } from 'react';
import { Copy } from 'lucide-react';
import { cn } from './cn.js';

type MonoCellProps = {
  value: string | number | null | undefined;
  copyValue?: string;
  className?: string;
};

export function MonoCell({ value, copyValue, className }: MonoCellProps) {
  const [copied, setCopied] = useState(false);
  const text = value == null ? '' : String(value);
  const canCopy = Boolean(copyValue ?? text);

  async function handleCopy() {
    if (!canCopy || !navigator.clipboard) return;
    await navigator.clipboard.writeText(copyValue ?? text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!canCopy}
      className={cn('inline-flex max-w-full items-center gap-1.5 font-mono text-sm tracking-tight text-[var(--color-text-primary)] disabled:cursor-default dark:text-neutral-100', className)}
      title={canCopy ? 'Copy value' : undefined}
    >
      <span className="truncate">{text || 'n/a'}</span>
      {canCopy ? <Copy size={12} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden /> : null}
      {copied ? <span className="text-xs text-green-600">Copied</span> : null}
    </button>
  );
}
