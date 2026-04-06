import { useState } from 'react';
import { PlanGate } from '../../../router/guards/PlanGate';
import { Button } from '../../../components/ui/Button';

export function EmbedWidgetTab() {
  return (
    <PlanGate plans={['PRO', 'ENTERPRISE']} mode="upgrade"
      message="Embeddable widget requires the Pro plan">
      <EmbedWidgetContent />
    </PlanGate>
  );
}

function EmbedWidgetContent() {
  const [copied, setCopied] = useState(false);
  const snippet = `<div id="fw-tracker"></div>\n<script src="https://fauward.com/embed/tracker.js"\n  data-tenant="fast-couriers"\n  data-theme="#1A3C6B"\n  data-lang="en">\n</script>`;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Copy the snippet below and paste it into your website.
      </p>
      <pre className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4 text-xs font-mono overflow-x-auto">
        {snippet}
      </pre>
      <Button variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy snippet'}</Button>
    </div>
  );
}