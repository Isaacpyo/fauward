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
      <div className="rounded-xl border border-gray-200 bg-white p-4">
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
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <h2 className="text-base font-semibold text-red-700">Could not load this page</h2>
            <p className="mt-1 text-sm text-red-600">An error occurred while loading the content. Please try again.</p>
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

  if (state === "permission-denied") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-8">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
          </svg>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Permission denied</h2>
            <p className="mt-1 text-sm text-gray-600">You don&apos;t have access to this resource. Contact your administrator.</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === "plan-gated") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
          <div>
            <h2 className="text-base font-semibold text-amber-900">Feature gated by plan</h2>
            <p className="mt-1 text-sm text-amber-800">Upgrade your plan to access this feature.</p>
            <Button variant="amber" size="sm" className="mt-4">Upgrade plan</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-gray-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
