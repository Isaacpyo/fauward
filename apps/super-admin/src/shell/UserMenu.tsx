import { LogOut, UserCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "@/lib/api";
import type { PlatformSessionUser } from "@/lib/platform-session";

type UserMenuProps = {
  user: PlatformSessionUser;
};

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const name = user.name || user.email;
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Best-effort logout.
    } finally {
      navigate("/login");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-2 pr-3 text-sm font-semibold hover:bg-[var(--color-surface-50)]"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--fauward-navy)] text-[10px] text-white">{initials}</span>
        <span className="hidden max-w-36 truncate md:inline">{name}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-64 rounded-md border border-[var(--color-border)] bg-white p-2 shadow-lg">
          <div className="flex items-start gap-2 border-b border-[var(--color-border)] px-2 py-2">
            <UserCircle size={18} className="mt-0.5 text-[var(--color-text-muted)]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">{user.role ?? "Platform user"}</p>
            </div>
          </div>
          <button type="button" onClick={handleSignOut} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
