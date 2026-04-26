import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

const reportTypes = [
  { label: "Shipments", value: "shipments" },
  { label: "Revenue", value: "revenue" },
  { label: "Returns", value: "returns" },
  { label: "Tickets", value: "tickets" },
  { label: "Staff Performance", value: "staff" },
  { label: "Customers", value: "customers" }
];

const formatOptions = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" },
  { label: "PDF", value: "pdf" }
];

function presetRange(preset: string) {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === "today") start.setDate(now.getDate());
  if (preset === "yesterday") start.setDate(now.getDate() - 1);
  if (preset === "7d") start.setDate(now.getDate() - 7);
  if (preset === "30d") start.setDate(now.getDate() - 30);
  if (preset === "90d") start.setDate(now.getDate() - 90);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo };
}

export function ReportsPage() {
  const initial = presetRange("30d");
  const [reportType, setReportType] = useState("shipments");
  const [format, setFormat] = useState("csv");
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState("weekly");
  const [recipients, setRecipients] = useState("");

  const generate = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/v1/reports/${reportType}`, {
        params: { format, dateFrom, dateTo },
        responseType: format === "json" ? "json" : "blob"
      });

      if (format === "json") {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `fauward-report-${reportType}-${dateFrom}-${dateTo}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = response.data as Blob;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `fauward-report-${reportType}-${dateFrom}-${dateTo}.${format}`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell title="Reports" description="Generate exports across shipments, revenue, returns, support, staff, and customers.">
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <Select value={reportType} onValueChange={setReportType} options={reportTypes} />
          <Select value={format} onValueChange={setFormat} options={formatOptions} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { const range = presetRange("today"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { const range = presetRange("yesterday"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>
            Yesterday
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { const range = presetRange("7d"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>
            Last 7 days
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { const range = presetRange("30d"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>
            Last 30 days
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { const range = presetRange("90d"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>
            Last 90 days
          </Button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Advanced filters</h3>
          <p className="mt-1 text-sm text-gray-600">Additional filters are auto-applied by report type on backend endpoints.</p>
          <Button className="mt-4" onClick={generate} disabled={loading}>
            {loading ? "Generating..." : "Generate Report"}
          </Button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Scheduled Reports (Pro+)</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Select
              value={schedule}
              onValueChange={setSchedule}
              options={[
                { label: "Daily", value: "daily" },
                { label: "Weekly", value: "weekly" },
                { label: "Monthly", value: "monthly" }
              ]}
            />
            <Input
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="Recipients: ops@company.com, manager@company.com"
            />
          </div>
          <Button variant="secondary" className="mt-3">
            Save schedule
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
