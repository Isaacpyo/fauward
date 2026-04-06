const sampleRows = [
  { month: "2025-11", mrr: "£94,200", new: "£12,100", churned: "£2,400", expansion: "£5,100", net: "£14,800" },
  { month: "2025-12", mrr: "£101,500", new: "£10,900", churned: "£3,100", expansion: "£4,300", net: "£12,100" },
  { month: "2026-01", mrr: "£109,800", new: "£13,200", churned: "£1,900", expansion: "£4,500", net: "£15,800" }
];

export function RevenueCharts() {
  return (
    <div className="space-y-2">
      <section className="grid gap-2 lg:grid-cols-2">
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">MRR by plan (stacked area chart placeholder)</div>
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">Churn rate + ARPU trend (line chart placeholder)</div>
      </section>
      <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">Revenue table</h3>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)]">
              {["Month", "MRR", "New", "Churned", "Expansion", "Net change"].map((header) => (
                <th key={header} className="border-b border-[var(--color-border)] px-2 py-1.5">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row) => (
              <tr key={row.month}>
                <td className="px-2 py-1.5 font-mono">{row.month}</td>
                <td className="px-2 py-1.5">{row.mrr}</td>
                <td className="px-2 py-1.5">{row.new}</td>
                <td className="px-2 py-1.5">{row.churned}</td>
                <td className="px-2 py-1.5">{row.expansion}</td>
                <td className="px-2 py-1.5">{row.net}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

