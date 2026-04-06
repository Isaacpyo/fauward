type UsageWarningBannerProps = {
  used: number;
  limit: number;
};

export function UsageWarningBanner({ used, limit }: UsageWarningBannerProps) {
  if (limit <= 0) {
    return null;
  }
  const ratio = used / limit;
  if (ratio < 0.8 || ratio >= 1) {
    return null;
  }
  const percentage = Math.round(ratio * 100);

  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      You've used {percentage}% of your monthly shipments.
    </div>
  );
}
