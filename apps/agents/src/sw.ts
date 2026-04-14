/// <reference lib="webworker" />

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.destination === "document" || request.destination === "script" || request.destination === "style",
  new StaleWhileRevalidate({ cacheName: "agent-app-shell" })
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/v1/agents") || url.pathname.startsWith("/api/v1/shipments"),
  new NetworkFirst({
    cacheName: "agent-api-data",
    networkTimeoutSeconds: 3
  })
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});