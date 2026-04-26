import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import App from "@/App";
import { queryClient } from "@/lib/queryClient";
import { initTenantSlug } from "@/lib/initTenantSlug";
import "@/index.css";

// Resolve subdomain slug before React boots
initTenantSlug();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
