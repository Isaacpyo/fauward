import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "@/router";
import { useTenant } from "@/hooks/useTenant";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiErrorMessage } from "@/lib/api-error";

export default function App() {
  const { isLoading, isError, error, refetch, tenant } = useTenant();

  if (isError && !tenant) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-xl pt-24">
          <ErrorState
            title="Your workspace could not be loaded"
            description={apiErrorMessage(error, "The workspace settings could not be fetched.")}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  if (isLoading && !tenant) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-[65vh] w-full" />
        </div>
      </div>
    );
  }

  return (
    <QueryErrorResetBoundary>
      {() => (
        <BrowserRouter>
          <AppRouter />
          <ReactQueryDevtools initialIsOpen={false} />
        </BrowserRouter>
      )}
    </QueryErrorResetBoundary>
  );
}
