import { checkHttp, checkTcp } from '../checks.js';
import { SERVICES, ACTIVE_ENVS, THRESHOLDS } from './registry.js';
import { processServiceResult } from './incident-manager.js';
import { processServiceAlert } from './alert-manager.js';

const HISTORY_MAX    = 30;
const VERSION_CACHE  = new Map(); // `${serviceId}:${env}` → { version, commit, branch, fetchedAt }
const VERSION_TTL_MS = 5 * 60 * 1000; // re-fetch version every 5 min

// serviceState: Map<serviceId, { ...service, envStates: { local, prod, staging } }>
const serviceState = new Map();

function initEnvState() {
  return {
    configured:    true,
    status:        'checking',
    responseTime:  null,
    lastChecked:   null,
    error:         null,
    degradedReason: null,
    httpStatus:    null,
    history:       [],
    responseTimes: [],
    version:       null,
  };
}

function unconfiguredEnvState() {
  return { configured: false, status: 'unconfigured' };
}

export function initServiceState() {
  for (const svc of SERVICES) {
    if (svc.type === 'derived') {
      serviceState.set(svc.id, { ...svc, envStates: {}, derivedStatus: 'checking', derivedReason: null });
      continue;
    }
    const envStates = {};
    for (const env of ACTIVE_ENVS) {
      const envCfg = svc.environments[env];
      envStates[env] = envCfg?.enabled ? initEnvState() : unconfiguredEnvState();
    }
    serviceState.set(svc.id, { ...svc, envStates });
  }
}

export function getAllServiceState() {
  return Array.from(serviceState.values());
}

function applyResult(prev, result) {
  const up           = result.up;
  const history      = [...prev.history,      up].slice(-HISTORY_MAX);
  const responseTimes = [...prev.responseTimes, up ? result.responseTime : null].slice(-HISTORY_MAX);

  let status = up ? 'up' : 'down';

  // Mark degraded if latency is too high
  if (up && result.responseTime > THRESHOLDS.degradedLatencyMs) {
    status = 'degraded';
  }

  return {
    ...prev,
    status,
    responseTime:  result.responseTime,
    lastChecked:   new Date().toISOString(),
    error:         result.error ?? null,
    httpStatus:    result.httpStatus ?? null,
    history,
    responseTimes,
  };
}

async function fetchVersion(svc, env, baseUrl) {
  const key = `${svc.id}:${env}`;
  const cached = VERSION_CACHE.get(key);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < VERSION_TTL_MS) {
    return cached;
  }
  if (!svc.healthPaths?.version || !baseUrl) return null;

  try {
    const url = `${baseUrl}${svc.healthPaths.version}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const version = { ...data, fetchedAt: new Date().toISOString() };
    VERSION_CACHE.set(key, version);
    return version;
  } catch {
    return null;
  }
}

async function checkServiceEnv(svc, env) {
  const envCfg = svc.environments[env];
  if (!envCfg?.enabled) return;

  const state = serviceState.get(svc.id);
  const prevEnv = state.envStates[env];

  // Build the check target
  let result;
  if (svc.type === 'http') {
    // Use health path if available, fall back to base URL
    const healthPath = svc.healthPaths?.health ?? svc.healthPaths?.live ?? '';
    const checkUrl   = `${envCfg.url}${healthPath}`;
    result = await checkHttp({
      url:            checkUrl,
      expectedStatus: envCfg.expectedStatus ?? null,
    }).catch(() => ({ up: false, responseTime: 0, error: 'Check failed' }));
  } else if (svc.type === 'tcp') {
    result = await checkTcp(envCfg).catch(() => ({ up: false, responseTime: 0, error: 'Check failed' }));
  } else {
    return; // queue type handled by queue-monitor
  }

  const newEnvState = applyResult(prevEnv, result);

  // Fetch version info in parallel (non-blocking)
  const versionInfo = svc.type === 'http'
    ? await fetchVersion(svc, env, envCfg.url)
    : null;
  if (versionInfo) newEnvState.version = versionInfo;

  state.envStates[env] = newEnvState;
  serviceState.set(svc.id, state);

  processServiceResult(svc, env, newEnvState.status, newEnvState.error);
  processServiceAlert(svc, env, newEnvState.status, newEnvState.error);

  const sym = result.up ? '✓' : '✗';
  console.log(`[${new Date().toLocaleTimeString()}] ${sym} ${svc.name} ${env} (${result.responseTime}ms)`);
}

export async function runAllChecks() {
  const checks = [];
  for (const svc of SERVICES) {
    if (svc.type === 'queue' || svc.type === 'derived') continue;
    for (const env of ACTIVE_ENVS) {
      const envCfg = svc.environments[env];
      if (envCfg?.enabled) checks.push(checkServiceEnv(svc, env));
    }
  }
  await Promise.allSettled(checks);

  // Cascade dep failures onto dependents, then compute derived service status
  applyDependencyCascade();
  applyDerivedStatus();
}

/**
 * Derived services have no direct check — their status is the worst status
 * across all their dependencies.
 */
function applyDerivedStatus() {
  for (const svc of SERVICES) {
    if (svc.type !== 'derived') continue;
    const state = serviceState.get(svc.id);
    if (!svc.dependencies?.length) {
      state.derivedStatus = 'unknown';
      state.derivedReason = 'No dependencies configured';
      continue;
    }

    let worst = 'up';
    let reason = null;

    for (const depId of svc.dependencies) {
      const dep = serviceState.get(depId);
      if (!dep) continue;
      const depWorst = worstEnvStatus(dep);
      if (depWorst === 'down' && worst !== 'down') {
        worst  = 'down';
        reason = `${dep.name} is DOWN`;
      } else if (depWorst === 'degraded' && worst === 'up') {
        worst  = 'degraded';
        reason = `${dep.name} is DEGRADED`;
      }
    }

    state.derivedStatus = worst;
    state.derivedReason = reason;
  }
}

function worstEnvStatus(state) {
  const statuses = Object.values(state.envStates ?? {})
    .filter(e => e?.configured)
    .map(e => e.status);
  if (statuses.includes('down'))     return 'down';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('up'))       return 'up';
  return 'checking';
}

/**
 * If a critical dependency is DOWN, mark dependent services as DEGRADED.
 */
function applyDependencyCascade() {
  const stateMap = new Map(serviceState);

  for (const svc of SERVICES) {
    if (!svc.dependencies?.length) continue;
    const svcState = stateMap.get(svc.id);

    for (const env of ACTIVE_ENVS) {
      const envState = svcState?.envStates[env];
      if (!envState?.configured) continue;
      if (envState.status === 'down') continue; // already down, no cascade needed

      for (const depId of svc.dependencies) {
        const depState = stateMap.get(depId);
        if (!depState) continue;
        const depEnvState = depState.envStates[env] ?? depState.envStates.local;
        if (!depEnvState?.configured) continue;

        if (depEnvState.status === 'down') {
          envState.status        = 'degraded';
          envState.degradedReason = `Dependency '${depState.name}' is ${depEnvState.status}`;
          break;
        }
      }
    }
  }
}
