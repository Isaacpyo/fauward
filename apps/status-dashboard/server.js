import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

// Load .env.local manually — fallback for environments where --env-file-if-exists isn't supported
(function loadEnvLocal() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env.local');
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* .env.local not found — skip */ }
})();

const execAsync = promisify(exec);
// Resolve monorepo root (two levels up from apps/status-dashboard)
const PROJECT_ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');

import { initServiceState, getAllServiceState, runAllChecks } from './services/health-checker.js';
import { getQueueState, refreshQueueStats }                   from './services/queue-monitor.js';
import { getBusinessHealth, refreshBusinessHealth }           from './services/business-health.js';
import { getIncidents, acknowledgeIncident, getIncidentAudit } from './services/incident-manager.js';
import { getAlerts }                                          from './services/alert-manager.js';
import { getRelayHealth, refreshRelayHealth }                 from './services/relay-monitor.js';
import { getCustomDomainHealth, refreshCustomDomainHealth }   from './services/custom-domain-monitor.js';
import { diagnose }                                           from './services/diagnoser.js';
import { streamDiagnosis, getAvailableProviders, isAvailable as aiAvailable } from './services/ai-diagnoser.js';
import { SERVICES }                                           from './services/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT ? Number(process.env.PORT) : 4000;
const HOST      = process.env.HOST ?? '0.0.0.0';
const INTERVAL  = Number(process.env.CHECK_INTERVAL ?? 30_000);

// ── Env validation (warns only, never crashes) ────────────────────────────────
const _origLog = console.log.bind(console);

function validateEnv() {
  const warnings = [];
  if (!process.env.DATABASE_URL)   warnings.push('DATABASE_URL missing — Postgres prod check disabled');
  if (!process.env.REDIS_URL)      warnings.push('REDIS_URL missing — Redis prod check disabled');
  if (!process.env.SUPABASE_URL)   warnings.push('SUPABASE_URL missing — Supabase prod check disabled');
  if (!process.env.BACKEND_URL)    warnings.push('BACKEND_URL missing — queue/business health will use localhost:3001');
  if (
    !process.env.SLACK_WEBHOOK_URL &&
    !process.env.DISCORD_WEBHOOK_URL &&
    !process.env.ALERT_WEBHOOK_URL
  ) warnings.push('No alert channel set — alerts logged only (set SLACK_WEBHOOK_URL etc.)');

  if (warnings.length) {
    _origLog('\n[CONFIG] Warnings (set in .env.local to fix):');
    warnings.forEach(w => _origLog(`  ⚠  ${w}`));
    _origLog('');
  }
}

validateEnv();

// ── Log ring buffer ───────────────────────────────────────────────────────────
const logs    = [];
const MAX_LOGS = 200;

console.log = (...args) => {
  _origLog(...args);
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const isCheck = msg.includes('[') && (msg.includes('✓') || msg.includes('✗'));
  if (isCheck) {
    logs.unshift({ ts: new Date().toISOString(), msg });
    if (logs.length > MAX_LOGS) logs.pop();
  }
};

// ── Startup ───────────────────────────────────────────────────────────────────
initServiceState();

async function runCycle() {
  await Promise.allSettled([
    runAllChecks(),
    refreshQueueStats(),
    refreshBusinessHealth(),
    refreshRelayHealth(),
    refreshCustomDomainHealth(),
  ]);
}

runCycle();
setInterval(runCycle, INTERVAL);

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/status', (_req, res) => {
  res.json({
    checkedAt:      new Date().toISOString(),
    interval:       INTERVAL,
    services:       getAllServiceState(),
    queues:         getQueueState(),
    businessHealth: getBusinessHealth(),
    customDomains:  getCustomDomainHealth(),
    incidents:      getIncidents(),
    alerts:         getAlerts(),
    relayHealth:    getRelayHealth(),
    logs:           logs.slice(0, 50),
  });
});

app.post('/api/incidents/:id/acknowledge', (req, res) => {
  const { by = 'ops', note = null } = req.body ?? {};
  const ok = acknowledgeIncident(req.params.id, by, note);
  res.json({ ok });
});

