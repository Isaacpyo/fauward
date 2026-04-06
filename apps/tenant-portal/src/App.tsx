import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "@/router";
import { useTenant } from "@/hooks/useTenant";
import { Skeleton } from "@/components/ui/Skeleton";

export default function App() {
  const { isLoading, tenant } = useTenant();

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
