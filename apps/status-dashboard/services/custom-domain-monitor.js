import { resolveCname } from 'node:dns/promises';

const LOCAL_BACKEND_URL = process.env.LOCAL_BACKEND_URL ?? 'http://localhost:3001';
const PROD_BACKEND_URL = process.env.BACKEND_URL ?? null;
const MONITORING_KEY = process.env.MONITORING_API_KEY ?? '';
const PROBE_HOSTS = (process.env.CUSTOM_DOMAIN_PROBE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

let customDomainHealth = {
  local: null,
  prod: null,
  probes: [],
  available: false,
  status: 'unknown',
  issues: [],
  lastChecked: null
};

function normalizeBaseUrl(url) {
  return url?.replace(/\/$/, '') ?? null;
}

async function fetchBackendSnapshot(env, baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return { env, available: false, status: 'unconfigured', error: 'Backend URL not configured' };

  const headers = { 'Content-Type': 'application/json' };
  if (MONITORING_KEY) headers.Authorization = `Bearer ${MONITORING_KEY}`;

  try {
    const response = await fetch(`${normalized}/api/internal/metrics/custom-domains`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return { env, available: false, status: 'down', error: `HTTP ${response.status}` };
    }

    const body = await response.json();
    return { env, available: true, ...body };
  } catch (error) {
    return { env, available: false, status: 'down', error: error.message };
  }
}

async function probeHost(host) {
  try {
    const cnames = await resolveCname(host);
    return {
      host,
      status: cnames.length > 0 ? 'up' : 'down',
      cnames,
      error: null
    };
  } catch (error) {
    return resolveCnameViaDoh(host, error);
  }
}

async function resolveCnameViaDoh(host, originalError) {
  try {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=CNAME`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`DNS HTTP ${response.status}`);

    const body = await response.json();
    const cnames = (body.Answer ?? [])
      .filter((answer) => answer.type === 5 && typeof answer.data === 'string')
      .map((answer) => answer.data.replace(/\.$/, ''));

    return {
      host,
      status: cnames.length > 0 ? 'up' : 'down',
      cnames,
      error: cnames.length > 0 ? null : originalError.code ?? originalError.message
    };
  } catch (fallbackError) {
    return {
      host,
      status: 'down',
      cnames: [],
      error: `${originalError.code ?? originalError.message}; fallback ${fallbackError.message}`
    };
  }
}

function worstStatus(snapshots, probes) {
  if (snapshots.some((snapshot) => snapshot?.status === 'down')) return 'down';
  if (snapshots.some((snapshot) => snapshot?.status === 'degraded')) return 'degraded';
  if (probes.some((probe) => probe.status === 'down')) return 'degraded';
  if (snapshots.some((snapshot) => snapshot?.status === 'up')) return 'up';
  return 'unknown';
}

export function getCustomDomainHealth() {
  return customDomainHealth;
}

export async function refreshCustomDomainHealth() {
  const [local, prod, probes] = await Promise.all([
    fetchBackendSnapshot('local', LOCAL_BACKEND_URL),
    PROD_BACKEND_URL ? fetchBackendSnapshot('prod', PROD_BACKEND_URL) : Promise.resolve(null),
    Promise.all(PROBE_HOSTS.map(probeHost))
  ]);

  const snapshots = [local, prod].filter(Boolean);
  const issues = [
    ...snapshots.flatMap((snapshot) => snapshot.issues ?? []),
    ...snapshots.filter((snapshot) => snapshot.error).map((snapshot) => `${snapshot.env}: ${snapshot.error}`),
    ...probes.filter((probe) => probe.status === 'down').map((probe) => `${probe.host}: ${probe.error ?? 'CNAME missing'}`)
  ];

  customDomainHealth = {
    local,
    prod,
    probes,
    available: snapshots.some((snapshot) => snapshot.available),
    status: worstStatus(snapshots, probes),
    issues,
    lastChecked: new Date().toISOString()
  };
}
