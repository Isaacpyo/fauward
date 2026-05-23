import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { useAuthStore } from "@/store/useAuthStore";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { fieldApi } from "@/lib/api/fieldApi";
import { ApiError } from "@/lib/api/http";
import { formatRoleLabel } from "@/lib/utils/labels";

export const SettingsScreen = () => {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const signOut = useAuthStore((state) => state.signOut);
  const stops = useFieldDataStore((state) => state.stops);
  const nextStop = stops
    .filter((stop) => stop.status === "assigned" || stop.status === "in_progress")
    .sort((left, right) => left.sequence - right.sequence)[0];

  const [isChangeOpen, setChangeOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(null);
  }

  async function handleChangeCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accessToken) {
      setError("You must be signed in to change your access code.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New access code must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New access code and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await fieldApi.changeAccessCode(accessToken, currentPassword, newPassword);
      setSuccess("Access code updated. Use the new code next time you sign in.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to change the access code right now.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title="Profile and settings"
        subtitle="Session access, tenant context, and runtime feature flags stay visible here."
        kicker="Secure session"
      />

      <article className="panel p-5">
        <p className="tiny-label">Operator</p>
        <div className="mt-4 space-y-3 text-sm text-stone-600">
          <div className="flex items-center justify-between gap-3">
            <span>Name</span>
            <span className="font-semibold text-ink">{user?.name || "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Email</span>
            <span className="font-semibold text-ink">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Role</span>
            <span className="font-semibold text-ink">{user?.role ? formatRoleLabel(user.role) : "—"}</span>
          </div>
        </div>
      </article>

      <article className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="tiny-label">Security</p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Access code</h2>
            <p className="mt-1 text-sm text-stone-600">
              Change the code you use to sign in. Choose something only you know.
            </p>
          </div>
          <button
            type="button"
            className="secondary-btn px-3 py-2 text-xs"
            onClick={() => {
              if (isChangeOpen) {
                resetForm();
              }
              setChangeOpen((open) => !open);
            }}
          >
            {isChangeOpen ? "Cancel" : "Change"}
          </button>
        </div>

        {isChangeOpen ? (
          <form onSubmit={handleChangeCode} className="mt-4 space-y-4">
            <div>
              <label htmlFor="current-code" className="mb-2 block tiny-label">
                Current access code
              </label>
              <input
                id="current-code"
                className="field-input"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <label htmlFor="new-code" className="mb-2 block tiny-label">
                New access code
              </label>
              <input
                id="new-code"
                className="field-input"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div>
              <label htmlFor="confirm-code" className="mb-2 block tiny-label">
                Confirm new access code
              </label>
              <input
                id="confirm-code"
                className="field-input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button type="submit" className="primary-btn w-full" disabled={submitting}>
              {submitting ? "Updating…" : "Update access code"}
            </button>
          </form>
        ) : null}
      </article>

      <article className="panel p-5">
        <p className="tiny-label">Field tools</p>
        <div className="mt-4 grid gap-3">
          <Link to="/location" className="action-card">
            <p className="tiny-label">Telemetry</p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Capture location now</h2>
            <p className="mt-2 text-sm text-stone-600">Open the location screen and queue a fresh field ping.</p>
          </Link>
          <Link to={nextStop ? `/stops/${nextStop.id}` : "/jobs"} className="action-card">
            <p className="tiny-label">Execution</p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Work the next assigned job</h2>
            <p className="mt-2 text-sm text-stone-600">
              Status, verification, confirmation, and exception handling in one flow.
            </p>
          </Link>
          <Link to="/sync" className="action-card">
            <p className="tiny-label">Sync queue</p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Review queued mutations</h2>
            <p className="mt-2 text-sm text-stone-600">Force offline mode and replay when ready.</p>
          </Link>
        </div>
      </article>

      <article className="panel p-5">
        <p className="tiny-label">Support</p>
        <Link to="/support" className="action-card mt-4 block">
          <p className="tiny-label">Report</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">Report an issue</h2>
          <p className="mt-2 text-sm text-stone-600">
            Open support options for calling or emailing the support team.
          </p>
        </Link>
      </article>

      <button type="button" className="danger-btn w-full" onClick={signOut}>
        Sign out and clear local field session
      </button>
    </section>
  );
};
