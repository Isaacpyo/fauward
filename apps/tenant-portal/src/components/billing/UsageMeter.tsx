import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type UsageMeterProps = {
  label: string;
  used: number;
  limit: number;
  onUpgrade?: () => void;
};

export function UsageMeter({ label, used, limit, onUpgrade }: UsageMeterProps) {
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = percentage >= 100 ? "error" : percentage >= 80 ? "warning" : "success";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-gray-600">
          {used} / {limit}
        </p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-gray-200">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "success"
              ? "bg-[var(--color-success)]"
              : tone === "warning"
                ? "bg-[var(--color-warning)]"
                : "bg-[var(--color-error)]"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {percentage >= 100 ? (
        <div className="mt-2">
          <p className="text-xs text-red-700">Limit reached. Upgrade to continue creating shipments.</p>
          {onUpgrade ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={onUpgrade}>
              Upgrade
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
