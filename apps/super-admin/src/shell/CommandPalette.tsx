import { Command } from "cmdk";
import { FileClock, Receipt, Search, User, Users, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const sources = [
  { id: "tenant-northline", label: "Northline Logistics", source: "Tenants", route: "/customer/360/t_1", icon: Users },
  { id: "tenant-portbridge", label: "Portbridge", source: "Tenants", route: "/customer/360/t_2", icon: Users },
  { id: "user-temitope", label: "Temitope Agbola", source: "Users", route: "/trust/iam/users", icon: User },
  { id: "invoice-1044", label: "Invoice INV-1044", source: "Invoices", route: "/revenue/billing", icon: Receipt },
  { id: "audit-suspend", label: "TENANT_SUSPENSION", source: "Audit log", route: "/trust/audit", icon: FileClock }
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const groups = useMemo(() => Array.from(new Set(sources.map((item) => item.source))), []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4" onMouseDown={() => onOpenChange(false)}>
      <div className="mx-auto mt-20 w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <Command label="Global search" className="bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
            <Search size={16} className="text-[var(--color-text-muted)]" />
            <Command.Input autoFocus placeholder="Search tenants, users, invoices, audit log..." className="h-12 flex-1 bg-transparent text-sm outline-none" />
            <button type="button" onClick={() => onOpenChange(false)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)]">
              <X size={16} />
            </button>
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">No results found.</Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group} heading={group} className="px-1 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
                {sources.filter((item) => item.source === group).map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.source} ${item.label}`}
                    onSelect={() => {
                      navigate(item.route);
                      onOpenChange(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-primary)] aria-selected:bg-[var(--color-surface-50)]"
                  >
                    <item.icon size={15} className="text-[var(--color-text-muted)]" />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
