import { EmptyState } from "@fauward/internal-ui";
export default function TicketsTab() {
  return <EmptyState title="Zendesk is not connected" message="Connect Zendesk to show customer support tickets in Customer 360." action={<a className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white" href="https://zendesk.com">Connect Zendesk</a>} />;
}
