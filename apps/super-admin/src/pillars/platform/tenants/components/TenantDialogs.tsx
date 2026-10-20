import { useEffect, useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import {
  type CloseResult,
  type FeatureOverride,
  type SuspendResult,
  type SuspensionRecord,
  type TenantDetail,
  type TenantPlan,
  useCloseTenant,
  useCreateFeatureOverride,
  useCreatePlanOverride,
  useRevokeFeatureOverride,
  useRevokePlanOverride,
  useSuspendTenant,
  useUnsuspendTenant,
  useUpdateLimits
} from "../api";

// Every tenant action is a dangerous ActionDialog (reason + fresh MFA through the console client). Results are reported
// by the caller through onDone, only after the API confirms.

const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const field = "mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--fauward-navy)]";

export const SUSPENSION_CATEGORIES = [
  { value: "BILLING", label: "Billing" },
  { value: "FRAUD", label: "Fraud" },
  { value: "AUP", label: "Acceptable use" },
  { value: "SECURITY", label: "Security" },
  { value: "LEGAL", label: "Legal" },
  { value: "OTHER", label: "Other" }
] as const;

type TenantRef = { id: string; name: string; slug: string };

export function SuspendTenantDialog({ tenant, open, onClose, onDone }: { tenant: TenantRef | null; open: boolean; onClose: () => void; onDone: (result: SuspendResult) => void }) {
  const suspend = useSuspendTenant();
  const [category, setCategory] = useState("");
  const [publicReason, setPublicReason] = useState("");
  useEffect(() => {
    if (open) {
      setCategory("");
      setPublicReason("");
    }
  }, [open]);
  if (!tenant) return null;
  return (
    <ActionDialog
      open={open}
      title={`Suspend ${tenant.name}?`}
      description="Tenant users lose access to everything except billing and the appeal form. Tenant admins are notified."
      confirmLabel="Suspend tenant"
      dangerous
      validate={() => (category ? null : "Choose a reason category.")}
      onClose={onClose}
      onSubmit={async (reason) => onDone(await suspend.mutateAsync({ tenantId: tenant.id, category, reason, publicReason: publicReason.trim() || undefined }))}
    >
      <div>
        <label className={label} htmlFor="suspend-category">
          Reason category
        </label>
        <select id="suspend-category" value={category} onChange={(event) => setCategory(event.target.value)} className={field}>
          <option value="">Choose…</option>
          {SUSPENSION_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="suspend-public-reason">
          Message shown to the tenant (optional — a standard text for the category is used otherwise)
        </label>
        <textarea id="suspend-public-reason" rows={2} value={publicReason} onChange={(event) => setPublicReason(event.target.value)} className={field} />
      </div>
    </ActionDialog>
  );
}

export function UnsuspendTenantDialog({
  tenant,
  active,
  open,
  onClose,
  onDone
}: {
  tenant: TenantRef | null;
  active: SuspensionRecord[];
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const unsuspend = useUnsuspendTenant();
  const [choice, setChoice] = useState("");
  useEffect(() => {
    if (open) setChoice(active.length === 1 ? active[0].id : "");
  }, [open, active]);
  if (!tenant) return null;
  return (
    <ActionDialog
      open={open}
      title={`Lift a suspension on ${tenant.name}`}
      description="The tenant becomes active only when no other suspension cause remains."
      confirmLabel="Lift suspension"
      dangerous
      validate={() => (choice ? null : "Choose which suspension to lift.")}
      onClose={onClose}
      onSubmit={async (reason) => {
        const result = await unsuspend.mutateAsync({ tenantId: tenant.id, ...(choice === "ALL" ? { all: true } : { suspensionId: choice }), reason });
        onDone(result.tenant.status === "SUSPENDED" ? `Lifted ${result.lifted.length} cause(s); ${result.remaining.length} still active, so ${tenant.name} stays suspended.` : `${tenant.name} is active again.`);
      }}
    >
      <fieldset>
        <legend className={label}>Suspension to lift</legend>
        <div className="mt-1 space-y-1">
          {active.map((record) => (
            <label key={record.id} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] p-2 text-sm">
              <input type="radio" name="suspension" value={record.id} checked={choice === record.id} onChange={() => setChoice(record.id)} />
              <span>
                <span className="font-semibold">
                  {record.source} · {record.category}
                </span>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {record.reason} — since {new Date(record.createdAt).toLocaleString()}
                </span>
              </span>
            </label>
          ))}
          {active.length > 1 ? (
            <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] p-2 text-sm">
              <input type="radio" name="suspension" value="ALL" checked={choice === "ALL"} onChange={() => setChoice("ALL")} />
              Lift all {active.length} causes
            </label>
          ) : null}
        </div>
      </fieldset>
    </ActionDialog>
  );
}

const OVERRIDE_PLANS: TenantPlan[] = ["STARTER", "PRO", "ENTERPRISE"];

export function PlanOverrideDialog({ tenant, billingPlan, open, onClose, onDone }: { tenant: TenantRef | null; billingPlan?: TenantPlan; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const create = useCreatePlanOverride();
  const [plan, setPlan] = useState<TenantPlan | "">("");
  const [expiresAt, setExpiresAt] = useState("");
  useEffect(() => {
    if (open) {
      setPlan("");
      setExpiresAt("");
    }
  }, [open]);
  if (!tenant) return null;
  return (
    <ActionDialog
      open={open}
      title={`Override the plan for ${tenant.name}`}
      description={`Billing plan stays ${billingPlan ?? "unchanged"}; the override changes what the tenant can use. Any current override is revoked.`}
      confirmLabel="Apply override"
      dangerous
      validate={() => {
        if (!plan) return "Choose a plan.";
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "The expiry must be in the future.";
        return null;
      }}
      onClose={onClose}
      onSubmit={async (reason) => {
        const result = await create.mutateAsync({ tenantId: tenant.id, plan: plan as TenantPlan, reason, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
        onDone(`${tenant.name} now has ${result.override.plan}${result.override.expiresAt ? ` until ${new Date(result.override.expiresAt).toLocaleString()}` : ""}.`);
      }}
    >
      <div>
        <label className={label} htmlFor="override-plan">
          Plan
        </label>
        <select id="override-plan" value={plan} onChange={(event) => setPlan(event.target.value as TenantPlan)} className={field}>
          <option value="">Choose…</option>
          {OVERRIDE_PLANS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="override-expiry">
          Expires (optional)
        </label>
        <input id="override-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={field} />
      </div>
    </ActionDialog>
  );
}

export function RevokePlanOverrideDialog({ tenant, override, open, onClose, onDone }: { tenant: TenantRef; override: TenantDetail["plan"]["planOverride"]; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const revoke = useRevokePlanOverride();
  if (!override) return null;
  return (
    <ActionDialog
      open={open}
      title={`Revoke the ${override.plan} override?`}
      description={`${tenant.name} goes back to its billing plan straight away.`}
      confirmLabel="Revoke override"
      dangerous
      onClose={onClose}
      onSubmit={async (reason) => {
        await revoke.mutateAsync({ tenantId: tenant.id, overrideId: override.id, reason });
        onDone(`The ${override.plan} override for ${tenant.name} was revoked.`);
      }}
    />
  );
}

export function FeatureOverrideDialog({ tenant, featureKeys, open, onClose, onDone }: { tenant: TenantRef; featureKeys: string[]; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const create = useCreateFeatureOverride();
  const [featureKey, setFeatureKey] = useState("");
  const [enabled, setEnabled] = useState<"true" | "false" | "">("");
  const [expiresAt, setExpiresAt] = useState("");
  useEffect(() => {
    if (open) {
      setFeatureKey("");
      setEnabled("");
      setExpiresAt("");
    }
  }, [open]);
  return (
    <ActionDialog
      open={open}
      title={`Feature override for ${tenant.name}`}
      description="Switches one feature on or off for this tenant regardless of its plan. Takes effect on the tenant's next request."
      confirmLabel="Save override"
      dangerous
      validate={() => {
        if (!featureKey) return "Choose a feature.";
        if (!enabled) return "Choose on or off.";
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "The expiry must be in the future.";
        return null;
      }}
      onClose={onClose}
      onSubmit={async (reason) => {
        await create.mutateAsync({ tenantId: tenant.id, featureKey, enabled: enabled === "true", reason, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
        onDone(`${featureKey} is now ${enabled === "true" ? "on" : "off"} for ${tenant.name}.`);
      }}
    >
      <div>
        <label className={label} htmlFor="feature-key">
          Feature
        </label>
        <select id="feature-key" value={featureKey} onChange={(event) => setFeatureKey(event.target.value)} className={field}>
          <option value="">Choose…</option>
          {featureKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="feature-enabled">
          Setting
        </label>
        <select id="feature-enabled" value={enabled} onChange={(event) => setEnabled(event.target.value as "true" | "false")} className={field}>
          <option value="">Choose…</option>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="feature-expiry">
          Expires (optional)
        </label>
        <input id="feature-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={field} />
      </div>
    </ActionDialog>
  );
}

export function RevokeFeatureOverrideDialog({ tenant, override, open, onClose, onDone }: { tenant: TenantRef; override: FeatureOverride | null; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const revoke = useRevokeFeatureOverride();
  if (!override) return null;
  return (
    <ActionDialog
      open={open}
      title={`Revoke the ${override.featureKey} override?`}
      description={`${tenant.name} goes back to its plan's setting for ${override.featureKey}.`}
      confirmLabel="Revoke override"
      dangerous
      onClose={onClose}
      onSubmit={async (reason) => {
        await revoke.mutateAsync({ tenantId: tenant.id, overrideId: override.id, reason });
        onDone(`The ${override.featureKey} override for ${tenant.name} was revoked.`);
      }}
    />
  );
}

function parseLimit(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= -1 ? parsed : Number.NaN;
}

export function LimitsDialog({ tenant, detail, open, onClose, onDone }: { tenant: TenantRef; detail: TenantDetail; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const update = useUpdateLimits();
  const [values, setValues] = useState({ maxStaff: "", maxShipmentsPm: "", maxOrganisations: "" });
  const [resetToPlan, setResetToPlan] = useState(false);
  useEffect(() => {
    if (open) {
      const limits = detail.entitlements.limits;
      setValues({ maxStaff: String(limits.maxStaff), maxShipmentsPm: String(limits.maxShipmentsPm), maxOrganisations: String(limits.maxOrganisations) });
      setResetToPlan(false);
    }
  }, [open, detail]);
  const parsed = { maxStaff: parseLimit(values.maxStaff), maxShipmentsPm: parseLimit(values.maxShipmentsPm), maxOrganisations: parseLimit(values.maxOrganisations) };
  return (
    <ActionDialog
      open={open}
      title={`Limits for ${tenant.name}`}
      description="-1 means unlimited. Lowering staff below the current head-count blocks new invites until seats free up."
      confirmLabel={resetToPlan ? "Use plan limits" : "Save limits"}
      dangerous
      validate={() => (!resetToPlan && Object.values(parsed).some((value) => Number.isNaN(value)) ? "Limits must be whole numbers (-1 = unlimited)." : null)}
      onClose={onClose}
      onSubmit={async (reason) => {
        await update.mutateAsync(resetToPlan ? { tenantId: tenant.id, resetToPlan: true, reason } : { tenantId: tenant.id, ...parsed, reason });
        onDone(resetToPlan ? `${tenant.name} now uses its plan's limits.` : `Limits saved for ${tenant.name}.`);
      }}
    >
      {(["maxStaff", "maxShipmentsPm", "maxOrganisations"] as const).map((key) => (
        <div key={key}>
          <label className={label} htmlFor={`limit-${key}`}>
            {key === "maxStaff" ? "Staff seats" : key === "maxShipmentsPm" ? "Shipments per month" : "Organisations"}
          </label>
          <input id={`limit-${key}`} inputMode="numeric" disabled={resetToPlan} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className={field} />
        </div>
      ))}
      {detail.entitlements.limitsSource === "tenant" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={resetToPlan} onChange={(event) => setResetToPlan(event.target.checked)} />
          Go back to the plan's limits
        </label>
      ) : null}
    </ActionDialog>
  );
}

/** Close replaces delete: typing the slug confirms (ConfirmByTyping), legal holds block it, nothing is purged now. */
export function CloseTenantDialog({ tenant, open, onClose, onDone }: { tenant: TenantRef; open: boolean; onClose: () => void; onDone: (result: CloseResult) => void }) {
  const close = useCloseTenant();
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  return (
    <ActionDialog
      open={open}
      title={`Close ${tenant.name}?`}
      description="The tenant is cancelled for good: users can no longer sign in, admins are notified and data is kept for the retention period before it can be purged. A closed tenant is never reactivated."
      confirmLabel="Close tenant"
      dangerous
      validate={() => (typed.trim().toLowerCase() === tenant.slug.toLowerCase() ? null : `Type ${tenant.slug} to confirm.`)}
      onClose={onClose}
      onSubmit={async (reason) => onDone(await close.mutateAsync({ tenantId: tenant.id, reason, confirmSlug: typed }))}
    >
      <div>
        <label className={label} htmlFor="close-confirm">
          Type the tenant slug <span className="font-mono">{tenant.slug}</span> to confirm
        </label>
        <input id="close-confirm" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} className={field} />
      </div>
    </ActionDialog>
  );
}
