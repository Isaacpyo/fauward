import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { AppProviders } from "@/app/providers/AppProviders";
import { router } from "@/app/router";
import "@/styles/index.css";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders router={router} />
  </React.StrictMode>,
);

