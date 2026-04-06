import { FEATURE_COMPARISON_ROWS, type ComparisonValue } from "@/lib/marketing-data";

function renderComparisonValue(value: ComparisonValue) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">✓ Included</span>
    ) : (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">✕</span>
    );
  }

  return <span className="text-sm text-gray-700">{value}</span>;
}

export default function FeatureComparisonTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse">
          <thead className="sticky top-[72px] z-10 bg-gray-50">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-gray-200 bg-gray-50 px-5 py-4 text-left text-sm font-semibold text-gray-900">
                Features
              </th>
              <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-900">Starter</th>
              <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-900">Pro</th>
              <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-900">Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_COMPARISON_ROWS.map((row, index) => (
              <tr key={row.feature} className={index % 2 === 0 ? "bg-white" : "bg-gray-50/55"}>
                <td className="sticky left-0 border-b border-r border-gray-200 bg-inherit px-5 py-4 text-sm font-medium text-gray-900">
                  {row.feature}
                </td>
                <td className="border-b border-gray-200 px-5 py-4">{renderComparisonValue(row.starter)}</td>
                <td className="border-b border-gray-200 px-5 py-4">{renderComparisonValue(row.pro)}</td>
                <td className="border-b border-gray-200 px-5 py-4">{renderComparisonValue(row.enterprise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
