import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { DataTree } from "@/components/service-kit/DataTree";
import { useCleanQueue, usePauseQueue, useQueueJobs, useQueues, useReplayDlq, type QueueJob, type QueueJobState } from "@/pillars/platform/queues/api";

// platform.queues (WP-3.6): one queue — jobs by state (redacted data), DLQ replay (all or selected), clean, pause.

const STATES: Array<{ id: QueueJobState; label: string }> = [
  { id: "failed", label: "Failed" },
  { id: "waiting", label: "Waiting" },
  { id: "active", label: "Active" },
  { id: "delayed", label: "Delayed" },
  { id: "completed", label: "Completed" },
  { id: "dlq", label: "Dead-letter" }
];

type Dialog = { kind: "replay"; jobIds?: string[] } | { kind: "clean" } | { kind: "pause" } | { kind: "resume" } | null;

const formatTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

function JobDrawer({ job, onClose }: { job: QueueJob; onClose: () => void }) {
  return (
    <aside role="dialog" aria-label={`Job ${job.id}`} className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-[var(--color-border)] bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{job.name}</h2>
          <p className="font-mono text-xs text-[var(--color-text-muted)]">{job.id}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold">
          Close
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <dt className="text-[var(--color-text-muted)]">State</dt>
        <dd>{job.state}</dd>
        <dt className="text-[var(--color-text-muted)]">Attempts</dt>
        <dd>{job.attemptsMade}</dd>
        <dt className="text-[var(--color-text-muted)]">Created</dt>
        <dd>{formatTime(job.createdAt)}</dd>
        <dt className="text-[var(--color-text-muted)]">Processed</dt>
        <dd>{formatTime(job.processedAt)}</dd>
        <dt className="text-[var(--color-text-muted)]">Finished</dt>
        <dd>{formatTime(job.finishedAt)}</dd>
      </dl>
      {job.failedReason ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{job.failedReason}</p> : null}
      <h3 className="mt-4 text-xs font-semibold text-[var(--color-text-muted)]">Data (secrets, emails and phone numbers masked)</h3>
      <div className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-50)] p-2">
        <DataTree value={job.data} />
      </div>
    </aside>
  );
}

