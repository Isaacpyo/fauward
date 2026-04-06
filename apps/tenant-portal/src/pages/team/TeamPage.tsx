import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";

import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/useAppStore";

type TeamUser = {
  id: string;
  email: string;
  role: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string | null;
};

async function fetchUsers(): Promise<TeamUser[]> {
  const response = await api.get<{ users: TeamUser[] }>("/v1/users");
  return response.data.users;
}

const roleOptions = ["TENANT_MANAGER", "TENANT_FINANCE", "TENANT_STAFF", "TENANT_DRIVER"];

export function TeamPage() {
  const user = useAppStore((state) => state.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("TENANT_STAFF");
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
    onSuccess: refreshUsers
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await api.patch(`/v1/users/${id}/role`, { role });
    },
    onSuccess: refreshUsers
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/users/${id}`);
    },
    onSuccess: refreshUsers
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/users/invite", { email: inviteEmail, role: inviteRole });
    },
    onSuccess: () => {
      setInviteEmail("");
      setInviteRole("TENANT_STAFF");
      refreshUsers();
    }
  });

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate();
  }

  const users = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => {
      return (
        user.fullName.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.role.toLowerCase().includes(needle)
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

  return (
    <PageShell title="Team" description="Manage tenant members, roles, and account access.">
      <div className="space-y-4">
        <form onSubmit={submitInvite} className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-[2fr,1fr,auto]">
          <Input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Invite by email"
            type="email"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={inviteMutation.isPending}>
            {inviteMutation.isPending ? "Inviting..." : "Invite staff"}
          </Button>
        </form>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users by name, email, or role..."
        />

        <Table columns={["Name", "Email", "Role", "Status", "Created", "Last active", "Actions"]}>
          {filtered.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.fullName}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "success" : "warning"}>
                  {user.isActive ? "Active" : "Suspended"}
                </Badge>
              </TableCell>
              <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}</TableCell>
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
                      onSelect: () => {
                        const nextRole = window.prompt("Enter new role", user.role);
                        if (!nextRole) return;
                        roleMutation.mutate({ id: user.id, role: nextRole });
                      }
                    },
                    user.isActive
                      ? {
                          key: "suspend",
                          label: "Suspend",
                          destructive: true,
                          onSelect: () => {
                            const yes = window.confirm("This user will immediately lose access. Continue?");
                            if (yes) suspendMutation.mutate({ id: user.id, suspend: true });
                          }
                        }
                      : {
                          key: "activate",
                          label: "Activate",
                          onSelect: () => suspendMutation.mutate({ id: user.id, suspend: false })
                        },
                    {
                      key: "remove",
                      label: "Remove",
                      destructive: true,
                      onSelect: () => {
                        const yes = window.confirm("Deactivate this user?");
                        if (yes) removeMutation.mutate(user.id);
                      }
                    }
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>
    </PageShell>
  );
}
