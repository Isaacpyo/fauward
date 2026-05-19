const BACKEND_URL    = process.env.BACKEND_URL    ?? 'http://localhost:3001';
const MONITORING_KEY = process.env.MONITORING_API_KEY ?? '';

let businessHealth = {
  activeTenants:        null,
  suspendedTenants:     null,
  trialingTenants:      null,
  shipmentsCreatedToday: null,
  shipmentsInTransit:   null,
  stuckShipments:       null,
  isMock:               false,
  available:            false,
  lastChecked:          null,
  error:                null,
};

export function getBusinessHealth() {
  return businessHealth;
}

export async function refreshBusinessHealth() {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (MONITORING_KEY) headers['Authorization'] = `Bearer ${MONITORING_KEY}`;

    const res = await fetch(`${BACKEND_URL}/api/internal/metrics/business-health`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      businessHealth = { ...businessHealth, available: false, error: `HTTP ${res.status}`, lastChecked: new Date().toISOString() };
      return;
    }

    const data = await res.json();
    businessHealth = {
      ...data,
      available:   true,
      error:       null,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    businessHealth = {
      ...businessHealth,
      available:   false,
      error:       err.message,
      lastChecked: new Date().toISOString(),
    };
  }
}
