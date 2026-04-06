type BrandPreviewProps = {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
};

export function BrandPreview({ companyName, logoUrl, primaryColor }: BrandPreviewProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Live preview</h3>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName || "Company"} className="h-7 w-auto object-contain" />
          ) : (
            <div className="rounded px-2 py-1 text-xs font-semibold text-white" style={{ background: primaryColor }}>
              {companyName ? companyName.slice(0, 1).toUpperCase() : "B"}
            </div>
          )}
          <p className="text-sm font-medium text-gray-900">{companyName || "Your company"}</p>
        </div>
        <div className="bg-gray-50 p-4">
          <p className="font-mono text-sm text-gray-900">FWD-2026-00091</p>
          <div className="mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold text-white" style={{ background: primaryColor }}>
            OUT FOR DELIVERY
          </div>
        </div>
      </div>
    </div>
  );
}
