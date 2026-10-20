import { QueryClient } from "@tanstack/react-query";

import { toConsoleApiError } from "./console-api-error";

/** Retry only transient failures (network / 5xx); 4xx answers are final and are rendered at once. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  const { status } = toConsoleApiError(error);
  return (status === 0 || status >= 500) && failureCount < 2;
}

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