export function QueueDetailPage() {
  const { name = "" } = useParams();
  const [state, setState] = useState<QueueJobState>("failed");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<QueueJob | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [result, setResult] = useState<string | null>(null);
  const [cleanState, setCleanState] = useState<"completed" | "failed">("completed");
  const [olderThanHours, setOlderThanHours] = useState("24");

  const queues = useQueues();
  const summary = queues.data?.queues.find((queue) => queue.name === name);
  const jobs = useQueueJobs(name, state);
  const replay = useReplayDlq();
  const clean = useCleanQueue();
  const pause = usePauseQueue("pause");
  const resume = usePauseQueue("resume");
  const rows = jobs.data?.pages.flatMap((page) => page.data) ?? [];
  const hasDlq = summary ? summary.dlqDepth !== null : false;

  if (queues.isSuccess && !summary) {
    return (
      <div className="space-y-2">
        <p className="text-sm">No queue named <span className="font-mono">{name}</span>.</p>
        <Link to="/platform/queues" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
          Back to queues
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/platform/queues" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Queues
          </Link>
          <h1 className="font-mono text-xl font-bold text-[var(--color-text-primary)]">{name}</h1>
          {summary ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {summary.waiting} waiting · {summary.active} active · {summary.delayed} delayed · {summary.failed1h} failed in the last hour
              {summary.dlqDepth !== null ? ` · ${summary.dlqDepth} dead-lettered` : ""}
              {summary.paused ? " · paused" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasDlq ? (
            <PermissionButton permission="platform.queues.replay" onClick={() => setDialog({ kind: "replay" })} disabled={!summary?.dlqDepth} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              Replay all dead-lettered
            </PermissionButton>
          ) : null}
          <PermissionButton permission="platform.queues.purge" onClick={() => setDialog({ kind: "clean" })} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            Clean old jobs
          </PermissionButton>
          {summary?.paused ? (
            <PermissionButton permission="platform.queues.replay" onClick={() => setDialog({ kind: "resume" })} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
              Resume
            </PermissionButton>
          ) : (
            <PermissionButton permission="platform.queues.replay" onClick={() => setDialog({ kind: "pause" })} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
              Pause
            </PermissionButton>
          )}
        </div>
      </header>

      {result ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {result}
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-1" aria-label="Job state">
        {STATES.filter((item) => item.id !== "dlq" || hasDlq).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setState(item.id);
              setSelected([]);
            }}
            aria-pressed={state === item.id}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${state === item.id ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {jobs.isError ? <ConsoleApiErrorPanel error={jobs.error} onRetry={() => void jobs.refetch()} title="Unable to load jobs" /> : null}
      {jobs.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading jobs…</p> : null}
      {jobs.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No {state === "dlq" ? "dead-lettered" : state} jobs are kept for this queue.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                {state === "dlq" ? <th className="px-3 py-2" /> : null}
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Attempts</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((job) => (
                <tr key={job.id} data-testid="queue-job" className="cursor-pointer hover:bg-[var(--color-surface-50)]" onClick={() => setOpen(job)}>
                  {state === "dlq" ? (
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${job.id}`}
                        checked={selected.includes(job.id)}
                        onChange={(event) => setSelected((current) => (event.target.checked ? [...current, job.id] : current.filter((id) => id !== job.id)))}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                  <td className="px-3 py-2">{job.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{job.attemptsMade}</td>
                  <td className="px-3 py-2 text-xs">{formatTime(job.createdAt)}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-red-700">{job.failedReason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex gap-2">
        {jobs.hasNextPage ? (
          <button type="button" onClick={() => void jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            Load more
          </button>
        ) : null}
        {state === "dlq" && selected.length > 0 ? (
          <PermissionButton permission="platform.queues.replay" onClick={() => setDialog({ kind: "replay", jobIds: selected })} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Replay {selected.length} selected
          </PermissionButton>
        ) : null}
      </div>

      {open ? <JobDrawer job={open} onClose={() => setOpen(null)} /> : null}

      <ActionDialog
        open={dialog?.kind === "replay"}
        dangerous
        title="Replay dead-lettered jobs"
        description={dialog?.kind === "replay" && dialog.jobIds ? `${dialog.jobIds.length} selected job(s) go back to ${name} with their original data.` : `Every dead-lettered job goes back to ${name} with its original data.`}
        confirmLabel="Replay"
        onSubmit={async (reason) => {
          const jobIds = dialog?.kind === "replay" ? dialog.jobIds : undefined;
          const response = await replay.mutateAsync({ name, reason, ...(jobIds ? { jobIds } : {}) });
          setSelected([]);
          setResult(`${response.replayed} of ${response.requested} job(s) replayed to ${name}.${response.missing.length ? ` ${response.missing.length} were no longer in the dead-letter queue.` : ""}`);
        }}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog?.kind === "clean"}
        dangerous
        title="Clean old jobs"
        description={`Permanently removes kept ${cleanState} jobs older than the age you choose from ${name}.`}
        confirmLabel="Clean"
        validate={() => (/^\d+$/.test(olderThanHours) && Number(olderThanHours) >= 1 && Number(olderThanHours) <= 2160 ? null : "Age must be between 1 and 2160 hours.")}
        onSubmit={async (reason) => {
          const response = await clean.mutateAsync({ name, reason, state: cleanState, olderThanHours: Number(olderThanHours) });
          setResult(`${response.removed} ${response.state} job(s) older than ${response.olderThanHours} h removed from ${name}.`);
        }}
        onClose={() => setDialog(null)}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">
            State
            <select value={cleanState} onChange={(event) => setCleanState(event.target.value === "failed" ? "failed" : "completed")} className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-2 py-1 text-sm">
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">
            Older than (hours)
            <input value={olderThanHours} onChange={(event) => setOlderThanHours(event.target.value)} inputMode="numeric" className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-2 py-1 text-sm" />
          </label>
        </div>
      </ActionDialog>
      <ActionDialog
        open={dialog?.kind === "pause" || dialog?.kind === "resume"}
        dangerous
        title={dialog?.kind === "resume" ? `Resume ${name}` : `Pause ${name}`}
        description={dialog?.kind === "resume" ? "Workers pick up waiting jobs again." : "Workers stop taking new jobs from this queue until it is resumed; producers keep adding jobs."}
        confirmLabel={dialog?.kind === "resume" ? "Resume" : "Pause"}
        onSubmit={async (reason) => {
          const response = dialog?.kind === "resume" ? await resume.mutateAsync({ name, reason }) : await pause.mutateAsync({ name, reason });
          setResult(`${response.name} is ${response.paused ? "paused" : "running"}.`);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
