import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { apiErrorMessage } from "@/lib/console-api-error";
import { useMe } from "@/lib/use-me";
import { STATUS_LABEL, useExpiringSecrets, useMarkRotated, usePatchSecret, useSecret, useSecretAudit, useSecrets, type Secret, type SecretStatus } from "@/pillars/trust/secrets/api";

// trust.secrets (WP-4.12): SecretsInventoryPage, ExpiringPage, SecretDetailPage. Values never reach the console: rows
// show whether a secret is set, a fingerprint and rotation dates.

const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

const TONE: Record<SecretStatus, string> = {
  NOT_CONFIGURED: "bg-slate-100 text-slate-700",
  OK: "bg-green-100 text-green-800",
  DUE_SOON: "bg-amber-100 text-amber-900",
  OVERDUE: "bg-red-100 text-red-800",
  NO_POLICY: "bg-slate-100 text-slate-700"
};

function StatusBadge({ status }: { status: SecretStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function SecretsNav({ active }: { active: "inventory" | "expiring" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  return (
    <nav className="flex gap-2" aria-label="Secret sections">
      <Link to="/trust/secrets" className={`${base} ${active === "inventory" ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
        Inventory
      </Link>
      <Link to="/trust/secrets/expiring" className={`${base} ${active === "expiring" ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
        Expiring
      </Link>
    </nav>
  );
}

function ownerLabel(secret: Secret) {
  if (secret.owner) return secret.owner.name ?? secret.owner.email ?? secret.owner.id;
  return secret.ownerTeam ? `${secret.ownerTeam} (team)` : "Unowned";
}

function SecretsTable({ rows, testId }: { rows: Secret[]; testId: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--color-text-muted)]">
            <th className="px-3 py-2">Secret</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Fingerprint</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Last rotated</th>
            <th className="px-3 py-2">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((secret) => (
            <tr key={secret.id} data-testid={testId}>
              <td className="px-3 py-2">
                <Link to={`/trust/secrets/${encodeURIComponent(secret.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                  {secret.name}
                </Link>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">{secret.envName ?? "—"}</p>
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={secret.status} />
                {secret.configured && secret.source !== "ENV" ? <span className="ml-1 text-xs text-[var(--color-text-muted)]">via {secret.source.toLowerCase()}</span> : null}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{secret.fingerprint ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{ownerLabel(secret)}</td>
              <td className="px-3 py-2 text-xs">{day(secret.lastRotatedAt)}</td>
              <td className="px-3 py-2 text-xs">{secret.rotationDueAt ? day(secret.rotationDueAt) : secret.rotateEveryDays ? "—" : "No policy"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SecretsInventoryPage() {
  const secrets = useSecrets();
  const rows = secrets.data?.data ?? [];
  const run = secrets.data?.lastInventoryRun;
  const configured = rows.filter((row) => row.configured).length;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Secret inventory</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Credentials the backend depends on, as seen by the secret inventory job (at boot and daily). Only a fingerprint is stored; a new fingerprint is recorded as a rotation.
          </p>
        </div>
        <SecretsNav active="inventory" />
      </header>
      {secrets.data?.doppler && !secrets.data.doppler.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={secrets.data.doppler.missing.join(", ")}>
          Doppler is not connected, so the inventory reads the backend environment only.
        </DegradedBanner>
      ) : null}
      {secrets.isSuccess && !run ? (
        <DegradedBanner variant="not-wired" fixedBy="trust.secret-inventory">
          The inventory job has not run yet. It runs when the backend starts and daily at 04:50 UTC; run it now from Background jobs.
        </DegradedBanner>
      ) : null}
      {run ? (
        <p className="text-xs text-[var(--color-text-muted)]" data-testid="inventory-run">
          Last inventory: {when(run.finishedAt ?? run.startedAt)} · {run.status.toLowerCase()}
          {run.error ? ` · ${run.error}` : ""} · {configured} of {rows.length} set
        </p>
      ) : null}
      {secrets.isError ? <ConsoleApiErrorPanel error={secrets.error} onRetry={() => void secrets.refetch()} title="Unable to load secrets" /> : null}
      {secrets.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading secrets…</p> : null}
      {secrets.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No secrets recorded yet.</p> : null}
      {rows.length > 0 ? <SecretsTable rows={rows} testId="secret-row" /> : null}
    </div>
  );
}

export function ExpiringPage() {
  const expiring = useExpiringSecrets();
  const rows = expiring.data?.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Expiring secrets</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Overdue or due for rotation within {expiring.data?.windowDays ?? 14} days, by their rotation policy.</p>
        </div>
        <SecretsNav active="expiring" />
      </header>
      {expiring.isError ? <ConsoleApiErrorPanel error={expiring.error} onRetry={() => void expiring.refetch()} title="Unable to load expiring secrets" /> : null}
      {expiring.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {expiring.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Nothing is due for rotation in the next {expiring.data.windowDays} days.</p> : null}
      {rows.length > 0 ? <SecretsTable rows={rows} testId="expiring-row" /> : null}
    </div>
  );
}

function PolicyForm({ secret, onDone }: { secret: Secret; onDone: (message: string) => void }) {
  const patch = usePatchSecret(secret.id);
  const me = useMe();
  const [days, setDays] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDays(secret.rotateEveryDays ? String(secret.rotateEveryDays) : "");
    setNotes(secret.rotationNotes ?? "");
  }, [secret.rotateEveryDays, secret.rotationNotes]);
  const myId = me.data?.user.id;

  async function save(body: Parameters<typeof patch.mutateAsync>[0], message: string) {
    setError(null);
    try {
      await patch.mutateAsync(body);
      onDone(message);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The change was not saved."));
    }
  }

  const daysValue = days.trim() ? Number(days) : null;
  const daysValid = daysValue === null || (Number.isInteger(daysValue) && daysValue >= 1 && daysValue <= 3650);
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h2 className="text-sm font-semibold">Owner and policy</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Owner: {ownerLabel(secret)}</span>
        {myId && secret.owner?.id !== myId ? (
          <PermissionButton permission="trust.secrets.write" disabled={patch.isPending} onClick={() => void save({ ownerId: myId }, "You now own this secret.")} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold">
            Take ownership
          </PermissionButton>
        ) : null}
        {secret.owner ? (
          <PermissionButton permission="trust.secrets.write" disabled={patch.isPending} onClick={() => void save({ ownerId: null }, "Owner cleared.")} className="text-xs underline">
            Clear owner
          </PermissionButton>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Rotate every (days, empty = no policy)
          <input value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" className={input} />
        </label>
        <label className={label}>
          Rotation notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} className={input} />
        </label>
      </div>
      {!daysValid ? <p className="text-xs text-red-700">Use a whole number of days between 1 and 3650.</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <PermissionButton
        permission="trust.secrets.write"
        disabled={patch.isPending || !daysValid || (daysValue === secret.rotateEveryDays && (notes.trim() || null) === secret.rotationNotes)}
        onClick={() => void save({ rotateEveryDays: daysValue, rotationNotes: notes.trim() || null }, "Policy saved.")}
        className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Save policy
      </PermissionButton>
    </section>
  );
}

export function SecretDetailPage() {
  const { id = "" } = useParams();
  const secret = useSecret(id);
  const audit = useSecretAudit(id);
  const markRotated = useMarkRotated(id);
  const [message, setMessage] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const row = secret.data;
  const entries = audit.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/trust/secrets" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Secret inventory
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{row?.name ?? "Secret"}</h1>
          {row ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="font-mono">{row.envName}</span>
              <StatusBadge status={row.status} />
              {row.usedBy.length ? <span>Used by {row.usedBy.join(", ")}</span> : null}
            </p>
          ) : null}
        </div>
        {row ? (
          <PermissionButton permission="trust.secrets.write" onClick={() => setMarking(true)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">
            Mark rotated
          </PermissionButton>
        ) : null}
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {secret.isError ? <ConsoleApiErrorPanel error={secret.error} onRetry={() => void secret.refetch()} title="Unable to load the secret" /> : null}
      {secret.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {row ? (
        <>
          <dl className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm sm:grid-cols-3" data-testid="secret-facts">
            <div>
              <dt className={label}>Set</dt>
              <dd>{row.configured ? `Yes (${row.source.toLowerCase()})` : "No"}</dd>
            </div>
            <div>
              <dt className={label}>Fingerprint</dt>
              <dd className="font-mono">{row.fingerprint ?? "—"}</dd>
            </div>
            <div>
              <dt className={label}>First seen</dt>
              <dd>{when(row.firstSeenAt)}</dd>
            </div>
            <div>
              <dt className={label}>Last seen</dt>
              <dd>{when(row.lastSeenAt)}</dd>
            </div>
            <div>
              <dt className={label}>Last rotated</dt>
              <dd>{when(row.lastRotatedAt)}</dd>
            </div>
            <div>
              <dt className={label}>Rotation due</dt>
              <dd>{row.rotationDueAt ? day(row.rotationDueAt) : row.rotateEveryDays ? "—" : "No policy"}</dd>
            </div>
          </dl>
          <PolicyForm secret={row} onDone={setMessage} />
          <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Audit</h2>
            {audit.isError ? <ConsoleApiErrorPanel error={audit.error} onRetry={() => void audit.refetch()} title="Unable to load the audit" /> : null}
            {audit.isSuccess && entries.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No changes recorded.</p> : null}
            <ul className="divide-y divide-[var(--color-border)] text-sm">
              {entries.map((entry) => (
                <li key={entry.id} data-testid="secret-audit-row" className="py-1.5">
                  <span className="font-mono text-xs">{entry.action}</span> · {entry.actorEmail ?? (entry.actorType === "SYSTEM" ? "Secret inventory" : entry.actorId)} · {when(entry.createdAt)}
                  {entry.reason ? <p className="text-xs text-[var(--color-text-muted)]">{entry.reason}</p> : null}
                </li>
              ))}
            </ul>
            {audit.hasNextPage ? (
              <button type="button" onClick={() => void audit.fetchNextPage()} disabled={audit.isFetchingNextPage} className="text-xs underline">
                Load more
              </button>
            ) : null}
          </section>
        </>
      ) : null}
      <ActionDialog
        open={marking}
        dangerous
        title={`Mark ${row?.name ?? "secret"} rotated`}
        description="Use this when the rotation cannot be observed (for example a key held outside this backend). It records you, now and your reason."
        confirmLabel="Mark rotated"
        onSubmit={async (reason) => {
          await markRotated.mutateAsync({ reason });
          setMessage("Rotation recorded.");
        }}
        onClose={() => setMarking(false)}
      />
    </div>
  );
}
