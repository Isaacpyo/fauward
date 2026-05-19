import { Link } from "react-router-dom";

type SaveOfferBannerProps = {
  offer?: {
    discount: number;
    validUntil: string;
    code: string;
  };
};

export function SaveOfferBanner({ offer }: SaveOfferBannerProps) {
  if (!offer) return null;

  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
      Save offer available: use <span className="font-semibold">{offer.code}</span> before{" "}
      {new Date(offer.validUntil).toLocaleDateString()}.{" "}
      <Link to="/settings?tab=billing" className="font-semibold underline">
        Apply now
      </Link>
      .
    </div>
  );
}
