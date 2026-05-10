import { Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { PlatformSessionUser } from "@/lib/platform-session";
import { CommandPalette } from "@/shell/CommandPalette";
import { PillarSwitcher } from "@/shell/PillarSwitcher";
import { UserMenu } from "@/shell/UserMenu";

type TopBarProps = {
  user: PlatformSessionUser;
};

export function TopBar({ user }: TopBarProps) {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white px-4">
      <Link to="/" className="flex min-w-0 items-center gap-2.5">
        <img src="/brand/logo-mark.png" alt="Fauward logo" className="h-8 w-8 shrink-0 object-contain" />
        <div className="hidden leading-none sm:block">
          <p className="text-sm font-bold text-[var(--fauward-navy)]">Fauward</p>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Console</p>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-50)] px-3 text-left text-sm text-[var(--color-text-muted)] md:max-w-xl"
      >
        <Search size={15} className="shrink-0" />
        <span className="truncate">Search tenants, users, invoices, audit log</span>
        <span className="ml-auto hidden rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)] md:inline">Cmd K</span>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <PillarSwitcher />
        <span className="hidden items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 lg:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          On-call
        </span>
        <UserMenu user={user} />
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  );
}
