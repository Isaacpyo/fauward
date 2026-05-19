const API_BASE = window.location.pathname.startsWith('/status') ? '/status' : '';

// ── State ─────────────────────────────────────────────────────────────────
let lastData         = null;
let activeSection    = 'services';  // services | queues | business | incidents | alerts
let activeFilter     = 'all';       // all | down | degraded | critical | core | frontend | database | worker | integration
let selectedSvcId    = null;
let autoRefresh      = true;
let pollTimer        = null;
const INTERVAL_MS    = 5000;

// Notifications
let notifOpen      = false;
let lastViewedAt   = null; // Date — alerts created after this are "unread"

// View type
let viewType = localStorage.getItem('ops-view') ?? 'grid';

// Detail panel tab
let activeDetailTab = 'overview'; // 'overview' | 'diagnose'

// AI providers (loaded once at boot)
let aiProviders = [];
let activeProvider = localStorage.getItem('ops-ai-provider') ?? 'kimi';

async function loadAiProviders() {
  try {
    const res = await fetch(`${API_BASE}/api/ai-providers`);
    const data = await res.json();
    aiProviders = data.providers ?? [];
    if (aiProviders.length && !aiProviders.find(p => p.id === activeProvider)) {
      activeProvider = aiProviders[0].id;
    }
  } catch { aiProviders = []; }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 5)    return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function compactTime(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function labelFor(status) {
  const map = { up:'UP', down:'DOWN', degraded:'DEGR', checking:'WAIT', unconfigured:'N/A', unknown:'UNK', maintenance:'MAINT' };
  return map[status] ?? status.toUpperCase();
}
function uptimePct(history) {
  if (!history?.length) return '—';
  const up = history.filter(Boolean).length;
  return `${up}/${history.length} · ${Math.round((up/history.length)*100)}%`;
}
function historyBars(history, large = false) {
  if (!history?.length) {
    const empties = Array(30).fill('<div class="hbar empty"></div>').join('');
    return empties;
  }
  const empty = 30 - history.length;
  let html = Array(empty).fill('<div class="hbar empty"></div>').join('');
  for (const up of history) html += `<div class="hbar ${up ? 'up' : 'down'}"></div>`;
  return html;
}
function sparklineBars(responseTimes) {
  if (!responseTimes?.length) return '';
  const valid = responseTimes.filter(t => t !== null);
  const max   = Math.max(...valid, 1);
  return responseTimes.map(t => {
    if (t === null) return '<div class="spark-bar down" style="height:3px"></div>';
    const pct = Math.max(8, Math.round((t / max) * 100));
    return `<div class="spark-bar up" style="height:${pct}%"></div>`;
  }).join('');
}
function critBadge(criticality) {
  return `<span class="badge badge-${criticality}">${criticality}</span>`;
}
function typeBadge(type) {
  return `<span class="badge badge-type">${esc(type)}</span>`;
}
function fmtAge(secs) {
  if (secs == null) return '—';
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

// ── Header ────────────────────────────────────────────────────────────────
function renderHeader(data) {
  const { services } = data;
  const envs = ['local', 'prod'];

  const center = document.getElementById('env-summary');
  center.innerHTML = envs.map(env => {
    const svcsWithEnv = services.filter(s => s.envStates[env]?.configured);
    if (!svcsWithEnv.length) return '';
    const up   = svcsWithEnv.filter(s => s.envStates[env]?.status === 'up').length;
    const down = svcsWithEnv.filter(s => s.envStates[env]?.status === 'down').length;
    const deg  = svcsWithEnv.filter(s => s.envStates[env]?.status === 'degraded').length;
    return `<span class="env-pill">
      <span class="label">${env}</span>
      <span class="up">${up}↑</span>
      ${down  ? `<span class="down">${down}↓</span>` : ''}
      ${deg   ? `<span class="deg">${deg}⚠</span>` : ''}
    </span>`;
  }).join('');

  document.getElementById('last-refresh').textContent = timeAgo(data.checkedAt);
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function renderSidebar(data) {
  const { services, incidents, alerts, logs } = data;
  const openIncidents = incidents?.filter(i => i.status !== 'resolved') ?? [];
  const downCt  = services.filter(s => Object.values(s.envStates).some(e => e?.status === 'down')).length;
  const degCt   = services.filter(s => Object.values(s.envStates).some(e => e?.status === 'degraded')).length;
  const critCt  = services.filter(s => s.criticality === 'critical').length;

  const byCat = (cat) => services.filter(s => s.category === cat).length;

  const item = (section, filter, label, count, cls = '') => {
    const isActive = activeSection === section && (section !== 'services' || activeFilter === filter);
    return `<div class="nav-item ${isActive ? 'active' : ''} ${cls}" data-section="${section}" data-filter="${filter ?? ''}">
      <span>${label}</span>
      ${count != null ? `<span class="nav-badge ${cls}">${count}</span>` : ''}
    </div>`;
  };

  const pyWorkerDown = Array.isArray(pyData?.workers) ? pyData.workers.filter(w => w.status === 'down').length : null;
  const cfgMissing   = Array.isArray(pyData?.configWarnings) ? pyData.configWarnings.filter(w => w.status === 'missing').length : null;

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-section-title">Views</div>
      ${item('services', 'all',      'All Services', services.length)}
      ${item('services', 'down',     'Down',         downCt,  downCt  > 0 ? 'danger' : '')}
      ${item('services', 'degraded', 'Degraded',     degCt,   degCt   > 0 ? 'warn' : '')}
      ${item('services', 'critical', 'Critical',     critCt)}
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-title">Category</div>
      ${item('services', 'core',        'Core',         byCat('core'))}
      ${item('services', 'frontend',    'Frontend',     byCat('frontend'))}
      ${item('services', 'database',    'Database',     byCat('database'))}
      ${item('services', 'worker',      'Workers',      byCat('worker'))}
      ${item('services', 'integration', 'Integrations', byCat('integration'))}
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-title">Sections</div>
      ${item('queues',    '', 'Queue Health',      (data.queues ?? []).length)}
      ${item('business',  '', 'Business Health',   null)}
      ${item('incidents', '', 'Incidents',         openIncidents.length, openIncidents.length > 0 ? 'incident' : '')}
      ${item('alerts',    '', 'Alerts',            (alerts ?? []).length)}
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-title">Python Obs</div>
      ${item('workers',      '', 'Workers',         pyWorkerDown != null && pyWorkerDown > 0 ? pyWorkerDown + ' down' : null, pyWorkerDown > 0 ? 'danger' : '')}
      ${item('py-incidents', '', 'Py Incidents',    null)}
      ${item('config',       '', 'Config Warnings', cfgMissing != null && cfgMissing > 0 ? cfgMissing : null, cfgMissing > 0 ? 'warn' : '')}
      ${item('audit',        '', 'Audit Trail',     null)}
    </div>
    `;
}


// ── Service Grid ──────────────────────────────────────────────────────────
function filterServices(services) {
  const f = activeFilter;
  if (f === 'all') return services;
  if (f === 'down') return services.filter(s =>
    s.type === 'derived'
      ? s.derivedStatus === 'down'
      : Object.values(s.envStates ?? {}).some(e => e?.status === 'down'));
  if (f === 'degraded') return services.filter(s =>
    s.type === 'derived'
      ? s.derivedStatus === 'degraded'
      : Object.values(s.envStates ?? {}).some(e => e?.status === 'degraded'));
  if (f === 'critical') return services.filter(s => s.criticality === 'critical');
  return services.filter(s => s.category === f);
}

function renderEnvBlock(svc, envKey, envState) {
  if (!envState) return '';
  if (!envState.configured) {
    return `<div class="env-block">
      <div class="env-row">
        <span class="env-label">${envKey}</span>
        <div class="dot unconfigured"></div>
        <span class="status-label unconfigured">N/A</span>
      </div>
    </div>`;
  }
  const rt   = envState.responseTime != null ? envState.responseTime : '—';
  const unit = envState.responseTime != null ? 'ms' : '';
  return `<div class="env-block">
    <div class="env-row">
      <span class="env-label">${envKey}</span>
      <div class="dot ${envState.status}"></div>
      <span class="rt-inline">${rt}<span class="unit">${unit}</span></span>
      <span class="status-label ${envState.status}">${labelFor(envState.status)}</span>
      <span class="spacer"></span>
      <span class="last-checked" data-iso="${envState.lastChecked ?? ''}">${timeAgo(envState.lastChecked)}</span>
    </div>
    <div class="history">${historyBars(envState.history)}</div>
    ${envState.degradedReason ? `<div class="degraded-note">⚠ ${esc(envState.degradedReason)}</div>` : ''}
  </div>`;
}

function renderDerivedCard(svc) {
  const status = svc.derivedStatus ?? 'checking';
  const cls = [
    status === 'down'     ? 'has-down'     : '',
    status === 'degraded' ? 'has-degraded' : '',
    svc.id === selectedSvcId ? 'selected'  : '',
  ].filter(Boolean).join(' ');

  const depRows = (svc.dependencies ?? []).map(depId => {
    const dep = lastData?.services.find(s => s.id === depId);
    const depStatus = dep ? worstStatus(dep) : 'unknown';
    const depEnv  = dep?.envStates?.prod?.configured  ? dep.envStates.prod
                  : dep?.envStates?.local?.configured ? dep.envStates.local
                  : null;
    return `<div class="dep-row">
      <div class="dep-row-left"><div class="dot ${depStatus}"></div><span class="dep-name">${dep ? esc(dep.name) : esc(depId)}</span></div>
      <div class="dep-bars">${historyBars(depEnv?.history ?? [])}</div>
    </div>`;
  }).join('');

  return `<div class="card ${cls}" data-id="${esc(svc.id)}">
    <div class="card-top">
      <span class="card-name">${esc(svc.name)}</span>
      <div class="card-badges">${critBadge(svc.criticality)}<span class="badge badge-type">derived</span></div>
    </div>
    <div class="env-row" style="margin-bottom:0.5rem">
      <div class="dot ${status}"></div>
      <span class="status-label ${status}">${labelFor(status)}</span>
      ${svc.derivedReason ? `<span style="font-size:0.62rem;color:var(--muted);margin-left:0.3rem">— ${esc(svc.derivedReason)}</span>` : ''}
    </div>
    <div class="dep-list" style="margin:0">${depRows}</div>
  </div>`;
}

function renderCard(svc) {
  if (svc.type === 'derived') return renderDerivedCard(svc);

  const states   = Object.values(svc.envStates ?? {});
  const hasDown  = states.some(e => e?.status === 'down');
  const hasDeg   = states.some(e => e?.status === 'degraded');
  const allUnconf = states.every(e => !e?.configured);

  const cls = [
    hasDown  ? 'has-down' : '',
    hasDeg   ? 'has-degraded' : '',
    allUnconf? 'unconfigured' : '',
    svc.id === selectedSvcId ? 'selected' : '',
  ].filter(Boolean).join(' ');

  const localState = svc.envStates?.local;
  const prodState  = svc.envStates?.prod;

  return `<div class="card ${cls}" data-id="${esc(svc.id)}">
    <div class="card-top">
      <span class="card-name">${esc(svc.name)}</span>
      <div class="card-badges">
        ${critBadge(svc.criticality)}
        ${typeBadge(svc.type)}
        ${svc.devOnly ? '<span class="badge badge-devonly">dev</span>' : ''}
      </div>
    </div>
    ${localState ? renderEnvBlock(svc, 'Local', localState) : ''}
    ${localState && prodState ? '<div class="env-separator"></div>' : ''}
    ${prodState  ? renderEnvBlock(svc, 'Prod',  prodState)  : ''}
  </div>`;
}

function setViewType(type) {
  viewType = type;
  localStorage.setItem('ops-view', type);
  document.getElementById('view-grid')?.classList.toggle('active', type === 'grid');
  document.getElementById('view-list')?.classList.toggle('active', type === 'list');
  if (lastData) renderGrid(lastData.services);
}

function renderListRow(svc) {
  if (svc.type === 'derived') {
    const status = svc.derivedStatus ?? 'checking';
    return `<div class="list-row ${status === 'down' ? 'has-down' : status === 'degraded' ? 'has-degraded' : ''} ${svc.id === selectedSvcId ? 'selected' : ''}" data-id="${esc(svc.id)}">
      <div class="dot ${status}"></div>
      <span class="list-name">${esc(svc.name)}</span>
      <div class="list-badges"><span class="badge badge-type">derived</span>${critBadge(svc.criticality)}</div>
      <div class="list-envs" style="flex:1">
        <div class="list-env-cell" style="min-width:unset">
          <span class="status-label ${status}">${labelFor(status)}</span>
          ${svc.derivedReason ? `<span style="font-size:0.6rem;color:var(--muted);margin-left:0.4rem">— ${esc(svc.derivedReason)}</span>` : ''}
        </div>
      </div>
      <span class="list-time">—</span>
    </div>`;
  }

  const localState  = svc.envStates?.local;
  const prodState   = svc.envStates?.prod;
  const worst       = worstStatus(svc);
  const lastChecked = localState?.lastChecked ?? prodState?.lastChecked;

  const envCell = (state, label) => {
    if (!state)              return `<span class="list-env-na">${label} —</span>`;
    if (!state.configured)   return `<span class="list-env-na">${label} N/A</span>`;
    const rt = state.responseTime != null ? `${state.responseTime}ms` : '—';
    return `<div class="list-env-cell">
      <span class="list-env-label">${label}</span>
      <div class="dot ${state.status}"></div>
      <span class="list-env-rt">${rt}</span>
    </div>`;
  };

  return `<div class="list-row ${worst === 'down' ? 'has-down' : worst === 'degraded' ? 'has-degraded' : ''} ${svc.id === selectedSvcId ? 'selected' : ''}" data-id="${esc(svc.id)}">
    <div class="dot ${worst}"></div>
    <span class="list-name">${esc(svc.name)}</span>
    <div class="list-badges">${typeBadge(svc.type)}${critBadge(svc.criticality)}</div>
    <div class="list-envs">
      ${envCell(localState, 'local')}
      ${envCell(prodState,  'prod')}
    </div>
    <span class="list-time" data-iso="${lastChecked ?? ''}">${timeAgo(lastChecked)}</span>
  </div>`;
}

function renderGrid(services) {
  const filtered = filterServices(services);
  const container = document.getElementById('grid');

  document.getElementById('view-grid')?.classList.toggle('active', viewType === 'grid');
  document.getElementById('view-list')?.classList.toggle('active', viewType === 'list');

  if (!filtered.length) {
    container.className = '';
    container.innerHTML = '<div class="empty-state">No services match this filter.</div>';
    return;
  }

  if (viewType === 'list') {
    container.className = 'list-view';
    container.innerHTML = filtered.map(renderListRow).join('');
  } else {
    container.className = 'grid';
    container.innerHTML = filtered.map(renderCard).join('');
  }
}

// ── Queue Grid ────────────────────────────────────────────────────────────
function renderQueues(queues) {
  if (!queues?.length) {
    document.getElementById('queue-grid').innerHTML = '<div class="empty-state">Queue stats unavailable — backend must be running.</div>';
    return;
  }
  document.getElementById('queue-grid').innerHTML = queues.map(q => {
    const cls = q.status === 'down' ? 'q-down' : q.status === 'degraded' ? 'q-degraded' : '';
    const failWarn = (q.failed ?? 0) > 5  ? 'warn' : '';
    const failCrit = (q.failed ?? 0) > 50 ? 'crit' : '';
    const depthWarn= (q.depth ?? 0)  > 50 ? 'warn' : '';
    const depthCrit= (q.depth ?? 0)  > 500? 'crit' : '';
    return `<div class="queue-card ${cls}">
      <div class="queue-card-top">
        <span class="queue-name">${esc(q.name)}</span>
        <div class="card-badges">
          <span class="inc-status ${q.status}">${labelFor(q.status)}</span>
          ${critBadge(q.criticality)}
        </div>
      </div>
      <div class="queue-metrics">
        <div class="qm">
          <span class="qm-label">Depth</span>
          <span class="qm-value ${depthCrit || depthWarn}">${q.depth ?? '—'}</span>
        </div>
        <div class="qm">
          <span class="qm-label">Active</span>
          <span class="qm-value">${q.active ?? '—'}</span>
        </div>
        <div class="qm">
          <span class="qm-label">Failed</span>
          <span class="qm-value ${failCrit || failWarn}">${q.failed ?? '—'}</span>
        </div>
        <div class="qm">
          <span class="qm-label">Workers</span>
          <span class="qm-value">${q.workerCount ?? '—'}</span>
        </div>
        ${q.oldestJobAgeSecs != null ? `<div class="qm" style="grid-column:1/-1">
          <span class="qm-label">Oldest job</span>
          <span class="qm-value ${q.oldestJobAgeSecs >= 900 ? 'warn' : ''}">${fmtAge(q.oldestJobAgeSecs)}</span>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Business Health ───────────────────────────────────────────────────────
function renderBusinessHealth(bh) {
  const mockLabel = document.getElementById('biz-mock-label');
  mockLabel.innerHTML = bh?.isMock ? '<span class="mock-badge">mock/dev data</span>' : '';

  if (!bh?.available) {
    document.getElementById('biz-grid').innerHTML = `<div class="empty-state">${esc(bh?.error ?? 'Business health unavailable — backend must be running.')}</div>`;
    return;
  }

  const metrics = [
    { label: 'Active Tenants',     val: bh.activeTenants,          cls: 'ok' },
    { label: 'Trialing',           val: bh.trialingTenants,         cls: '' },
    { label: 'Suspended',          val: bh.suspendedTenants,        cls: (bh.suspendedTenants ?? 0) > 0 ? 'warn' : 'ok' },
    { label: 'Shipments Today',    val: bh.shipmentsCreatedToday,   cls: '' },
    { label: 'In Transit',         val: bh.shipmentsInTransit,      cls: '' },
    { label: 'Stuck Shipments',    val: bh.stuckShipments,          cls: (bh.stuckShipments ?? 0) > 0 ? 'crit' : 'ok' },
  ];

  document.getElementById('biz-grid').innerHTML = metrics.map(m => `
    <div class="biz-metric">
      <div class="biz-metric-label">${m.label}</div>
      <div class="biz-metric-value ${m.cls}">${m.val ?? '—'}</div>
    </div>`).join('');
}

// ── Incidents ─────────────────────────────────────────────────────────────
function incidentCard(inc, compact = false) {
  const workflows = (inc.affectedWorkflows ?? []).map(w =>
    `<span class="workflow-tag">${esc(w)}</span>`).join('');
  const auditRows = (inc.audit ?? []).map(a =>
    `<div class="audit-row"><span class="audit-ts">${timeAgo(a.ts)}</span><span class="audit-action">${esc(a.action)}</span>${a.by !== 'system' ? `<span class="audit-by">by ${esc(a.by)}</span>` : ''}</div>`
  ).join('');

  return `<div class="incident-card sev-${inc.severity}">
    <div class="inc-body">
      <div class="inc-title">${esc(inc.title)}</div>
      <div class="inc-meta">
        ${inc.environment} · ${inc.severity} · started ${timeAgo(inc.startedAt)}
        ${inc.acknowledgedBy ? ` · acked by ${esc(inc.acknowledgedBy)}` : ''}
        ${inc.resolvedAt ? ` · resolved ${timeAgo(inc.resolvedAt)}` : ''}
      </div>
      ${!compact && workflows ? `<div class="inc-workflows">${workflows}</div>` : ''}
      ${!compact && auditRows ? `<div class="inc-audit">${auditRows}</div>` : ''}
    </div>
    <span class="inc-status ${inc.status}">${inc.status}</span>
    ${inc.status === 'open' ? `<button class="ack-btn" data-inc-id="${esc(inc.id)}">Ack</button>` : ''}
  </div>`;
}

function renderIncidents(incidents) {
  const el = document.getElementById('incidents-list');
  if (!incidents?.length) {
    el.innerHTML = '<div class="empty-state">No incidents recorded.</div>';
    return;
  }
  el.innerHTML = incidents.map(inc => incidentCard(inc, false)).join('');
}

function renderIncidentsStrip(incidents) {
  const open = incidents?.filter(i => i.status !== 'resolved') ?? [];
  const strip = document.getElementById('incidents-strip');
  if (!open.length || activeSection !== 'services') { strip.classList.add('hidden'); return; }
  strip.classList.remove('hidden');
  strip.innerHTML = `<div class="incidents-strip-title">⚠ Active Incidents (${open.length})</div>` +
    open.slice(0, 3).map(i => incidentCard(i, true)).join('');
}

// ── Alerts ────────────────────────────────────────────────────────────────
function renderAlerts(alerts) {
  const el = document.getElementById('alerts-list');
  if (!alerts?.length) {
    el.innerHTML = '<div class="empty-state">No alerts recorded.</div>';
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="alert-card">
      <div class="inc-body">
        <div class="inc-title">${esc(a.message)}</div>
        <div class="inc-meta">${a.environment} · ${a.severity} · ${a.channel} · ${timeAgo(a.createdAt)}</div>
      </div>
      <span class="inc-status ${a.status}">${a.status}</span>
    </div>`).join('');
}

// ── Section switching ─────────────────────────────────────────────────────
function showSection(section) {
  ['services','queues','business','incidents','alerts','workers','py-incidents','config','audit'].forEach(s => {
    document.getElementById(`section-${s}`)?.classList.toggle('hidden', s !== section);
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────
function renderDetailEnv(svc, envKey, envState) {
  if (!envState?.configured) {
    return `<div class="detail-env">
      <div class="detail-env-title">
        <span class="detail-env-badge">${envKey}</span>
        <div class="dot unconfigured"></div>
        <span class="status-label unconfigured">Not Configured</span>
      </div>
      <p style="font-size:0.72rem;color:var(--muted)">No URL configured for this environment.</p>
    </div>`;
  }

  const rt   = envState.responseTime != null ? envState.responseTime : '—';
  const unit = envState.responseTime != null ? 'ms' : '';
  const isDown = envState.status === 'down';
  const url    = svc.type === 'http'
    ? (svc.environments?.[envKey === 'Local' ? 'local' : 'prod']?.url ?? '—')
    : svc.environments?.[envKey === 'Local' ? 'local' : 'prod']
        ? `${svc.environments[envKey === 'Local' ? 'local' : 'prod'].host}:${svc.environments[envKey === 'Local' ? 'local' : 'prod'].port}`
        : '—';

  const errorBlock = isDown && (envState.error || (envKey === 'Local' && svc.fix)) ? `
    <div class="error-block">
      ${envState.error ? `<div class="error-reason"><span>⚠</span><span>${esc(envState.error)}</span></div>` : ''}
      ${envState.degradedReason ? `<div class="error-reason"><span>⚠</span><span>${esc(envState.degradedReason)}</span></div>` : ''}
      ${svc.fix && envKey === 'Local' ? `
        <div class="fix-label">To restart:</div>
        <div class="fix-cmd">
          <code class="fix-code">${esc(svc.fix)}</code>
          <button class="copy-btn" data-copy="${esc(svc.fix)}">Copy</button>
        </div>` : ''}
    </div>` : '';

  const versionBlock = envState.version ? `
    <div class="section-label">Version</div>
    <div class="version-block">
      ${envState.version.version  ? `<div class="version-row"><span class="version-key">version</span><span class="version-val">${esc(envState.version.version)}</span></div>` : ''}
      ${envState.version.commit && envState.version.commit !== 'unknown' ? `<div class="version-row"><span class="version-key">commit</span><span class="version-val">${esc(String(envState.version.commit).slice(0,8))}</span></div>` : ''}
      ${envState.version.branch  && envState.version.branch !== 'unknown' ? `<div class="version-row"><span class="version-key">branch</span><span class="version-val">${esc(envState.version.branch)}</span></div>` : ''}
    </div>` : '';

  const hasSparkline = envState.responseTimes?.some(t => t !== null);

  return `<div class="detail-env">
    <div class="detail-env-title">
      <span class="detail-env-badge">${envKey}</span>
      <div class="dot ${envState.status}"></div>
      <span class="status-label ${envState.status}">${labelFor(envState.status)}</span>
    </div>
    <div class="detail-rt">${rt}<span class="unit">${unit}</span></div>
    <div class="detail-url">${esc(url)}</div>
    ${errorBlock}
    <div class="detail-meta">
      <div class="detail-meta-item">
        <div class="detail-meta-label">Last check</div>
        <div class="detail-meta-value" data-iso="${envState.lastChecked ?? ''}">${timeAgo(envState.lastChecked)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Uptime</div>
        <div class="detail-meta-value">${uptimePct(envState.history)}</div>
      </div>
      ${envState.httpStatus ? `
      <div class="detail-meta-item">
        <div class="detail-meta-label">HTTP</div>
        <div class="detail-meta-value">${envState.httpStatus}</div>
      </div>` : ''}
    </div>
    ${versionBlock}
    <div class="section-label">History · last ${envState.history?.length ?? 0} checks</div>
    <div class="history-large">${historyBars(envState.history, true)}</div>
    ${hasSparkline ? `<div class="section-label">Response time</div><div class="sparkline">${sparklineBars(envState.responseTimes)}</div>` : ''}
  </div>`;
}

function renderServiceLogs(svc) {
  const logs = lastData?.logs ?? [];
  // Match log lines: "[HH:MM:SS] ✓/✗ ServiceName env (Xms)"
  const svcLogs = logs.filter(l => {
    const after = l.msg.replace(/^\[[\d:]+\]\s+[✓✗]\s+/, '');
    return after.startsWith(svc.name + ' ');
  });

  if (!svcLogs.length) {
    return `<div class="section-label" style="margin-top:1rem">Logs</div>
      <div style="font-size:0.72rem;color:var(--muted)">No check logs yet.</div>`;
  }

  const rows = svcLogs.slice(0, 30).map(l => {
    const up   = l.msg.includes('✓');
    const match = l.msg.match(/[✓✗]\s+.+?\s+(local|prod|staging)\s+\((\d+)ms\)/);
    const env  = match?.[1] ?? '';
    const rt   = match?.[2] ? `${match[2]}ms` : '';
    return `<div class="svc-log-row">
      <div class="log-dot ${up ? 'up' : 'down'}"></div>
      <span class="log-env-tag">${esc(env)}</span>
      <span class="svc-log-rt">${rt}</span>
      <span class="spacer"></span>
      <span class="log-time" data-iso="${l.ts}">${timeAgo(l.ts)}</span>
    </div>`;
  }).join('');

  return `<div class="section-label" style="margin-top:1rem">Logs <span style="color:var(--muted);font-weight:400">(last ${svcLogs.length} checks)</span></div>
    <div class="svc-log-list">${rows}</div>`;
}

function renderDetailPanel(svc, allServices) {
  document.getElementById('detail-name').textContent = svc.name;
  document.getElementById('detail-badges').innerHTML = [critBadge(svc.criticality), typeBadge(svc.type)].join('');

  const deps = (svc.dependencies ?? []).map(depId => {
    const dep = allServices.find(s => s.id === depId);
    if (!dep) return '';
    const worst    = worstStatus(dep);
    // Pick best available history: prod → local → empty
    const envState = dep.envStates?.prod?.configured  ? dep.envStates.prod
                   : dep.envStates?.local?.configured ? dep.envStates.local
                   : null;
    const bars     = historyBars(envState?.history ?? []);
    const rt       = envState?.responseTime != null ? `${envState.responseTime}ms` : '';
    return `<div class="dep-row">
      <div class="dep-row-left">
        <div class="dot ${worst}"></div>
        <span class="dep-name">${esc(dep.name)}</span>
        ${rt ? `<span class="dep-rt">${rt}</span>` : ''}
      </div>
      <div class="dep-bars">${bars}</div>
    </div>`;
  }).join('');

  const workflows = (svc.affectedWorkflows ?? []).map(w =>
    `<span class="workflow-tag">${esc(w)}</span>`).join('');

  const localEnv = svc.envStates?.local;
  const prodEnv  = svc.envStates?.prod;

  const actionUrl = localEnv?.configured
    ? (svc.environments?.local?.url ?? svc.environments?.prod?.url ?? '')
    : (svc.environments?.prod?.url ?? '');

  const isDerived     = svc.type === 'derived';
  const derivedStatus = svc.derivedStatus ?? 'checking';
  const rh            = svc.id === 'fauward-relay' ? lastData?.relayHealth : null;

  document.getElementById('detail-body').innerHTML = `
    ${svc.description ? `<p style="font-size:0.75rem;color:var(--muted);margin-bottom:0.875rem">${esc(svc.description)}</p>` : ''}

    ${isDerived ? `
      <div class="detail-env" style="margin-bottom:1rem">
        <div class="detail-env-title">
          <span class="detail-env-badge">Status</span>
          <div class="dot ${derivedStatus}"></div>
          <span class="status-label ${derivedStatus}">${labelFor(derivedStatus)}</span>
        </div>
        ${svc.derivedReason ? `<p style="font-size:0.72rem;color:var(--muted);margin-top:0.25rem">⚠ ${esc(svc.derivedReason)}</p>` : ''}
        <p style="font-size:0.7rem;color:var(--muted);margin-top:0.5rem">Status derived from dependencies — no standalone health endpoint.</p>
      </div>` : ''}

    ${rh?.available ? `
      <div class="section-label" style="margin-bottom:0.5rem">Relay Conversation Health</div>
      <div class="detail-meta" style="margin-bottom:0.875rem">
        <div class="detail-meta-item">
          <div class="detail-meta-label">Open convs</div>
          <div class="detail-meta-value">${rh.openConversations ?? '—'}</div>
        </div>
        <div class="detail-meta-item" style="${(rh.aiStuck ?? 0) > 0 ? 'border-color:rgba(240,67,67,0.3)' : ''}">
          <div class="detail-meta-label">AI stuck &gt;5m</div>
          <div class="detail-meta-value ${(rh.aiStuck ?? 0) > 0 ? 'crit' : ''}">${rh.aiStuck ?? '—'}</div>
        </div>
        <div class="detail-meta-item" style="${(rh.humanNeeded ?? 0) > 0 ? 'border-color:rgba(245,158,11,0.3)' : ''}">
          <div class="detail-meta-label">Needs human</div>
          <div class="detail-meta-value ${(rh.humanNeeded ?? 0) > 0 ? 'warn' : ''}">${rh.humanNeeded ?? '—'}</div>
        </div>
        <div class="detail-meta-item">
          <div class="detail-meta-label">Messages 24h</div>
          <div class="detail-meta-value">${rh.messagesLast24h ?? '—'}</div>
        </div>
      </div>
      ${(rh.aiStuck ?? 0) > 0 ? `<div class="error-block" style="margin-bottom:0.875rem"><div class="error-reason"><span>⚠</span><span>${rh.aiStuck} conversation(s) stuck with AI — DeepSeek/Moonshot may be failing silently. Check AI model status and backend logs.</span></div></div>` : ''}
    ` : ''}

    ${deps ? `<div class="section-label">Dependencies</div><div class="dep-list">${deps}</div>` : ''}

    ${workflows ? `<div class="section-label">Affected workflows</div><div class="workflow-tags">${workflows}</div>` : ''}

    ${!isDerived ? `<div class="action-links">
      ${actionUrl ? `<a href="${esc(actionUrl)}" target="_blank" class="action-link">↗ Open</a>` : ''}
      <button class="action-link" data-action="show-logs" data-svc-id="${esc(svc.id)}">📋 Logs</button>
      ${svc.runbookUrl ? `<a href="${esc(svc.runbookUrl)}" target="_blank" class="action-link">📖 Runbook</a>` : '<span class="action-link disabled">📖 Runbook</span>'}
      ${svc.fix && localEnv?.status === 'down'
        ? `<button class="action-link action-restart" id="restart-action-btn" data-svc-id="${esc(svc.id)}">⟳ Restart</button>`
        : `<span class="action-link disabled" title="${svc.fix ? 'Service is not down' : 'No restart command configured'}">⟳ Restart</span>`}
    </div>
    <div id="restart-result"></div>` : ''}

    ${!isDerived ? renderDetailEnv(svc, 'Local', localEnv) : ''}
    ${!isDerived && prodEnv ? renderDetailEnv(svc, 'Prod', prodEnv) : ''}

    ${renderServiceLogs(svc)}
  `;
}

function worstStatus(svc) {
  if (svc.type === 'derived') return svc.derivedStatus ?? 'checking';
  const states = Object.values(svc.envStates ?? {}).filter(e => e?.configured);
  if (states.some(e => e.status === 'down'))     return 'down';
  if (states.some(e => e.status === 'degraded')) return 'degraded';
  if (states.some(e => e.status === 'up'))       return 'up';
  return 'checking';
}

// ── Diagnose tab ──────────────────────────────────────────────────────────
function switchDetailTab(tab) {
  activeDetailTab = tab;
  document.querySelectorAll('.detail-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('detail-body').classList.toggle('hidden', tab !== 'overview');
  document.getElementById('detail-diagnose').classList.toggle('hidden', tab !== 'diagnose');
}

function renderDiagnoseResult(result, env) {
  if (!result) return '<div class="diagnose-body"><p style="color:var(--muted);font-size:0.75rem">No diagnosis available.</p></div>';

  const statusCls = result.status === 'up' ? 'is-ok' : result.isRealOutage === false ? 'is-warn' : 'is-crit';
  const icon      = result.status === 'up' ? '✓' : result.isRealOutage === false ? '⚠' : '✗';

  const steps = (result.steps ?? []).map((step, i) => {
    // Render inline code blocks
    const html = esc(step).replace(/`([^`]+)`/g, '<code>$1</code>');
    return `<div class="diagnose-step"><span class="step-num">${i + 1}</span><span class="step-text">${html}</span></div>`;
  }).join('');

  return `<div class="diagnose-body">
    <div class="diagnose-status">
      <div class="dot ${result.status ?? 'unknown'}"></div>
      <span style="font-family:var(--mono);font-size:0.72rem;font-weight:700;text-transform:uppercase">
        ${esc(env.toUpperCase())} — ${labelFor(result.status ?? 'unknown')}
      </span>
      ${result.httpStatus ? `<span style="font-family:var(--mono);font-size:0.65rem;color:var(--muted)">HTTP ${result.httpStatus}</span>` : ''}
      ${result.responseTime != null ? `<span style="font-family:var(--mono);font-size:0.65rem;color:var(--muted)">${result.responseTime}ms</span>` : ''}
    </div>

    <div class="diagnose-cause ${statusCls}">
      <div class="diagnose-cause-label">${icon} Likely cause</div>
      <div class="diagnose-cause-text">${esc(result.likelyCause ?? '')}</div>
      ${result.degradedReason ? `<div class="diagnose-cause-text" style="margin-top:0.3rem;opacity:0.7">${esc(result.degradedReason)}</div>` : ''}
    </div>

    ${steps ? `
      <div class="section-label" style="margin-bottom:0.4rem">Recovery steps</div>
      <div class="diagnose-steps">${steps}</div>
    ` : ''}
  </div>`;
}

function renderMd(text) {
  // Minimal markdown → safe HTML (no external lib needed)
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')  // escape first
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 class="md-h3">$1</h3>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="md-li numbered"><span class="md-num">$1</span><span>$2</span></div>')
    .replace(/^[-*] (.+)$/gm,    '<div class="md-li"><span class="md-bullet">·</span><span>$1</span></div>')
    .replace(/\n{2,}/g, '<br>')
    .replace(/\n/g,     ' ');
}

async function runDiagnosis(svc) {
  const btn      = document.getElementById('diagnose-run-btn');
  const respEl   = document.getElementById('kimi-response');
  const fallback = document.getElementById('kimi-fallback');
  if (!btn || !respEl) return;

  // Get selected env
  const activeEnvBtn = document.querySelector('.env-select-btn.active');
  const envInput     = document.getElementById('diag-env');
  const env          = activeEnvBtn?.dataset.env ?? envInput?.value ?? 'local';

  btn.disabled    = true;
  btn.innerHTML   = '⟳ Analysing…';
  respEl.innerHTML = '';
  respEl.classList.remove('hidden');
  if (fallback) fallback.classList.add('hidden');

  let rawText = '';
  let hasError = false;

  try {
    const res     = await fetch(`${API_BASE}/api/ai-diagnose/${encodeURIComponent(svc.id)}/${env}`);
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') break;
        try {
          const json = JSON.parse(raw);
          if (json.error) {
            hasError = true;
            respEl.innerHTML = `<div class="kimi-error">⚠ ${esc(json.error)}</div>`;
            break;
          }
          if (json.token) {
            rawText += json.token;
            respEl.innerHTML = `<div class="kimi-body">${renderMd(rawText)}<span class="kimi-cursor">▋</span></div>`;
            // Auto-scroll
            respEl.scrollTop = respEl.scrollHeight;
          }
        } catch { /* skip */ }
      }
      if (hasError) break;
    }

    // Remove cursor on finish
    if (!hasError && rawText) {
      respEl.innerHTML = `<div class="kimi-body">${renderMd(rawText)}</div>`;
    }
  } catch (err) {
    respEl.innerHTML = `<div class="kimi-error">✗ ${esc(err.message)}</div>`;
  }

  btn.disabled  = false;
  btn.innerHTML = '↺ Run Again';
}

function renderDiagnoseTab(svc) {
  const envs = svc.type === 'derived'
    ? ['derived']
    : ['local', 'prod'].filter(e => svc.envStates?.[e]?.configured);

  const envPills = envs.length > 1
    ? `<div class="diag-pill-row">
        ${envs.map(e => `<button class="env-select-btn ${e === envs[0] ? 'active' : ''}" data-env="${e}">${e}</button>`).join('')}
       </div>`
    : `<input type="hidden" id="diag-env" value="${envs[0] ?? 'local'}" />`;

  document.getElementById('detail-diagnose').innerHTML = `
    <div class="diagnose-body">
      ${envPills}
      <button class="diagnose-run-btn" id="diagnose-run-btn" data-svc-id="${esc(svc.id)}">
        ⚡ Run Diagnosis
      </button>
      <p class="kimi-hint">Analyses the live service snapshot and explains what to do.</p>
      <div id="kimi-response" class="kimi-response hidden"></div>
    </div>
  `;

  document.querySelectorAll('.env-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.env-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function openDetail(id) {
  if (selectedSvcId === id) { closeDetail(); return; }
  selectedSvcId    = id;
  activeDetailTab  = 'overview';
  const svc = lastData?.services.find(s => s.id === id);
  if (!svc) return;
  document.getElementById('detail-panel').classList.add('open');
  switchDetailTab('overview');
  renderDetailPanel(svc, lastData.services);
  renderDiagnoseTab(svc);
  if (lastData) renderGrid(lastData.services);
}

function closeDetail() {
  selectedSvcId   = null;
  activeDetailTab = 'overview';
  document.getElementById('detail-panel').classList.remove('open');
  if (lastData) renderGrid(lastData.services);
}

// ── Business health mini-strip (always on services view) ─────────────────
function renderBizStrip(bh) {
  const el = document.getElementById('biz-strip');
  if (!el) return;
  if (!bh?.available) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const stuck = (bh.stuckShipments ?? 0);
  const susp  = (bh.suspendedTenants ?? 0);
  el.innerHTML = `
    <span class="biz-strip-item">Tenants <strong>${bh.activeTenants ?? '—'}</strong> active</span>
    ${susp > 0 ? `<span class="biz-strip-item warn">⚠ ${susp} suspended</span>` : ''}
    <span class="biz-strip-sep">·</span>
    <span class="biz-strip-item">Shipments today <strong>${bh.shipmentsCreatedToday ?? '—'}</strong></span>
    <span class="biz-strip-item">${bh.shipmentsInTransit ?? '—'} in transit</span>
    ${stuck > 0 ? `<span class="biz-strip-item crit">🔴 ${stuck} stuck</span>` : ''}
  `;
}

// ── Full render ───────────────────────────────────────────────────────────
// ── Notifications ─────────────────────────────────────────────────────────
const SEV_DOT = { critical: 'down', high: 'degraded', medium: 'checking', low: 'up' };

function unreadCount(alerts) {
  if (!alerts?.length) return 0;
  if (!lastViewedAt)   return alerts.length;
  return alerts.filter(a => new Date(a.createdAt) > lastViewedAt).length;
}

function updateNotifBadge(alerts) {
  const n     = unreadCount(alerts);
  const badge = document.getElementById('notif-badge');
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.classList.toggle('hidden', n === 0);
}

function renderNotifList(alerts) {
  const el = document.getElementById('notif-list');
  if (!alerts?.length) {
    el.innerHTML = '<div class="notif-empty">No alerts yet.</div>';
    return;
  }
  el.innerHTML = alerts.slice(0, 30).map(a => {
    const isUnread  = !lastViewedAt || new Date(a.createdAt) > lastViewedAt;
    const dotCls    = SEV_DOT[a.severity] ?? 'checking';
    const svcName   = lastData?.services.find(s => s.id === a.serviceId)?.name ?? a.serviceId;
    return `<div class="notif-item ${isUnread ? 'unread' : ''}" data-svc-id="${esc(a.serviceId)}">
      <div class="notif-dot dot ${dotCls}"></div>
      <div class="notif-content">
        <div class="notif-svc">${esc(svcName)}</div>
        <div class="notif-msg">${esc(a.message)}</div>
        <div class="notif-meta">${esc(a.severity)} · ${esc(a.environment ?? '')} · ${timeAgo(a.createdAt)}</div>
      </div>
      <span class="notif-arrow">›</span>
    </div>`;
  }).join('');
}

function openNotifications() {
  notifOpen    = true;
  lastViewedAt = new Date();
  document.getElementById('notif-dropdown').classList.remove('hidden');
  if (lastData) renderNotifList(lastData.alerts);
  updateNotifBadge([]); // mark all read immediately
}

function closeNotifications() {
  notifOpen = false;
  document.getElementById('notif-dropdown').classList.add('hidden');
}

function renderAll(data) {
  renderHeader(data);
  renderSidebar(data);
  updateNotifBadge(data.alerts);
  if (notifOpen) renderNotifList(data.alerts); // keep dropdown live
  showSection(activeSection);

  if (activeSection === 'services') {
    renderGrid(data.services);
    renderBizStrip(data.businessHealth);
    renderIncidentsStrip(data.incidents);
  }
  if (activeSection === 'queues')       renderQueues(data.queues);
  if (activeSection === 'business')     renderBusinessHealth(data.businessHealth);
  if (activeSection === 'incidents')    renderIncidents(data.incidents);
  if (activeSection === 'alerts')       renderAlerts(data.alerts);
  if (activeSection === 'workers')      renderWorkers(pyData?.workers);
  if (activeSection === 'config')       renderConfigWarnings(pyData?.configWarnings);
  if (activeSection === 'audit')        renderAuditTrail(pyData?.audit);
  if (activeSection === 'py-incidents') renderPyIncidents(pyData?.incidents);

  if (selectedSvcId) {
    const svc = data.services.find(s => s.id === selectedSvcId);
    if (svc) renderDetailPanel(svc, data.services);
  }
}

// ── Timestamps (live update) ──────────────────────────────────────────────
function refreshTimestamps() {
  document.querySelectorAll('[data-iso]').forEach(el => {
    if (!el.dataset.iso) return;
    el.textContent = el.classList.contains('log-time')
      ? compactTime(el.dataset.iso)
      : timeAgo(el.dataset.iso);
  });
  if (lastData) document.getElementById('last-refresh').textContent = timeAgo(lastData.checkedAt);
}

// ── Python Observability data ─────────────────────────────────────────────
let pyData = null;

async function fetchPythonObs() {
  try {
    const res = await fetch(`${API_BASE}/api/python-observability`);
    if (!res.ok) return;
    pyData = await res.json();
    if (activeSection === 'workers')      renderWorkers(pyData.workers);
    if (activeSection === 'config')       renderConfigWarnings(pyData.configWarnings);
    if (activeSection === 'audit')        renderAuditTrail(pyData.audit);
    if (activeSection === 'py-incidents') renderPyIncidents(pyData.incidents);
  } catch { /* Python API not running */ }
}

// ── Worker Cards ──────────────────────────────────────────────────────────
function workerStatusBadge(status) {
  const map = { up:'UP', degraded:'DEGR', down:'DOWN', unknown:'UNK', not_configured:'N/A', maintenance:'MAINT' };
  return `<div class="dot ${status}"></div><span class="status-label ${status}">${map[status] ?? status.toUpperCase()}</span>`;
}

function renderWorkers(data) {
  const el = document.getElementById('workers-grid');
  if (!el) return;
  if (!data || (!Array.isArray(data) && !data.available)) {
    el.innerHTML = '<div class="empty-state">Python API unavailable — run <code>uvicorn main:app --port 8000</code> in services/python-services</div>';
    return;
  }
  const workers = Array.isArray(data) ? data : [];
  if (!workers.length) { el.innerHTML = '<div class="empty-state">No worker data.</div>'; return; }
  el.innerHTML = workers.map(w => `
    <div class="queue-card">
      <div class="queue-header">
        <span class="queue-name">${esc(w.worker_name)}</span>
        ${workerStatusBadge(w.status)}
      </div>
      <div class="queue-stats">
        <div class="queue-stat"><span class="stat-label">Heartbeat</span><span>${w.last_heartbeat ? timeAgo(w.last_heartbeat) : '—'}</span></div>
        <div class="queue-stat"><span class="stat-label">Age</span><span>${fmtAge(w.heartbeat_age_seconds)}</span></div>
        <div class="queue-stat"><span class="stat-label">Jobs today</span><span>${w.jobs_processed_today ?? '—'}</span></div>
        <div class="queue-stat"><span class="stat-label">Failed</span><span class="${w.failed_jobs > 0 ? 'text-danger' : ''}">${w.failed_jobs ?? 0}</span></div>
        <div class="queue-stat"><span class="stat-label">Queue</span><span style="font-size:0.6rem">${esc(w.current_queue ?? '—')}</span></div>
      </div>
    </div>`).join('');
}

// ── Config Warnings ───────────────────────────────────────────────────────
function renderConfigWarnings(data) {
  const el = document.getElementById('config-list');
  if (!el) return;
  if (!data || (!Array.isArray(data) && !data.available)) {
    el.innerHTML = '<div class="empty-state">Python API unavailable.</div>';
    return;
  }
  const items = Array.isArray(data) ? data : [];
  const byStatus = (s) => items.filter(i => i.status === s);
  const missing = byStatus('missing');
  const optMissing = byStatus('optional_missing');
  const configured = byStatus('configured');

  const row = (w) => `
    <div class="config-row ${w.status}">
      <span class="config-name">${esc(w.name)}</span>
      <span class="badge badge-${w.status === 'configured' ? 'up' : w.required ? 'down' : 'warn'}">${w.status.replace('_', ' ')}</span>
      <span class="config-cat">${esc(w.category)}</span>
      ${w.required ? '<span class="badge badge-critical">required</span>' : ''}
    </div>`;

  el.innerHTML =
    (missing.length ? `<div class="config-group"><div class="config-group-title danger">Missing (required)</div>${missing.map(row).join('')}</div>` : '') +
    (optMissing.length ? `<div class="config-group"><div class="config-group-title warn">Optional — not set</div>${optMissing.map(row).join('')}</div>` : '') +
    `<div class="config-group"><div class="config-group-title ok">Configured (${configured.length})</div>${configured.map(row).join('')}</div>`;
}

// ── Audit Trail ───────────────────────────────────────────────────────────
function renderAuditTrail(data) {
  const el = document.getElementById('audit-list');
  if (!el) return;
  if (!data || (!Array.isArray(data) && !data.available)) {
    el.innerHTML = '<div class="empty-state">Python API unavailable.</div>';
    return;
  }
  const events = Array.isArray(data) ? data : [];
  if (!events.length) { el.innerHTML = '<div class="empty-state">No audit events yet.</div>'; return; }
  el.innerHTML = `<div class="audit-list">${events.map(e => `
    <div class="audit-row">
      <span class="audit-ts">${timeAgo(e.timestamp)}</span>
      <span class="audit-action">${esc(e.action)}</span>
      <span class="audit-actor">${esc(e.actor_id ?? '—')}</span>
      ${e.service_id ? `<span class="audit-svc">${esc(e.service_id)}</span>` : ''}
      ${e.reason ? `<span class="audit-reason">${esc(e.reason)}</span>` : ''}
    </div>`).join('')}</div>`;
}

// ── Python Incidents ──────────────────────────────────────────────────────
function renderPyIncidents(data) {
  const el = document.getElementById('py-incidents-list');
  if (!el) return;
  if (!data || (!Array.isArray(data) && !data.available)) {
    el.innerHTML = '<div class="empty-state">Python API unavailable.</div>';
    return;
  }
  const incidents = Array.isArray(data) ? data : [];
  if (!incidents.length) { el.innerHTML = '<div class="empty-state">No open incidents.</div>'; return; }
  el.innerHTML = incidents.map(inc => `
    <div class="incident-card sev-${inc.severity}">
      <div class="inc-row">
        <span class="inc-title">${esc(inc.title)}</span>
        <span class="badge badge-${inc.severity}">${inc.severity}</span>
        <span class="badge badge-${inc.status}">${inc.status}</span>
      </div>
      ${inc.affected_workflows?.length ? `<div class="inc-workflows">Affects: ${inc.affected_workflows.map(w => `<span class="wf-tag">${esc(w)}</span>`).join('')}</div>` : ''}
      <div class="inc-meta">Started ${timeAgo(inc.started_at)} · ${esc(inc.environment)}</div>
      ${inc.status !== 'resolved' ? `<button class="py-ack-btn" data-inc-id="${esc(inc.id)}">Acknowledge</button>` : ''}
    </div>`).join('');
}

// ── Poll ──────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) return;
    lastData = await res.json();
    renderAll(lastData);
    fetchPythonObs(); // fire-and-forget — enriches pyData panels
  } catch (err) {
    console.error('Status fetch failed:', err);
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (autoRefresh) pollTimer = setTimeout(async () => { await poll(); schedulePoll(); }, INTERVAL_MS);
}

// ── Logs modal ────────────────────────────────────────────────────────────

function openLogsModal(svc) {
  const logs    = lastData?.logs ?? [];
  const svcLogs = logs.filter(l => {
    const after = l.msg.replace(/^\[[\d:]+\]\s+[✓✗]\s+/, '');
    return after.startsWith(svc.name + ' ');
  });

  const rows = svcLogs.length
    ? svcLogs.map(l => {
        const up    = l.msg.includes('✓');
        const match = l.msg.match(/[✓✗]\s+.+?\s+(local|prod|staging)\s+\((\d+)ms\)/);
        const env   = match?.[1] ?? '';
        const rt    = match?.[2] ? `${match[2]}ms` : '';
        return `<div class="modal-log-row">
          <div class="log-dot ${up ? 'up' : 'down'}"></div>
          <span class="log-name">${esc(l.msg)}</span>
          <span class="log-env-tag">${esc(env)}</span>
          <span class="svc-log-rt">${rt}</span>
          <span class="log-time">${timeAgo(l.ts)}</span>
        </div>`;
      }).join('')
    : '<div style="color:var(--muted);font-size:0.75rem;padding:1rem 0">No check logs yet for this service.</div>';

  document.getElementById('logs-modal-title').textContent = `${svc.name} — Logs`;
  document.getElementById('logs-modal-body').innerHTML    = rows;

  const extLink = document.getElementById('logs-modal-ext');
  if (svc.logUrl) {
    extLink.href        = svc.logUrl;
    extLink.textContent = '↗ Open in provider';
    extLink.classList.remove('hidden');
  } else {
    extLink.classList.add('hidden');
  }

  document.getElementById('logs-modal').classList.remove('hidden');
}

function closeLogsModal() {
  document.getElementById('logs-modal').classList.add('hidden');
}

// ── Event delegation ──────────────────────────────────────────────────────
document.getElementById('grid').addEventListener('click', e => {
  const card = e.target.closest('.card, .list-row');
  if (card) openDetail(card.dataset.id);
});

document.getElementById('view-grid').addEventListener('click', () => setViewType('grid'));
document.getElementById('view-list').addEventListener('click', () => setViewType('list'));

document.getElementById('sidebar').addEventListener('click', e => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const section = item.dataset.section;
  const filter  = item.dataset.filter;
  if (section === 'services') activeFilter = filter || 'all';
  activeSection = section;
  if (lastData) renderAll(lastData);
});

document.getElementById('close-detail').addEventListener('click', closeDetail);
document.getElementById('logs-modal-close').addEventListener('click', closeLogsModal);
document.getElementById('logs-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('logs-modal')) closeLogsModal();
});

// Detail panel tabs
document.querySelector('.detail-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.detail-tab');
  if (!tab || tab.dataset.tab === activeDetailTab) return;
  switchDetailTab(tab.dataset.tab);
});

// Kimi diagnose button
document.getElementById('detail-diagnose').addEventListener('click', e => {
  if (!e.target.closest('#diagnose-run-btn')) return;
  const svc = lastData?.services.find(s => s.id === selectedSvcId);
  if (svc) runDiagnosis(svc);
});

document.getElementById('detail-body').addEventListener('click', async e => {
  // Logs popup
  const logsBtn = e.target.closest('[data-action="show-logs"]');
  if (logsBtn) {
    const svcId = logsBtn.dataset.svcId;
    const svc   = lastData?.services.find(s => s.id === svcId);
    if (svc) openLogsModal(svc);
    return;
  }

  // Copy button
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
    });
    return;
  }

  // Restart — Yes button (confirmed)
  const yesBtn = e.target.closest('#restart-confirm-yes');
  if (yesBtn) {
    const svcId  = yesBtn.dataset.svcId;
    const result = document.getElementById('restart-result');
    if (result) result.innerHTML = '<div class="restart-confirm hidden"></div>';
    yesBtn.closest('.restart-confirm')?.remove();
    const running = document.createElement('div');
    running.className = 'restart-result warn';
    running.innerHTML = '<div class="restart-result-title">⟳ Starting…</div>';
    if (result) result.appendChild(running);

    try {
      const res  = await fetch(`${API_BASE}/api/restart/${encodeURIComponent(svcId)}`, { method: 'POST' });
      const data = await res.json();
      if (result) {
        if (data.manualRequired) {
          result.innerHTML = `<div class="restart-result warn">
            <div class="restart-result-title">⚠ Manual restart required</div>
            <p style="font-size:0.7rem;color:var(--muted);margin-bottom:0.4rem">${esc(data.message)}</p>
            <div class="fix-cmd"><code class="fix-code">${esc(data.cmd)}</code><button class="copy-btn" data-copy="${esc(data.cmd)}">Copy</button></div>
          </div>`;
        } else if (data.ok) {
          result.innerHTML = `<div class="restart-result ok">
            <div class="restart-result-title">✓ Started</div>
            <p style="font-size:0.7rem;color:var(--muted)">Check status in ~15 seconds.</p>
            ${data.stdout ? `<pre class="restart-output">${esc(data.stdout)}</pre>` : ''}
          </div>`;
        } else {
          result.innerHTML = `<div class="restart-result err">
            <div class="restart-result-title">✗ Failed</div>
            ${data.error ? `<p style="font-size:0.7rem;color:var(--muted)">${esc(data.error)}</p>` : ''}
          </div>`;
        }
      }
    } catch {
      if (result) result.innerHTML = '<div class="restart-result err"><div class="restart-result-title">✗ Request failed</div></div>';
    }
    return;
  }

  // Restart — No button (cancel)
  const noBtn = e.target.closest('#restart-confirm-no');
  if (noBtn) {
    const result = document.getElementById('restart-result');
    if (result) result.innerHTML = '';
    document.getElementById('restart-action-btn')?.removeAttribute('disabled');
    return;
  }

  // Restart button — show confirmation
  const restartBtn = e.target.closest('#restart-action-btn');
  if (!restartBtn) return;

  const svcId  = restartBtn.dataset.svcId;
  const svcName = lastData?.services.find(s => s.id === svcId)?.name ?? svcId;
  const result = document.getElementById('restart-result');
  restartBtn.disabled = true;
  if (result) result.innerHTML = `
    <div class="restart-confirm">
      <span class="restart-confirm-msg">Restart <strong>${esc(svcName)}</strong>?</span>
      <button class="restart-confirm-btn yes" id="restart-confirm-yes" data-svc-id="${esc(svcId)}">Yes</button>
      <button class="restart-confirm-btn no"  id="restart-confirm-no">No</button>
    </div>`;
});

// Acknowledge incidents (in service grid strip and incidents view)
document.body.addEventListener('click', e => {
  const btn = e.target.closest('.ack-btn');
  if (!btn) return;
  fetch(`${API_BASE}/api/incidents/${btn.dataset.incId}/acknowledge`, { method: 'POST' })
    .then(() => poll());
});

// ── Theme toggle ──────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ops-theme', theme);
  const btn = document.getElementById('theme-btn');
  btn.textContent = theme === 'dark' ? '☀' : '☽';
  btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

(function initTheme() {
  const saved = localStorage.getItem('ops-theme') ?? 'dark';
  applyTheme(saved);
})();

document.getElementById('theme-btn').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

document.getElementById('refresh-btn').addEventListener('click', () => poll());

// Notification bell
document.getElementById('notif-btn').addEventListener('click', e => {
  e.stopPropagation();
  notifOpen ? closeNotifications() : openNotifications();
});

document.getElementById('notif-close').addEventListener('click', closeNotifications);

document.getElementById('notif-list').addEventListener('click', e => {
  const item = e.target.closest('.notif-item[data-svc-id]');
  if (!item) return;
  closeNotifications();
  activeSection = 'services';
  activeFilter  = 'all';
  if (lastData) renderAll(lastData);
  openDetail(item.dataset.svcId);
});

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (notifOpen && !e.target.closest('.notif-wrapper')) closeNotifications();
});

document.getElementById('pause-btn').addEventListener('click', () => {
  autoRefresh = !autoRefresh;
  const btn = document.getElementById('pause-btn');
  btn.classList.toggle('paused', !autoRefresh);
  btn.title = autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh';
  btn.textContent = autoRefresh ? '⏸' : '▶';
  if (autoRefresh) schedulePoll();
});

// Pause polling when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(pollTimer);
  else schedulePoll();
});

// ── Boot ──────────────────────────────────────────────────────────────────
loadAiProviders().then(() => poll()).then(() => schedulePoll());
setInterval(refreshTimestamps, 1000);
