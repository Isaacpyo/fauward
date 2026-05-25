import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  FileSpreadsheet,
  MapPinned,
  ShieldCheck,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

interface LiveCard {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  /** Renders a small red count pill when > 0. */
  count?: number;
}

interface ComingSoonCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

const comingSoon: ComingSoonCard[] = [
  {
    title: "Exception triage",
    description: "Central view of failed deliveries, SLA breaches, and escalations needing manager action.",
    icon: AlertTriangle,
  },
  {
    title: "Daily ops report",
    description: "Auto-generated end-of-day summary: delivered, failed, cash collected, exceptions cleared.",
    icon: FileSpreadsheet,
  },
  {
    title: "Real-time alerts",
    description: "Configurable SLA and route alerts pushed to managers as they happen.",
    icon: Bell,
  },
  {
    title: "COD reconciliation",
    description: "Match cash collected in the field against bank deposits and flag discrepancies.",
    icon: Wallet,
  },
];

export function OperationsOverviewPage() {
  // Lightweight count for the Permission Requests card; reuses the same
  // endpoint the dedicated page uses, so the response is shared in the cache.
  const pendingRequestsQuery = useQuery({
    queryKey: ["permission-requests", "PENDING"],
    queryFn: async () => {
      const res = await api.get<{ requests: Array<{ id: string }> }>("/v1/permission-requests", {
        params: { status: "PENDING" },
      });
      return res.data.requests ?? [];
    },
    refetchInterval: 30_000,
  });

  const pendingCount = pendingRequestsQuery.data?.length ?? 0;

  const liveCards: LiveCard[] = [
    {
      title: "Fauward Go",
      description: "Field operations cockpit — KPIs, routes, stops, and live driver telemetry.",
      to: "/fauward-go",
      icon: BriefcaseBusiness,
    },
    {
      title: "Fleet",
      description: "Vehicles, field operators, and assignments.",
      to: "/fleet",
      icon: Truck,
    },
    {
      title: "Live map",
      description: "Real-time positions of every active field operator.",
      to: "/operations/live-map",
      icon: MapPinned,
    },
    {
      title: "Permission requests",
      description: "Approve or reject field-operator requests to take over a shipment.",
      to: "/operations/permission-requests",
      icon: ShieldCheck,
      count: pendingCount,
    },
  ];

  return (
    <PageShell
      title="Control Tower"
      description="Everything that keeps shipments moving — dispatching, routing, fleet, live oversight, and approvals."
      breadcrumb={[{ label: "Control Tower" }]}
    >
      <div className="space-y-8">
        <section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {liveCards.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[var(--tenant-primary)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-light)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-full bg-[color:var(--tenant-primary-soft)] p-2.5 text-[var(--tenant-primary)]">
                    <card.icon className="h-5 w-5" />
                  </div>
                  {card.count && card.count > 0 ? (
                    <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
                      {card.count > 99 ? "99+" : card.count}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900 group-hover:text-[var(--tenant-primary)]">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-sm text-gray-600">{card.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Coming soon</h2>
            <p className="text-xs text-gray-400">On the roadmap — not yet built.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {comingSoon.map((card) => (
              <div
                key={card.title}
                aria-disabled
                className="flex cursor-not-allowed flex-col rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-full bg-white p-2.5 text-gray-400 shadow-sm">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-500">{card.title}</h3>
                <p className="mt-1.5 text-sm text-gray-500">{card.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
