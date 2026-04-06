export type QueueRow = {
  name: string;
  depth: number;
  processingRate: string;
  dlqDepth: number;
  oldestAge: string;
  status: "healthy" | "warning" | "critical";
};

type QueueTableProps = {
  rows: QueueRow[];
  onSelectQueue: (name: string) => void;
};

export function QueueTable({ rows, onSelectQueue }: QueueTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-white">
      <table className="w-full min-w-[900px] text-xs">
        <thead className="bg-[var(--color-surface-50)]">
          <tr>
            {["Queue Name", "Depth", "Processing Rate", "DLQ Depth", "Oldest Message Age", "Status"].map((header) => (
              <th key={header} className="border-b border-[var(--color-border)] px-3 py-2 text-left text-[var(--color-text-muted)]">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className={row.dlqDepth > 0 ? "bg-red-50" : ""}>
              <td className="px-3 py-2 font-mono">
                <button type="button" className="underline" onClick={() => onSelectQueue(row.name)}>
                  {row.name}
                </button>
              </td>
              <td className="px-3 py-2">{row.depth}</td>
              <td className="px-3 py-2">{row.processingRate}</td>
              <td className="px-3 py-2">{row.dlqDepth}</td>
              <td className="px-3 py-2">{row.oldestAge}</td>
              <td className="px-3 py-2 uppercase">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

