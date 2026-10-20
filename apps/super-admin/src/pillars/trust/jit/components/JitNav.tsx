import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/trust/jit/request", label: "Request" },
  { to: "/trust/jit/pending", label: "Pending" },
  { to: "/trust/jit/active", label: "Active" },
  { to: "/trust/jit/audit", label: "History" }
];

export function JitNav() {
  return (
    <nav className="mt-3 flex gap-1" aria-label="Just-in-time access">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `rounded-md px-3 py-1.5 text-xs font-semibold ${isActive ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
