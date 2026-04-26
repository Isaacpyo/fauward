import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";

import { api } from "@/lib/api";
import { getDevTestSession, getDevTestSessionSnapshot, hasDevTestSession, updateDevTestSessionProfile } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type ProfileResponse = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role?: string;
  mfaEnabled?: boolean;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string | null;
};

async function fetchProfile() {
  const devSession = getDevTestSession();
  if (devSession) {
    const nameParts = devSession.user.full_name.trim().split(/\s+/);
    return {
      id: devSession.user.id,
      email: devSession.user.email,
      firstName: nameParts[0] ?? "",
      lastName: nameParts.slice(1).join(" "),
      phone: devSession.tenant.support_phone ?? "",
      role: devSession.user.role,
      mfaEnabled: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
  }

  const response = await api.get<ProfileResponse>("/v1/users/me");
  return response.data;
}

export function ProfileTab() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile", getDevTestSessionSnapshot()],
    queryFn: fetchProfile
  });

  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = profileQuery.data;
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Not set";

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error("New password and confirmation must match");
      }

      if (hasDevTestSession()) {
        updateDevTestSessionProfile({ firstName, lastName, phone });
        return;
      }

      await api.patch("/v1/users/me", {
        firstName,
        lastName,
        phone,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setMessage("Profile updated successfully");
      setError(null);
      setIsEditing(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (mutationError) => {
      const maybeAxios = mutationError as { response?: { data?: { error?: string } }; message?: string };
      setError(maybeAxios.response?.data?.error ?? maybeAxios.message ?? "Unable to save profile");
      setMessage(null);
    }
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  function resetForm() {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
    setPhone(profile?.phone ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  }

  function formatDate(value?: string | null) {
    if (!value) return "Not recorded";
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Unable to load profile details.
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Account profile</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">{fullName}</h3>
          <p className="mt-1 text-sm text-gray-600">{profile?.email}</p>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<X size={15} />}
              onClick={() => {
                resetForm();
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Pencil size={15} />}
            onClick={() => {
              resetForm();
              setIsEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">First name</label>
              <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Last name</label>
              <Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
            <Input value={profile?.email ?? ""} readOnly placeholder="Email" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" />
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Change password</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />
              <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" />
              <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" />
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">First name</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{profile?.firstName || "Not set"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last name</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{profile?.lastName || "Not set"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</p>
            <p className="mt-1 break-all text-sm font-medium text-gray-900">{profile?.email}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{profile?.phone || "Not set"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{profile?.role?.replace(/_/g, " ") ?? "Not set"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{profile?.isActive === false ? "Inactive" : "Active"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Created</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{formatDate(profile?.createdAt)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last login</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{formatDate(profile?.lastLogin)}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">MFA</h3>
        <p className="mt-1 text-sm text-gray-600">
          {profile?.mfaEnabled ? "MFA is enabled for this account." : "MFA is currently disabled for this account."}
        </p>
        <Button type="button" variant="secondary" size="sm" className="mt-3" disabled>
          TOTP setup flow available in auth module
        </Button>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p> : null}
    </form>
  );
}