app.post('/api/restart/:serviceId', async (req, res) => {
  const svc = SERVICES.find(s => s.id === req.params.serviceId);
  if (!svc)   return res.status(404).json({ error: 'Service not found' });
  if (!svc.fix) return res.status(400).json({ error: 'No fix command configured for this service' });

  // Non-restartable services: return the command so the UI can show a copy prompt
  if (!svc.restartable) {
    return res.json({ ok: false, manualRequired: true, cmd: svc.fix,
      message: 'This service is managed by Turbo — run the command in your terminal.' });
  }

  try {
    const { stdout, stderr } = await execAsync(svc.fix, {
      cwd:     PROJECT_ROOT,
      timeout: 20_000,
    });
    res.json({ ok: true, cmd: svc.fix, stdout: stdout.trim().slice(0, 500), stderr: stderr.trim().slice(0, 200) });
  } catch (err) {
    res.json({ ok: false, cmd: svc.fix, error: err.message, stderr: (err.stderr ?? '').slice(0, 300) });
  }
});

// Kimi AI streaming diagnosis — SSE endpoint
app.get('/api/ai-diagnose/:serviceId/:env', async (req, res) => {
  const { serviceId, env } = req.params;
  const svc      = SERVICES.find(s => s.id === serviceId);
  const allState = getAllServiceState();
  const svcState = allState.find(s => s.id === serviceId);

  if (!svc || !svcState) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const envState = svc.type === 'derived'
    ? { configured: true, status: svcState.derivedStatus, error: svcState.derivedReason, history: [] }
    : (svcState.envStates?.[env] ?? { configured: false });

  // Keep intentionally disabled checks out of the AI path. Otherwise a
  // stale local Supabase probe can be interpreted as a real outage.
  if (!envState?.configured) {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const message = svc.id === 'supabase' && env === 'local'
      ? `### Root Cause\nLocal Supabase monitoring is not configured. Fauward local development uses Docker Postgres on localhost:5432; the Supabase CLI REST API on localhost:54321 is optional and is not required for custom-domain testing.\n\n### Fix Steps\n1. No action is needed for normal Fauward local development.\n2. Use the Postgres card for local database health.\n3. Only run \`supabase start\` if you specifically need the Supabase CLI stack.\n4. If you do run it, set \`SUPABASE_LOCAL_ENABLED=true\` and \`SUPABASE_LOCAL_URL=http://localhost:54321\` in \`apps/status-dashboard/.env.local\`.\n\n### Verify\nRestart the status dashboard and confirm Supabase local shows Not Configured while Postgres local is UP.`
      : `### Root Cause\n${svc.name} ${env} monitoring is not configured.\n\n### Fix Steps\n1. Add a ${env} environment config for ${svc.name} in the status dashboard registry if this check should run.\n2. Leave it unconfigured if this environment is intentionally unused.\n\n### Verify\nRestart the status dashboard and confirm the service is shown as Not Configured, not Down.`;

    res.write(`data: ${JSON.stringify({ token: message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // Resolve dependency states
  const depStates = (svc.dependencies ?? []).map(depId => {
    const dep      = SERVICES.find(s => s.id === depId);
    const depState = allState.find(s => s.id === depId);
    const depEnv   = depState?.envStates?.[env] ?? depState?.envStates?.local;
    return {
      id:     depId,
      name:   dep?.name ?? depId,
      status: depEnv?.status ?? depState?.derivedStatus ?? 'unknown',
      error:  depEnv?.error ?? null,
    };
  });

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const provider = 'deepseek';

  await streamDiagnosis({
    svc,
    env,
    envState,
    depStates,
    queues:   getQueueState(),
    provider,
    res,
  });
});

// Expose which AI providers are configured
app.get('/api/ai-providers', (_req, res) => {
  res.json({ providers: getAvailableProviders() });
});

app.get('/api/diagnose/:serviceId/:env', (req, res) => {
  const { serviceId, env } = req.params;
  const svc      = SERVICES.find(s => s.id === serviceId);
  const svcState = getAllServiceState().find(s => s.id === serviceId);

  if (!svc || !svcState) return res.status(404).json({ error: 'Service not found' });

  const envState = svc.type === 'derived'
    ? { configured: true, status: svcState.derivedStatus, error: svcState.derivedReason }
    : svcState.envStates?.[env];

  res.json(diagnose(svc, env, envState));
});

app.get('/api/incidents/:id/audit', (req, res) => {
  const trail = getIncidentAudit(req.params.id);
  if (!trail) return res.status(404).json({ error: 'Not found' });
  res.json({ id: req.params.id, audit: trail });
});

// ── Python Observability API proxy ─────────────────────────────────────────────
const PYTHON_API_URL  = process.env.PYTHON_API_URL  ?? 'http://localhost:8000';
const PYTHON_OBS_KEY  = process.env.PYTHON_OBS_API_KEY ?? '';

async function proxyPythonObs(path) {
  const headers = { 'Content-Type': 'application/json' };
  if (PYTHON_OBS_KEY) headers['Authorization'] = `Bearer ${PYTHON_OBS_KEY}`;
  try {
    const res = await fetch(`${PYTHON_API_URL}/observability${path}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { error: `Python API returned ${res.status}`, available: false };
    const data = await res.json();
    return { ...data, available: true };
  } catch (err) {
    return { error: err.message, available: false };
  }
}

// Single aggregated Python observability snapshot for the dashboard
app.get('/api/python-observability', async (_req, res) => {
  const [summary, workers, queues, configWarnings, integrations] = await Promise.allSettled([
    proxyPythonObs('/summary'),
    proxyPythonObs('/workers'),
    proxyPythonObs('/queues'),
    proxyPythonObs('/config-warnings'),
    proxyPythonObs('/integrations'),
  ]);

  res.json({
    summary:        summary.status   === 'fulfilled' ? summary.value   : { available: false },
    workers:        workers.status   === 'fulfilled' ? workers.value   : { available: false },
    queues:         queues.status    === 'fulfilled' ? queues.value    : { available: false },
    configWarnings: configWarnings.status === 'fulfilled' ? configWarnings.value : { available: false },
    integrations:   integrations.status   === 'fulfilled' ? integrations.value   : { available: false },
    fetchedAt: new Date().toISOString(),
  });
});

// Pass-through proxy for individual Python observability endpoints
app.get('/api/python-observability/workers',         async (_req, res) => res.json(await proxyPythonObs('/workers')));
app.get('/api/python-observability/queues',          async (_req, res) => res.json(await proxyPythonObs('/queues')));
app.get('/api/python-observability/incidents',       async (_req, res) => res.json(await proxyPythonObs('/incidents')));
app.get('/api/python-observability/alerts',          async (_req, res) => res.json(await proxyPythonObs('/alerts')));
app.get('/api/python-observability/audit',           async (_req, res) => res.json(await proxyPythonObs('/audit')));
app.get('/api/python-observability/business-health', async (_req, res) => res.json(await proxyPythonObs('/business-health')));
app.get('/api/python-observability/config-warnings', async (_req, res) => res.json(await proxyPythonObs('/config-warnings')));
app.get('/api/python-observability/integrations',    async (_req, res) => res.json(await proxyPythonObs('/integrations')));

app.post('/api/python-observability/incidents/:id/acknowledge', async (req, res) => {
  const headers = { 'Content-Type': 'application/json' };
  if (PYTHON_OBS_KEY) headers['Authorization'] = `Bearer ${PYTHON_OBS_KEY}`;
  try {
    const r = await fetch(`${PYTHON_API_URL}/observability/incidents/${req.params.id}/acknowledge`, {
      method: 'POST', headers, body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(8_000),
    });
    res.status(r.status).json(await r.json());
  } catch (err) { res.status(503).json({ error: err.message }); }
});

app.post('/api/python-observability/incidents/:id/resolve', async (req, res) => {
  const headers = { 'Content-Type': 'application/json' };
  if (PYTHON_OBS_KEY) headers['Authorization'] = `Bearer ${PYTHON_OBS_KEY}`;
  try {
    const r = await fetch(`${PYTHON_API_URL}/observability/incidents/${req.params.id}/resolve`, {
      method: 'POST', headers, body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(8_000),
    });
    res.status(r.status).json(await r.json());
  } catch (err) { res.status(503).json({ error: err.message }); }
});

const server = app.listen(PORT, HOST, () => {
  _origLog(`\nFauward Ops Dashboard → http://localhost:${PORT}`);
  _origLog(`Monitoring ${getAllServiceState().length} services every ${INTERVAL / 1000}s\n`);
  _origLog(`Python Observability API → ${PYTHON_API_URL}/observability`);
});

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    _origLog(`Status dashboard port ${PORT} is already in use. Stop the existing process or set PORT explicitly.`);
    process.exit(1);
  }

  throw err;
});
