import { Link } from "react-router-dom";

type TrialBannerProps = {
  days: number;
};

export function TrialBanner({ days }: TrialBannerProps) {
  if (days > 7 || days <= 0) {
    return null;
  }

  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      Your trial expires in {days} day{days === 1 ? "" : "s"}.{" "}
      <Link to="/settings?tab=billing" className="font-semibold underline">
        Upgrade now
      </Link>
      .
    </div>
  );
}
