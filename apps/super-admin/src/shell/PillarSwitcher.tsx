import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { PILLARS } from "@/pillars/_manifests";

export function PillarSwitcher() {
  const [open, setOpen] = useState(false);
  const firstSegment = useLocation().pathname.split("/").filter(Boolean)[0];
  const current = PILLARS.find((pillar) => pillar.id === firstSegment);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-50)]"
      >
        {current?.shortName ?? "Pillars"}
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-md border border-[var(--color-border)] bg-white shadow-lg">
          {PILLARS.map((pillar) => (
            <Link
              key={pillar.id}
              to={pillar.route}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-50)]"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pillar.accent }} />
              <span className="font-medium text-[var(--color-text-primary)]">{pillar.name}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
