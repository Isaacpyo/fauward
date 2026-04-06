import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";

type SuspendedOverlayProps = {
  active: boolean;
};

export function SuspendedOverlay({ active }: SuspendedOverlayProps) {
  if (!active) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-lg border border-red-300 bg-white p-6">
        <h2 className="text-xl font-semibold text-red-700">Account suspended</h2>
        <p className="mt-2 text-sm text-gray-700">
          Access is temporarily restricted due to failed billing. Update payment method to restore service.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings?tab=billing">Open billing settings</Link>
        </Button>
      </div>
    </div>
  );
}
