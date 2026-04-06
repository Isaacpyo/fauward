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
  new StaleWhileRevalidate({ cacheName: "driver-app-shell" })
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/driver") || url.pathname.startsWith("/api/route"),
  new NetworkFirst({
    cacheName: "driver-route-data",
    networkTimeoutSeconds: 2
  })
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

