import { Link } from "react-router-dom";

const LINKS = [
  { id: "dsar", label: "Data requests", to: "/trust/compliance/dsar" },
  { id: "legal-hold", label: "Legal holds", to: "/trust/compliance/legal-hold" },
  { id: "exports", label: "Exports", to: "/trust/compliance/exports" }
] as const;

/** Section links for trust.compliance pages. */
export function ComplianceNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav aria-label="Compliance" className="flex flex-wrap gap-4 border-b border-[var(--color-border)] pb-2 text-sm">
      {LINKS.map((link) => (
        <Link key={link.id} to={link.to} aria-current={link.id === current ? "page" : undefined} className={link.id === current ? "font-semibold text-[var(--fauward-navy)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
