import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DataTree } from "@/components/service-kit/DataTree";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { formatDuration, runStatusTone, useJobRuns, useJobs, useTriggerJob, type JobRun, type ScheduledJob } from "@/pillars/platform/jobs/api";

// platform.jobs (WP-3.8): JobsListPage (registered jobs, next/last run) and JobRunsPage (run history, manual trigger).

function StatusPill({ run }: { run: JobRun }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${runStatusTone[run.status]}`}>{run.status.replace("_", " ").toLowerCase()}</span>;
}

function TriggerDialog({ job, onClose, onQueued }: { job: ScheduledJob | null; onClose: () => void; onQueued: (message: string) => void }) {
  const trigger = useTriggerJob();
  return (
    <ActionDialog
      open={job !== null}
      dangerous
      title={job ? `Run ${job.name} now` : "Run job"}
      description={job?.description}
      confirmLabel="Run now"
      onSubmit={async (reason) => {
        if (!job) return;
        const response = await trigger.mutateAsync({ name: job.name, reason });
        onQueued(`${response.jobName} queued (job ${response.bullJobId}). Its run appears in the history when the worker picks it up.`);
      }}
      onClose={onClose}
    />
  );
}

export function JobsListPage() {
  const jobs = useJobs();
  const [triggering, setTriggering] = useState<ScheduledJob | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = jobs.data?.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Background jobs</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Scheduled jobs registered in the worker (cron in UTC). Every run is recorded with its duration and error.</p>
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {jobs.data && !jobs.data.scheduleReadable ? (
        <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The BullMQ schedule could not be read, so next-run times are not shown.
        </p>
      ) : null}
      {jobs.isError ? <ConsoleApiErrorPanel error={jobs.error} onRetry={() => void jobs.refetch()} title="Unable to load jobs" /> : null}
      {jobs.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading jobs…</p> : null}
      {jobs.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No scheduled jobs are registered.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Cron (UTC)</th>
                <th className="px-3 py-2">Next run</th>
                <th className="px-3 py-2">Last run</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((job) => (
                <tr key={job.name} data-testid="job-row" className="align-top">
                  <td className="px-3 py-2">
                    <Link to={`/platform/jobs/${encodeURIComponent(job.name)}`} className="font-mono text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                      {job.name}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">{job.description}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{job.pattern}</td>
                  <td className="px-3 py-2 text-xs">{job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : job.scheduled === false ? "Not scheduled" : "Unknown"}</td>
                  <td className="px-3 py-2 text-xs">
                    {job.lastRun ? (
                      <div className="space-y-1">
                        <StatusPill run={job.lastRun} /> <span>{new Date(job.lastRun.startedAt).toLocaleString()}</span>
                        {job.lastRun.error ? <p className="text-red-700">{job.lastRun.error}</p> : null}
                      </div>
                    ) : (
                      "Never run"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{formatDuration(job.lastRun?.durationMs ?? null)}</td>
                  <td className="px-3 py-2 text-right">
                    <PermissionButton permission="platform.jobs.trigger" onClick={() => setTriggering(job)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">
                      Run now
                    </PermissionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <TriggerDialog job={triggering} onClose={() => setTriggering(null)} onQueued={setMessage} />
    </div>
  );
}

export function JobRunsPage() {
  const { name = "" } = useParams();
  const jobs = useJobs();
  const runs = useJobRuns(name);
  const [triggering, setTriggering] = useState<ScheduledJob | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const job = jobs.data?.data.find((item) => item.name === name) ?? null;
  const rows = runs.data?.pages.flatMap((page) => page.data) ?? [];

  if (jobs.isSuccess && !job) {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          No scheduled job named <span className="font-mono">{name}</span>.
        </p>
        <Link to="/platform/jobs" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/platform/jobs" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Background jobs
          </Link>
          <h1 className="font-mono text-xl font-bold text-[var(--color-text-primary)]">{name}</h1>
          {job ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {job.description} · cron <span className="font-mono">{job.pattern}</span> UTC
            </p>
          ) : null}
        </div>
        {job ? (
          <PermissionButton permission="platform.jobs.trigger" onClick={() => setTriggering(job)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Run now
          </PermissionButton>
        ) : null}
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {runs.isError ? <ConsoleApiErrorPanel error={runs.error} onRetry={() => void runs.refetch()} title="Unable to load runs" /> : null}
      {runs.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading runs…</p> : null}
      {runs.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">This job has not run since run history started being recorded.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2">Triggered by</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((run) => (
                <tr key={run.id} data-testid="job-run" className="cursor-pointer align-top hover:bg-[var(--color-surface-50)]" onClick={() => setOpen(open === run.id ? null : run.id)}>
                  <td className="px-3 py-2 text-xs">{new Date(run.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <StatusPill run={run} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{formatDuration(run.durationMs)}</td>
                  <td className="px-3 py-2 text-xs">
                    {run.triggeredBy === "SCHEDULE" ? "Schedule" : <span className="font-mono">{run.triggeredBy}</span>}
                    {run.reason ? <p className="text-[var(--color-text-muted)]">{run.reason}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-700">
                    {run.error ?? ""}
                    {open === run.id && run.result ? (
                      <div className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-50)] p-2 text-[var(--color-text-primary)]">
                        <DataTree value={run.result} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {runs.hasNextPage ? (
        <button type="button" onClick={() => void runs.fetchNextPage()} disabled={runs.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          Load more
        </button>
      ) : null}
      <TriggerDialog job={triggering} onClose={() => setTriggering(null)} onQueued={setMessage} />
    </div>
  );
}
