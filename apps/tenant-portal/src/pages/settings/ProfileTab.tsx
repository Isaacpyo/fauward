import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type ProfileResponse = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  mfaEnabled?: boolean;
};

async function fetchProfile() {
  const response = await api.get<ProfileResponse>("/v1/users/me");
  return response.data;
}

export function ProfileTab() {
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = profileQuery.data;

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
      await api.patch("/v1/users/me", {
        firstName,
        lastName,
        phone,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined
      });
    },
    onSuccess: () => {
      setMessage("Profile updated successfully");
      setError(null);
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

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" />
        <Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" />
      </div>

      <Input value={profile?.email ?? ""} readOnly placeholder="Email" />
      <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" />

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Change password</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" />
          <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" />
        </div>
      </div>

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

      <Button type="submit" disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
