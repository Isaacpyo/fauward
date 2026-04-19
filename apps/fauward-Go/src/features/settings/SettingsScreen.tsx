import { Link } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { useAuthStore } from "@/store/useAuthStore";
import { useFieldDataStore } from "@/store/useFieldDataStore";

export const SettingsScreen = () => {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const stops = useFieldDataStore((state) => state.stops);
  const nextStop = stops
    .filter((stop) => stop.status === "assigned" || stop.status === "in_progress")
    .sort((left, right) => left.sequence - right.sequence)[0];

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
            <span className="font-semibold text-ink">{user?.name}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Email</span>
            <span className="font-semibold text-ink">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Role</span>
            <span className="font-semibold text-ink">{user?.role}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Vehicle</span>
            <span className="font-semibold text-ink">{user?.vehicleLabel}</span>
          </div>
        </div>
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
