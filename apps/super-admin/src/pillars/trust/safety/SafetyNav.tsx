import { Link } from "react-router-dom";

const LINKS = [
  { id: "appeals", label: "Appeals", to: "/trust/safety/appeals" },
  { id: "signals", label: "Signals", to: "/trust/safety/signals" },
  { id: "suspensions", label: "Suspensions", to: "/trust/safety/suspensions" },
  { id: "rules", label: "Rules", to: "/trust/safety/rules" }
] as const;

/** Section links for trust.safety pages. */
export function SafetyNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav aria-label="Trust & Safety" className="flex flex-wrap gap-4 border-b border-[var(--color-border)] pb-2 text-sm">
      {LINKS.map((link) => (
        <Link key={link.id} to={link.to} aria-current={link.id === current ? "page" : undefined} className={link.id === current ? "font-semibold text-[var(--fauward-navy)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
