import { fetchTracking } from "./api.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function buildEventHtml(event) {
  return `
    <article class="fw-event">
      <div class="fw-event-head">
        <span class="fw-dot" data-state="${escapeHtml(event.status)}"></span>
        <strong>${escapeHtml(event.status)}</strong>
      </div>
      <div class="fw-muted">${escapeHtml(event.description || "")}</div>
      ${event.location ? `<div class="fw-muted">${escapeHtml(event.location)}</div>` : ""}
      <div class="fw-muted fw-mono">${escapeHtml(formatDate(event.timestamp))}</div>
    </article>
  `;
}

export function createTrackingWidget({ shadowRoot, mode, tenantId }) {
  const state = {
    mode: mode === "compact" ? "compact" : "default",
    tenantId: tenantId || "",
    trackingNumber: "",
    loading: false,
    error: "",
    result: null,
    showAllEvents: false
  };

  const root = document.createElement("div");
  root.className = "fw-root";
  root.dataset.mode = state.mode;
  shadowRoot.appendChild(root);

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!state.trackingNumber || state.loading) {
      return;
    }
    setState({ loading: true, error: "", result: null, showAllEvents: false });
    try {
      const data = await fetchTracking(state.tenantId, state.trackingNumber);
      setState({ result: data, loading: false, error: "" });
    } catch (error) {
      if (error && error.code === "not_found") {
        setState({ error: "No shipment found for this tracking number.", loading: false });
        return;
      }
      setState({ error: "Something went wrong. Please try again.", loading: false });
    }
  }

  function renderResult() {
    if (!state.result) {
      return "";
    }
    const events = Array.isArray(state.result.events) ? state.result.events : [];
    const visibleEvents = state.showAllEvents ? events : events.slice(0, 10);
    const delivered = state.result.status === "DELIVERED";

    return `
      <section class="fw-result">
        <div class="fw-mono fw-muted">${escapeHtml(state.result.tracking_number)}</div>
        <div class="fw-status-row">
          <span class="fw-dot" data-state="${escapeHtml(state.result.status)}"></span>
          <strong>${escapeHtml(state.result.status)}</strong>
        </div>
        ${delivered ? `<div class="fw-banner fw-banner--delivered">Shipment delivered</div>` : ""}
        <div class="fw-timeline">
          ${visibleEvents.map((event) => buildEventHtml(event)).join("")}
        </div>
        ${events.length > 10 ? `<a class="fw-link" data-action="toggle-events">${state.showAllEvents ? "Show less" : "Show all"}</a>` : ""}
        <a class="fw-link" data-action="reset">Track another</a>
      </section>
    `;
  }

  function render() {
    root.innerHTML = `
      <form class="fw-form">
        <input class="fw-input fw-mono" type="text" placeholder="Tracking number" value="${escapeHtml(state.trackingNumber)}" ${state.loading ? "disabled" : ""} />
        <button class="fw-button" ${!state.trackingNumber || state.loading ? "disabled" : ""}>
          ${state.loading ? `<span class="fw-spinner"></span>` : "Track"}
        </button>
      </form>
      ${state.error ? `<div class="fw-error">${escapeHtml(state.error)}</div>` : ""}
      ${renderResult()}
    `;

    const form = root.querySelector("form");
    const input = root.querySelector(".fw-input");
    const resetLink = root.querySelector('[data-action="reset"]');
    const toggleEventsLink = root.querySelector('[data-action="toggle-events"]');

    form?.addEventListener("submit", onSubmit);
    input?.addEventListener("input", (event) => setState({ trackingNumber: event.target.value }));
    resetLink?.addEventListener("click", (event) => {
      event.preventDefault();
      setState({ result: null, trackingNumber: "", error: "", showAllEvents: false });
    });
    toggleEventsLink?.addEventListener("click", (event) => {
      event.preventDefault();
      setState({ showAllEvents: !state.showAllEvents });
    });
  }

  render();

  return {
    destroy() {
      root.remove();
    }
  };
}

