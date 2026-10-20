import { Link } from "react-router-dom";

const LINKS = [
  { id: "list", label: "Subscriptions", to: "/revenue/subscriptions" },
  { id: "requests", label: "Plan change requests", to: "/revenue/subscriptions/plan-change-requests" },
  { id: "contracts", label: "Contracts", to: "/revenue/subscriptions/contracts" },
  { id: "overrides", label: "Pricing overrides", to: "/revenue/subscriptions/overrides" }
] as const;

/** Section links for revenue.subscriptions pages. */
export function SubscriptionsNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav aria-label="Subscriptions" className="flex flex-wrap gap-4 border-b border-[var(--color-border)] pb-2 text-sm">
      {LINKS.map((link) => (
        <Link key={link.id} to={link.to} aria-current={link.id === current ? "page" : undefined} className={link.id === current ? "font-semibold text-[var(--fauward-navy)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
