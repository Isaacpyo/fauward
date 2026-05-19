import { randomUUID } from 'crypto';

/** In-memory alert log visible in the dashboard UI. */
const alerts = [];
const MAX_ALERTS = 200;

// Dedup: prevent repeated alerts for same service+env within cooldown
const lastAlerted = new Map(); // `${serviceId}:${env}` → timestamp
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── Channel config (set in .env.local) ───────────────────────────────────
const SLACK_WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL  ?? '';
const DISCORD_WEBHOOK_URL= process.env.DISCORD_WEBHOOK_URL?? '';
const WEBHOOK_URL        = process.env.ALERT_WEBHOOK_URL  ?? ''; // generic POST

const SEVERITY_EMOJI = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };

// ── Channels ──────────────────────────────────────────────────────────────

async function sendSlack(alert) {
  if (!SLACK_WEBHOOK_URL) return false;
  const emoji = SEVERITY_EMOJI[alert.severity] ?? '⚪';
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *${alert.severity.toUpperCase()}* — ${alert.message}`,
        attachments: [{
          color:  alert.severity === 'critical' ? '#f04343'
                : alert.severity === 'high'     ? '#f59e0b'
                : '#3b82f6',
          fields: [
            { title: 'Service',     value: alert.serviceName, short: true },
            { title: 'Environment', value: alert.environment,  short: true },
          ],
          footer: 'Fauward Ops',
          ts:     Math.floor(Date.now() / 1000),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

async function sendDiscord(alert) {
  if (!DISCORD_WEBHOOK_URL) return false;
  const emoji  = SEVERITY_EMOJI[alert.severity] ?? '⚪';
  const colors = { critical: 15738912, high: 16092954, medium: 16776960, low: 3901635 };
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title:       `${emoji} ${alert.severity.toUpperCase()} Alert`,
          description: alert.message,
          color:       colors[alert.severity] ?? 3901635,
          fields: [
            { name: 'Service',     value: alert.serviceName, inline: true },
            { name: 'Environment', value: alert.environment,  inline: true },
          ],
          footer: { text: 'Fauward Ops' },
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

async function sendWebhook(alert) {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(alert),
      signal:  AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

// ── Core ──────────────────────────────────────────────────────────────────

export function getAlerts() {
  return alerts.slice(0, 50);
}

export function emitAlert({ serviceId, serviceName, environment, severity, message }) {
  const key = `${serviceId}:${environment}`;
  const now = Date.now();

  if (now - (lastAlerted.get(key) ?? 0) < COOLDOWN_MS) return;
  lastAlerted.set(key, now);

  const channel = SLACK_WEBHOOK_URL   ? 'slack'
                : DISCORD_WEBHOOK_URL ? 'discord'
                : WEBHOOK_URL         ? 'webhook'
                : 'none';

  const alert = {
    id:          randomUUID(),
    serviceId,
    serviceName,
    environment,
    severity,
    channel,
    status:      'pending',
    message,
    createdAt:   new Date().toISOString(),
    sentAt:      null,
  };

  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) alerts.pop();

  dispatch(alert);
}

async function dispatch(alert) {
  const results = await Promise.all([
    sendSlack(alert),
    sendDiscord(alert),
    sendWebhook(alert),
  ]);

  const sent = results.some(Boolean);
  alert.status = sent ? 'sent' : alert.channel === 'none' ? 'muted' : 'failed';
  alert.sentAt = sent ? new Date().toISOString() : null;

  const icon = sent ? '✓' : '✗';
  console.log(`[ALERT] ${icon} ${alert.severity.toUpperCase()} — ${alert.message} (${alert.channel})`);
}

export function processServiceAlert(service, env, status, error) {
  if (status === 'down' && ['critical', 'high'].includes(service.criticality)) {
    emitAlert({
      serviceId:   service.id,
      serviceName: service.name,
      environment: env,
      severity:    service.criticality === 'critical' ? 'critical' : 'high',
      message:     `${service.name} (${env}) is DOWN: ${error ?? 'No response'}`,
    });
  }
  if (status === 'degraded') {
    emitAlert({
      serviceId:   service.id,
      serviceName: service.name,
      environment: env,
      severity:    'medium',
      message:     `${service.name} (${env}) is DEGRADED`,
    });
  }
}
