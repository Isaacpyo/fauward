import { Link } from "react-router-dom";

/**
 * Every tenant reference in the console (service kit §6.2, ACC-TEN-9, ACC-C360-7): the tenant's name, linking to its
 * Customer 360 page. Clicking it never triggers the surrounding row's own link.
 */
export function TenantChip({ tenantId, name, slug }: { tenantId: string; name: string; slug?: string | null }) {
  return (
    <Link
      to={`/customer/360/${encodeURIComponent(tenantId)}`}
      data-testid="tenant-chip"
      title={slug ? `${name} (${slug}) — open Customer 360` : `${name} — open Customer 360`}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex max-w-full items-center truncate rounded-full border border-[var(--color-border)] bg-white px-2 py-0.5 text-xs font-medium text-[var(--fauward-navy)] hover:bg-[var(--color-surface-50)]"
    >
      {name}
    </Link>
  );
}
