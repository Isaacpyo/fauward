/**
 * Fauward embed.js
 *
 * One-liner script tenants paste on their site:
 *   <script src="https://fauward.com/embed.js" data-tenant="acme" async></script>
 *
 * Optional attributes:
 *   data-label       — Button label (default: "Ship a Package")
 *   data-api-key     — Tenant API key (used to fetch a short-lived widget token)
 *   data-widget-url  — Override widget base URL (default: https://widget.fauward.com)
 *   data-platform-url — Override platform base URL (default: https://fauward.com)
 *   data-theme       — Primary color hex (e.g. "#e11d48"), overrides Supabase branding
 *
 * Events dispatched on document:
 *   fauward:ready         — Widget loaded and ready
 *   fauward:shipment      — { detail: { trackingRef, shipmentId } } — shipment created
 *   fauward:close         — Widget closed by user
 */

(function () {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;

  const tenant = script.dataset.tenant;
  if (!tenant) {
    console.error("[Fauward] Missing data-tenant attribute on embed script.");
    return;
  }

  const label = script.dataset.label ?? "Ship a Package";
  const apiKey = script.dataset.apiKey ?? "";
  const WIDGET_BASE = (script.dataset.widgetUrl ?? "https://widget.fauward.com").replace(/\/$/, "");
  const PLATFORM_BASE = (script.dataset.platformUrl ?? "https://fauward.com").replace(/\/$/, "");
  const theme = script.dataset.theme ? encodeURIComponent(script.dataset.theme) : "";

  let widgetToken: string | null = null;
  let tokenFetchedAt = 0;
  const TOKEN_TTL_MS = 12 * 60 * 1000; // refresh 3 min before 15-min expiry

  async function fetchWidgetToken(): Promise<string | null> {
    if (!apiKey) return null;
    if (widgetToken && Date.now() - tokenFetchedAt < TOKEN_TTL_MS) return widgetToken;

    try {
      const res = await fetch(`${PLATFORM_BASE}/api/embed/token?tenant=${tenant}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        console.warn("[Fauward] Failed to fetch widget token:", res.status);
        return null;
      }
      const json = await res.json() as { token: string };
      widgetToken = json.token;
      tokenFetchedAt = Date.now();
      return widgetToken;
    } catch {
      return null;
    }
  }

  function buildWidgetUrl(token: string | null): string {
    let url = `${WIDGET_BASE}/?tenant=${encodeURIComponent(tenant!)}`;
    if (token) url += `&token=${encodeURIComponent(token)}`;
    if (theme) url += `&theme=${theme}`;
    return url;
  }

  // ─── DOM elements ──────────────────────────────────────────────────────────

  // Floating trigger button
  const btn = document.createElement("button");
  btn.id = "fauward-trigger";
  btn.textContent = label;
  btn.setAttribute("aria-label", label);
  btn.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483640",
    "background:var(--fauward-color,#D97706)",
    "color:#fff",
    "padding:12px 20px",
    "border-radius:8px",
    "border:none",
    "font-size:14px",
    "font-weight:600",
    "cursor:pointer",
    "box-shadow:0 4px 14px rgba(0,0,0,.25)",
    "font-family:system-ui,sans-serif",
    "transition:opacity .2s",
  ].join(";");

  // Overlay backdrop
  const overlay = document.createElement("div");
  overlay.id = "fauward-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Fauward shipment wizard");
  overlay.style.cssText = [
    "display:none",
    "position:fixed",
    "inset:0",
    "z-index:2147483641",
    "background:rgba(0,0,0,.55)",
    "align-items:center",
    "justify-content:center",
    "padding:16px",
  ].join(";");

  // iframe
  const iframe = document.createElement("iframe");
  iframe.id = "fauward-iframe";
  iframe.setAttribute("title", "Fauward shipment wizard");
  iframe.setAttribute("allowfullscreen", "true");
  iframe.setAttribute("loading", "lazy");
  iframe.style.cssText = [
    "width:100%",
    "max-width:560px",
    "height:90vh",
    "max-height:760px",
    "border:none",
    "border-radius:12px",
    "background:#fff",
    "box-shadow:0 20px 60px rgba(0,0,0,.3)",
  ].join(";");

  overlay.appendChild(iframe);
  document.body.appendChild(btn);
  document.body.appendChild(overlay);

  // ─── Open / close ──────────────────────────────────────────────────────────

  async function openWidget() {
    const token = await fetchWidgetToken();
    iframe.src = buildWidgetUrl(token);
    overlay.style.display = "flex";
    btn.style.opacity = "0";
    btn.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";
    document.dispatchEvent(new CustomEvent("fauward:ready"));
  }

  function closeWidget() {
    overlay.style.display = "none";
    btn.style.opacity = "1";
    btn.style.pointerEvents = "";
    document.body.style.overflow = "";
    // Clear iframe src to stop any media / animations inside
    iframe.src = "about:blank";
    document.dispatchEvent(new CustomEvent("fauward:close"));
  }

  btn.addEventListener("click", openWidget);

  // Click outside iframe closes the widget
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeWidget();
  });

  // Keyboard: Escape closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.style.display !== "none") closeWidget();
  });

  // ─── postMessage protocol ──────────────────────────────────────────────────

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== WIDGET_BASE) return;

    const data = e.data as { type?: string; trackingRef?: string; shipmentId?: string; batchRef?: string; count?: number };

    switch (data.type) {
      case "WIDGET_CLOSE":
        closeWidget();
        break;

      case "SHIPMENT_CREATED":
        closeWidget();
        document.dispatchEvent(
          new CustomEvent("fauward:shipment", {
            detail: { trackingRef: data.trackingRef, shipmentId: data.shipmentId },
          }),
        );
        break;

      case "BULK_CREATED":
        closeWidget();
        document.dispatchEvent(
          new CustomEvent("fauward:shipment", {
            detail: { batchRef: data.batchRef, count: data.count, bulk: true },
          }),
        );
        break;
    }
  });

  // Pre-fetch token on load if API key provided
  if (apiKey) fetchWidgetToken().catch(() => {});
})();
