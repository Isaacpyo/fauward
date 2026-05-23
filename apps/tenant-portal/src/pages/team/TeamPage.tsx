import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MoreHorizontal, Plus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type TeamUser = {
  id: string;
  email: string;
  phone?: string | null;
  role: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string | null;
};

type AccessCodeIssued = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  code: string;
  isReset: boolean;
};

async function fetchUsers(): Promise<TeamUser[]> {
  const response = await api.get<{ users: TeamUser[] }>("/v1/users");
  return response.data.users;
}

const ROLE_OPTIONS = [
  { value: "TENANT_MANAGER", label: "Manager" },
  { value: "TENANT_FINANCE", label: "Finance" },
  { value: "TENANT_STAFF", label: "Staff" },
  { value: "TENANT_DRIVER", label: "Field Operator" }
];

function formatRoleLabel(role: string) {
  return ROLE_OPTIONS.find((opt) => opt.value === role)?.label ?? role;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (error as { response?: { data?: { error?: unknown } } }).response?.data;
    if (data && typeof data.error === "string") return data.error;
  }
  return fallback;
}

export function TeamPage() {
  const user = useAppStore((state) => state.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<AccessCodeIssued | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingSuspend, setPendingSuspend] = useState<TeamUser | null>(null);
  const [pendingReset, setPendingReset] = useState<TeamUser | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TeamUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<TeamUser | null>(null);
  const [pendingNextRole, setPendingNextRole] = useState<string>("TENANT_STAFF");
  const debouncedSearch = useDebouncedValue(search, 300);

  const usersQuery = useQuery({
    queryKey: ["team-users"],
    queryFn: fetchUsers
  });

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["team-users"] });
  };

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      await api.patch(`/v1/users/${id}/${suspend ? "suspend" : "activate"}`);
    },
    onSuccess: async () => {
      setPendingSuspend(null);
      await refreshUsers();
    }
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await api.patch(`/v1/users/${id}/role`, { role });
    },
    onSuccess: async () => {
      setPendingRoleChange(null);
      await refreshUsers();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/users/${id}/permanent`);
    },
    onSuccess: async () => {
      setPendingDelete(null);
      setDeleteError(null);
      await refreshUsers();
    },
    onError: (err) => {
      setDeleteError(getApiErrorMessage(err, "Unable to delete this user."));
    }
  });

  const resetMutation = useMutation({
    mutationFn: async (target: TeamUser) => {
      const response = await api.post<{
        id: string;
        email: string;
        role: string;
        temporaryPassword: string;
      }>(`/v1/users/${target.id}/reset-access-code`);
      return { target, payload: response.data };
    },
    onSuccess: ({ target, payload }) => {
      setPendingReset(null);
      setIssuedCode({
        userId: payload.id,
        email: payload.email,
        fullName: target.fullName,
        role: payload.role,
        code: payload.temporaryPassword,
        isReset: true
      });
      setCopied(false);
    }
  });

  const users = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((member) => {
      return (
        member.fullName.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle) ||
        (member.phone ?? "").toLowerCase().includes(needle) ||
        member.role.toLowerCase().includes(needle)
      );
    });
  }, [users, debouncedSearch]);

  if (user?.role !== "TENANT_ADMIN") {
    return (
      <PageShell title="Team" description="Manage tenant members, roles, and account access.">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Only TENANT_ADMIN can access team management.
        </div>
      </PageShell>
    );
  }

  async function handleCopyCode() {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function openRoleChange(target: TeamUser) {
    setPendingNextRole(target.role);
    setPendingRoleChange(target);
  }

  function handleCloseIssued() {
    setIssuedCode(null);
    setCopied(false);
    void refreshUsers();
  }

  return (
    <PageShell title="Team" description="Manage tenant members, roles, and account access.">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, phone, or role..."
            className="md:max-w-md"
          />
          <Button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} />
            Add team member
          </Button>
        </div>

        <Table columns={["Name", "Email", "Phone", "Role", "Status", "Created", "Last active", "Actions"]}>
          {filtered.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{member.fullName}</TableCell>
              <TableCell>{member.email}</TableCell>
              <TableCell>{member.phone ?? "—"}</TableCell>
              <TableCell>{formatRoleLabel(member.role)}</TableCell>
              <TableCell>
                <Badge variant={member.isActive ? "success" : "warning"}>
                  {member.isActive ? "Active" : "Suspended"}
                </Badge>
              </TableCell>
              <TableCell>{new Date(member.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>{member.lastLogin ? new Date(member.lastLogin).toLocaleString() : "Never"}</TableCell>
              <TableCell>
                <Dropdown
                  trigger={
                    <button className="rounded-md border border-gray-300 p-2 hover:bg-gray-50">
                      <MoreHorizontal size={14} />
                    </button>
                  }
                  items={[
                    {
                      key: "change-role",
                      label: "Change role",
                      onSelect: () => openRoleChange(member)
                    },
                    {
                      key: "reset-code",
                      label: "Reset access code",
                      onSelect: () => setPendingReset(member)
                    },
                    member.isActive
                      ? {
                          key: "suspend",
                          label: "Suspend",
                          destructive: true,
                          onSelect: () => setPendingSuspend(member)
                        }
                      : {
                          key: "activate",
                          label: "Activate",
                          onSelect: () => suspendMutation.mutate({ id: member.id, suspend: false })
                        },
                    {
                      key: "delete",
                      label: "Delete permanently",
                      destructive: true,
                      onSelect: () => setPendingDelete(member)
                    }
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>

      <CreateTeamMemberDialog
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreated={(issued) => {
          setIssuedCode(issued);
          setCopied(false);
          setCreateOpen(false);
        }}
      />

      <Dialog
        open={issuedCode !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseIssued();
        }}
        title={issuedCode?.isReset ? "Access code reset" : "Team member created"}
        description="This code will not be shown again. It has also been emailed to the user."
      >
        {issuedCode ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">User</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{issuedCode.fullName || issuedCode.email}</p>
              <p className="text-sm text-gray-600">{issuedCode.email}</p>
              <p className="mt-1 text-xs text-gray-500">{formatRoleLabel(issuedCode.role)}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Access code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-md border border-gray-300 bg-white px-3 py-3 font-mono text-base text-gray-900">
                  {issuedCode.code}
                </code>
                <Button type="button" variant="secondary" onClick={() => void handleCopyCode()}>
                  <Copy size={14} />
                  <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleCloseIssued}>Done</Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={pendingSuspend !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSuspend(null);
        }}
        title="Suspend access"
        description={
          pendingSuspend
            ? `${pendingSuspend.fullName || pendingSuspend.email} will immediately lose access. You can reactivate them at any time.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setPendingSuspend(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={suspendMutation.isPending}
            onClick={() => {
              if (pendingSuspend) suspendMutation.mutate({ id: pendingSuspend.id, suspend: true });
            }}
          >
            {suspendMutation.isPending ? "Suspending…" : "Suspend"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={pendingReset !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReset(null);
        }}
        title="Reset access code"
        description={
          pendingReset
            ? `Generate a new access code for ${pendingReset.fullName || pendingReset.email}? Their current code will stop working immediately and the new code will be emailed to them.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setPendingReset(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={resetMutation.isPending}
            onClick={() => {
              if (pendingReset) resetMutation.mutate(pendingReset);
            }}
          >
            {resetMutation.isPending ? "Generating…" : "Generate new code"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={pendingRoleChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRoleChange(null);
        }}
        title="Change role"
        description={
          pendingRoleChange
            ? `Update the role for ${pendingRoleChange.fullName || pendingRoleChange.email}.`
            : ""
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Role</label>
            <Select value={pendingNextRole} onValueChange={setPendingNextRole} options={ROLE_OPTIONS} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingRoleChange(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={roleMutation.isPending || pendingNextRole === pendingRoleChange?.role}
              onClick={() => {
                if (pendingRoleChange) roleMutation.mutate({ id: pendingRoleChange.id, role: pendingNextRole });
              }}
            >
              {roleMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        title="Delete permanently"
        description={
          pendingDelete
            ? `Permanently remove ${pendingDelete.fullName || pendingDelete.email} and all their data from this workspace. This cannot be undone.`
            : ""
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            If this user has shipments, tickets, or other records attached to them, the deletion will fail —
            suspend them instead.
          </div>
          {deleteError ? (
            <div className="rounded-md border border-red-300 bg-red-100 p-3 text-sm text-red-800">{deleteError}</div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}

type CreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (issued: AccessCodeIssued) => void;
};

function CreateTeamMemberDialog({ open, onOpenChange, onCreated }: CreateDialogProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("TENANT_STAFF");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setRole("TENANT_STAFF");
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        role: string;
        temporaryPassword: string;
      }>("/v1/users/invite", {
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        role
      });
      return response.data;
    },
    onSuccess: (data) => {
      onCreated({
        userId: data.id,
        email: data.email,
        fullName: [data.firstName, data.lastName].filter(Boolean).join(" ") || data.email,
        role: data.role,
        code: data.temporaryPassword,
        isReset: false
      });
      reset();
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, "Unable to create team member."));
    }
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    createMutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add team member"
      description="Create a user and auto-generate their access code. The code will be emailed to them and shown to you once."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="invite-email">
            Email
          </label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="invite-first">
              First name
            </label>
            <Input
              id="invite-first"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="invite-last">
              Last name
            </label>
            <Input
              id="invite-last"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="invite-phone">
              Phone
            </label>
            <Input
              id="invite-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Optional"
              inputMode="tel"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Role</label>
            <Select value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create user"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
