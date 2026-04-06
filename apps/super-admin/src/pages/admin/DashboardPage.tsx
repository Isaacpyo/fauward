import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { AlertCard } from "@/components/admin/AlertCard";
import { MRRChart } from "@/components/admin/MRRChart";
import { MetricCard } from "@/components/admin/MetricCard";
import { ShipmentsChart } from "@/components/admin/ShipmentsChart";

const mrrPoints = [
  { month: "Feb", value: 74000 },
  { month: "Mar", value: 76000 },
  { month: "Apr", value: 82000 },
  { month: "May", value: 88000 },
  { month: "Jun", value: 91000 },
  { month: "Jul", value: 94500 },
  { month: "Aug", value: 97800 },
  { month: "Sep", value: 100200 },
  { month: "Oct", value: 104400 },
  { month: "Nov", value: 107100 },
  { month: "Dec", value: 110900 },
  { month: "Jan", value: 114300 },
];

const shipmentPoints = [
  { day: "D1", value: 480 },
  { day: "D2", value: 510 },
  { day: "D3", value: 470 },
  { day: "D4", value: 530 },
  { day: "D5", value: 560 },
  { day: "D6", value: 580 },
  { day: "D7", value: 590 },
  { day: "D8", value: 540 },
  { day: "D9", value: 620 },
  { day: "D10", value: 600 },
];

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Live overview of platform health, revenue, and tenant activity.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total MRR" value="£114,300" trend="↑ 8.2% vs last month" trendUp />
        <MetricCard title="Active Tenants" value="286" trend="+7 in 7 days" trendUp />
        <MetricCard title="Shipments Today" value="4,921" trend="Current UTC day" />
        <MetricCard title="New Signups (7d)" value="31" trend="↑ 18.4% conversion" trendUp />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <MRRChart points={mrrPoints} />
        <ShipmentsChart points={shipmentPoints} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <ActivityFeed
          items={[
            { id: "1", at: "2026-04-06T10:02:00Z", text: "Tenant Northline upgraded to Pro" },
            { id: "2", at: "2026-04-06T09:45:00Z", text: "Tenant Portbridge payment failed — action needed" },
            { id: "3", at: "2026-04-06T09:23:00Z", text: "Tenant Luma Logistics signed up" },
            { id: "4", at: "2026-04-06T08:51:00Z", text: "System: DLQ depth exceeded threshold (43 messages)" },
            { id: "5", at: "2026-04-06T08:30:00Z", text: "17 tenants with failed payments — review required" },
          ]}
        />
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Active alerts</h3>
          <AlertCard tone="danger" title="DLQ depth > 0" body="queue: webhook.deliveries.dlq depth: 43 — View Queue" />
          <AlertCard tone="warning" title="Error rate threshold exceeded" body="API 5xx at 2.8% over last 15 minutes." />
          <AlertCard tone="warning" title="Failed payments" body="17 tenants with failed payments — open tenants list filter." />
        </div>
      </section>
    </div>
  );
}
