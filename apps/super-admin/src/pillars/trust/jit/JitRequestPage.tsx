import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFERRED_PERMISSIONS, PERMISSIONS, type Permission } from "@fauward/internal-rbac";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { JIT_DURATIONS, JIT_MIN_REASON, JIT_ROOT_MAX_MINUTES } from "@/components/service-kit/JitRequestDialog";
import { useMe } from "@/lib/use-me";
import { type JitRequest, useCreateJitRequest, useMyJitRequests, useRevokeJitGrant } from "./api";
import { JitNav } from "./components/JitNav";
import { JitTable, when } from "./components/JitTable";

const ROOT: Permission = "trust.iam.root";
const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const field = "mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const labelCls = "block text-xs font-semibold text-[var(--color-text-muted)]";

const REQUESTABLE = PERMISSIONS.filter((permission) => !(DEFERRED_PERMISSIONS as readonly string[]).includes(permission));

function isRequestable(value: string | null): value is Permission {
  return value !== null && (REQUESTABLE as readonly string[]).includes(value);
}

function RequestForm() {
  const [params] = useSearchParams();
  const preset = params.get("permission");
  const me = useMe().data;
  const held = useMemo(() => new Set(me?.permissions ?? []), [me?.permissions]);
  const options = REQUESTABLE.filter((permission) => !held.has(permission));
  const [permission, setPermission] = useState<Permission | "">(isRequestable(preset) ? preset : "");
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [hardwareKeyAssertion, setHardwareKeyAssertion] = useState("");
  const create = useCreateJitRequest();

  const root = permission === ROOT;
  const durations = root ? JIT_DURATIONS.filter((minutes) => minutes <= JIT_ROOT_MAX_MINUTES) : JIT_DURATIONS;
  const effectiveDuration = durations.includes(durationMinutes) ? durationMinutes : durations[durations.length - 1];
  const canSubmit = Boolean(permission) && reason.trim().length >= JIT_MIN_REASON && (!root || hardwareKeyAssertion.length > 0) && !create.isPending;

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-sm font-semibold">New request</h2>
      <p className="text-xs text-[var(--color-text-muted)]">An approver other than you must grant it. Approved access appears in your session within a minute and ends at its expiry.</p>
      <div>
        <label className={labelCls} htmlFor="jit-permission">
          Permission
        </label>
        <select id="jit-permission" value={permission} onChange={(event) => setPermission(event.target.value as Permission | "")} className={field}>
          <option value="">Choose a permission…</option>
          {options.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {preset && held.has(preset) ? <p className="mt-1 text-xs text-green-800">You already hold {preset}.</p> : null}
      </div>
      <div>
        <label className={labelCls} htmlFor="jit-request-duration">
          Duration{root ? ` (ROOT: at most ${JIT_ROOT_MAX_MINUTES} minutes)` : ""}
        </label>
        <select id="jit-request-duration" value={effectiveDuration} onChange={(event) => setDurationMinutes(Number(event.target.value))} className={field}>
          {durations.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? "s" : ""}`}
            </option>
          ))}
        </select>
      </div>
      {root ? (
        <div>
          <label className={labelCls} htmlFor="jit-hardware-key">
            Hardware key assertion (ROOT needs two approvers and a hardware key)
          </label>
          <input id="jit-hardware-key" type="password" autoComplete="off" value={hardwareKeyAssertion} onChange={(event) => setHardwareKeyAssertion(event.target.value)} className={field} />
        </div>
      ) : null}
      <label className="block">
        <span className={`${labelCls} mb-1`}>Reason (approvers see it; at least {JIT_MIN_REASON} characters)</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className={field} />
      </label>
      <button
        type="button"
        disabled={!canSubmit}
        className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        onClick={() =>
          permission &&
          create.mutate(
            { permission, reason: reason.trim(), durationMinutes: effectiveDuration, ...(root ? { hardwareKeyAssertion } : {}) },
            {
              onSuccess: () => {
                setReason("");
                setHardwareKeyAssertion("");
              }
            }
          )
        }
      >
        {create.isPending ? "Sending…" : "Send request"}
      </button>
      {create.isError ? <ConsoleApiErrorPanel error={create.error} title="The request was not sent" /> : null}
      {create.isSuccess ? (
        <p role="status" className="text-sm text-green-800">
          Request for <code className="font-mono text-xs">{create.data.permission}</code> sent at {when(create.data.createdAt)}. Approvers have been notified.
        </p>
      ) : null}
    </section>
  );
}

export function JitRequestPage() {
  const mine = useMyJitRequests();
  const revoke = useRevokeJitGrant();
  const [ending, setEnding] = useState<JitRequest | null>(null);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Request access</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Temporary, approved elevation for one permission.</p>
        <JitNav />
      </header>
      <RequestForm />
      <section className={card}>
        <h2 className="text-sm font-semibold">My requests and grants</h2>
        {mine.isError ? <ConsoleApiErrorPanel error={mine.error} onRetry={() => void mine.refetch()} title="Unable to load your requests" /> : null}
        {mine.isLoading ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
        {mine.data ? (
          <JitTable
            testId="jit-my-requests"
            rows={mine.data}
            columns={["approvals", "outcome"]}
            empty="You have not requested access yet."
            actions={(row) =>
              row.state === "ACTIVE" ? (
                <button type="button" onClick={() => setEnding(row)} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                  End now
                </button>
              ) : null
            }
          />
        ) : null}
      </section>
      <ActionDialog
        open={ending !== null}
        title="End this grant now?"
        description={ending ? <>Your access to <code className="font-mono text-xs">{ending.permission}</code> ends immediately.</> : null}
        confirmLabel="End grant"
        onClose={() => setEnding(null)}
        onSubmit={async () => {
          if (ending) await revoke.mutateAsync({ id: ending.id, reason: "Ended by the requester" });
        }}
      />
    </div>
  );
}
