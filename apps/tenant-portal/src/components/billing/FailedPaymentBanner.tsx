import { Link } from "react-router-dom";

type FailedPaymentBannerProps = {
  visible: boolean;
  nextRetryAt?: string | null;
};

export function FailedPaymentBanner({ visible, nextRetryAt }: FailedPaymentBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="border-b border-red-300 bg-red-100 px-4 py-2 text-sm text-red-800">
      Failed payment detected{nextRetryAt ? `; next retry ${new Date(nextRetryAt).toLocaleString()}` : ""}.{" "}
      <Link to="/settings?tab=billing" className="font-semibold underline">
        Update payment method
      </Link>
      .
    </div>
  );
}
