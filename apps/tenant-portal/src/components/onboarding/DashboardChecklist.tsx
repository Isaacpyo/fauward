import { Link } from "react-router-dom";
import { X } from "lucide-react";

type ChecklistState = {
  brandConfigured: boolean;
  firstShipmentCreated: boolean;
  teamInvited: boolean;
  paymentsConnected: boolean;
  domainConfigured: boolean;
};

type DashboardChecklistProps = {
  state: ChecklistState;
  onDismiss: () => void;
};

function Item({ done, label, to, action }: { done: boolean; label: string; to: string; action: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
      <span className={done ? "text-green-700" : "text-gray-700"}>
        {done ? "✅" : "⬜"} {label}
      </span>
      {!done ? (
        <Link to={to} className="text-[var(--tenant-primary)] hover:underline">
          {action}
        </Link>
      ) : null}
    </li>
  );
}

export function DashboardChecklist({ state, onDismiss }: DashboardChecklistProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Launch checklist</h3>
        <button type="button" onClick={onDismiss} className="rounded p-1 text-gray-500 hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>
      <ul className="space-y-2">
        <Item done={state.brandConfigured} label="Brand configured" to="/onboarding" action="Set up your brand ->" />
        <Item done={state.firstShipmentCreated} label="First shipment created" to="/shipments/create" action="Create a shipment ->" />
        <Item done={state.teamInvited} label="Team invited" to="/team" action="Invite team members ->" />
        <Item done={state.paymentsConnected} label="Payments connected" to="/settings?tab=integrations" action="Connect payment gateway ->" />
        <Item done={state.domainConfigured} label="Custom domain" to="/settings?tab=branding" action="Configure domain ->" />
      </ul>
    </section>
  );
}
