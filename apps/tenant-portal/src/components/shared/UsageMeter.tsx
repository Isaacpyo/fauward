import { cn } from "@/lib/utils";

type UsageMeterProps = {
  used: number;
  total: number;
};

export function UsageMeter({ used, total }: UsageMeterProps) {
  const percentage = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const tone = percentage >= 100 ? "error" : percentage >= 80 ? "warning" : "success";

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {used} / {total}
        </span>
        <span>{percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "success"
              ? "bg-[var(--color-success)]"
              : tone === "warning"
                ? "bg-[var(--color-warning)]"
                : "bg-[var(--color-error)]"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
