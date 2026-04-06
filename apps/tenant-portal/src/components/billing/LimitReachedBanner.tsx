import { Link } from "react-router-dom";

type LimitReachedBannerProps = {
  used: number;
  limit: number;
};

export function LimitReachedBanner({ used, limit }: LimitReachedBannerProps) {
  if (used < limit || limit <= 0) {
    return null;
  }

  return (
    <div className="border-b border-red-300 bg-red-100 px-4 py-2 text-sm text-red-800">
      Shipment limit reached. Upgrade your plan to continue.{" "}
      <Link to="/settings?tab=billing" className="font-semibold underline">
        Upgrade
      </Link>
    </div>
  );
}
