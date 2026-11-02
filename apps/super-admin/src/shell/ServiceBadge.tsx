import { badgeLabel, badgeToneClasses, useBadges } from "@/lib/badges";
import type { BadgeKey } from "@/pillars/_manifests";

/**
 * A service's badge from GET /badges. Renders nothing when the service has no badge key or the caller cannot read the
 * key (it is absent from the response); never a placeholder.
 */
export function ServiceBadge({ badgeKey }: { badgeKey?: BadgeKey }) {
  const badges = useBadges();
  if (!badgeKey) return null;
  const badge = badges.data?.[badgeKey];
  if (!badge) return null;
  return (
    <span data-testid={`badge-${badgeKey}`} title={badge.reason} className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeToneClasses[badge.tone]}`}>
      {badgeLabel(badge)}
    </span>
  );
}
