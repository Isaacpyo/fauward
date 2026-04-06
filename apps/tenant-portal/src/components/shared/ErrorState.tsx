import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/Button";

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Try again.",
  onRetry
}: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-8">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 text-red-600" />
        <div>
          <h3 className="text-base font-semibold text-red-700">{title}</h3>
          <p className="mt-1 text-sm text-red-700">{description}</p>
          {onRetry ? (
            <Button variant="danger" size="sm" className="mt-4" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
