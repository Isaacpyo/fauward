import styles from "./styles.css";
import { createTrackingWidget } from "./widget.js";

function resolveContainer(containerSelector) {
  if (containerSelector) {
    const selected = document.querySelector(containerSelector);
    if (selected) {
      return selected;
    }
  }
  const fallback = document.getElementById("fauward-tracking");
  if (fallback) {
    return fallback;
  }
  const created = document.createElement("div");
  created.id = "fauward-tracking";
  document.body.appendChild(created);
  return created;
}

function readConfig(script) {
  return {
    tenantId: script.getAttribute("data-tenant-id") || "",
    primaryColor: script.getAttribute("data-primary-color") || "#0D1F3C",
    accentColor: script.getAttribute("data-accent-color") || "#D97706",
    containerSelector: script.getAttribute("data-container") || "#fauward-tracking",
    mode: script.getAttribute("data-mode") || "default"
  };
}

function mount(script) {
  const config = readConfig(script);
  const host = resolveContainer(config.containerSelector);
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  host.style.setProperty("--fw-primary", config.primaryColor);
  host.style.setProperty("--fw-accent", config.accentColor);
  host.style.setProperty("--fw-font-family", "inherit, Inter, system-ui, sans-serif");

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadowRoot.appendChild(styleEl);

  createTrackingWidget({
    shadowRoot,
    mode: config.mode,
    tenantId: config.tenantId
  });
}

const currentScript = document.currentScript;
if (currentScript) {
  mount(currentScript);
}
