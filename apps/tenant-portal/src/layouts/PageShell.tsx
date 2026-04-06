import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type ShellState = "ready" | "loading" | "error" | "permission-denied" | "plan-gated";

type PageShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: Array<{ label: string; to?: string }>;
  state?: ShellState;
  onRetry?: () => void;
  children?: ReactNode;
};

function PageShellSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

export function PageShell({
  title,
  description,
  actions,
  state = "ready",
  onRetry,
  children
}: PageShellProps) {
  if (state === "loading") {
    return <PageShellSkeleton />;
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-8">
        <h2 className="text-lg font-semibold text-red-700">Could not load this page</h2>
        <p className="mt-2 text-sm text-red-700">
          An error occurred while loading the content.
        </p>
        {onRetry ? (
          <Button variant="danger" className="mt-4" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (state === "permission-denied") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-8">
        <h2 className="text-lg font-semibold text-gray-900">Permission denied</h2>
        <p className="mt-2 text-sm text-gray-600">
          You don’t have access to this resource. Contact your administrator.
        </p>
      </div>
    );
  }

  if (state === "plan-gated") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8">
        <h2 className="text-lg font-semibold text-amber-900">Feature gated by plan</h2>
        <p className="mt-2 text-sm text-amber-800">
          Upgrade your tenant plan to access this feature.
        </p>
        <Button className="mt-4">Upgrade plan</Button>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">{title}</h1>
          {description ? <p className="mt-2 text-sm text-gray-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
