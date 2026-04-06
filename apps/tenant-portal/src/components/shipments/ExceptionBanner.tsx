import { AlertTriangle, ArrowRightLeft, PhoneCall, RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { ShipmentState } from "@/types/domain";

type ExceptionBannerProps = {
  status: ShipmentState;
  reason?: string;
  onAction: (action: "reattempt" | "return" | "contact" | "escalate") => void;
};

export function ExceptionBanner({ status, reason, onAction }: ExceptionBannerProps) {
  if (status !== "EXCEPTION" && status !== "FAILED_DELIVERY") {
    return null;
  }

  const isException = status === "EXCEPTION";

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isException ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className={isException ? "text-red-700" : "text-amber-800"} />
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-semibold ${isException ? "text-red-800" : "text-amber-900"}`}>
            This shipment requires attention
          </h3>
          {reason ? (
            <p className={`mt-1 text-sm ${isException ? "text-red-700" : "text-amber-800"}`}>
              Reason: {reason}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" leftIcon={<RotateCcw size={14} />} onClick={() => onAction("reattempt")}>
              Reattempt Delivery
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<ArrowRightLeft size={14} />} onClick={() => onAction("return")}>
              Return to Sender
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<PhoneCall size={14} />} onClick={() => onAction("contact")}>
              Contact Customer
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<Send size={14} />} onClick={() => onAction("escalate")}>
              Escalate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
