/**
 * Polls the backend relay-health endpoint for Supabase conversation metrics.
 * The two key signals are:
 *  - aiStuck:     conversations where AI started but never finished (> 5 min in ai_handling)
 *  - humanNeeded: conversations waiting for a human reply (unacknowledged)
 */

const BACKEND_URL    = process.env.BACKEND_URL    ?? 'http://localhost:3001';
const MONITORING_KEY = process.env.MONITORING_API_KEY ?? '';

let relayHealth = {
  available:         false,
  openConversations: null,
  aiStuck:           null,
  humanNeeded:       null,
  messagesLast24h:   null,
  supabaseReachable: null,
  lastChecked:       null,
  error:             null,
};

export function getRelayHealth() {
  return relayHealth;
}

export async function refreshRelayHealth() {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (MONITORING_KEY) headers['Authorization'] = `Bearer ${MONITORING_KEY}`;

    const res = await fetch(`${BACKEND_URL}/api/internal/metrics/relay-health`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      relayHealth = { ...relayHealth, available: false, error: `HTTP ${res.status}`, lastChecked: new Date().toISOString() };
      return;
    }

    const data = await res.json();
    relayHealth = {
      available:         true,
      openConversations: data.openConversations ?? 0,
      aiStuck:           data.aiStuck           ?? 0,
      humanNeeded:       data.humanNeeded        ?? 0,
      messagesLast24h:   data.messagesLast24h    ?? 0,
      supabaseReachable: data.supabaseReachable  ?? false,
      lastChecked:       data.checkedAt,
      error:             null,
    };
  } catch (err) {
    relayHealth = {
      ...relayHealth,
      available:   false,
      error:       err.message,
      lastChecked: new Date().toISOString(),
    };
  }
}
