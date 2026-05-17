let lastData = null;

function timeAgo(iso) {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 5)    return 'just now';
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function historyBars(history) {
  const SLOTS = 30;
  const empty = SLOTS - history.length;
  let html = '';
  for (let i = 0; i < empty; i++) html += '<div class="hbar empty"></div>';
  for (const up of history)       html += `<div class="hbar ${up ? 'up' : 'down'}"></div>`;
  return html;
}

function renderCard(svc) {
  const rt   = svc.responseTime != null ? svc.responseTime : '—';
  const unit = svc.responseTime != null ? 'ms' : '';
  return `
    <div class="card status-${svc.status}">
      <div class="card-top">
        <div class="card-name">${esc(svc.name)}</div>
        <div class="card-meta">
          <span class="type-tag">${esc(svc.type)}</span>
          <div class="dot ${svc.status}"></div>
        </div>
      </div>
      <div class="card-body">
        <div class="rt">${rt}<span class="unit">${unit}</span></div>
        <div class="card-right">
          <div class="status-label ${svc.status}">${labelFor(svc.status)}</div>
          <div class="last-checked" data-iso="${svc.lastChecked ?? ''}">${timeAgo(svc.lastChecked)}</div>
        </div>
      </div>
      <div class="history">${historyBars(svc.history)}</div>
    </div>`;
}

function labelFor(status) {
  if (status === 'up')       return 'UP';
  if (status === 'down')     return 'DOWN';
  return 'CHECKING…';
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderAll(data) {
  const up   = data.services.filter(s => s.status === 'up').length;
  const down = data.services.filter(s => s.status === 'down').length;

  document.getElementById('up-count').textContent   = up;
  document.getElementById('down-count').textContent = down;
  document.getElementById('last-refresh').textContent = timeAgo(data.checkedAt);

  document.getElementById('grid').innerHTML = data.services.map(renderCard).join('');
}

function refreshTimestamps() {
  document.getElementById('last-refresh').textContent =
    lastData ? timeAgo(lastData.checkedAt) : '—';

  document.querySelectorAll('.last-checked[data-iso]').forEach(el => {
    el.textContent = timeAgo(el.dataset.iso || null);
  });
}

async function poll() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    lastData = await res.json();
    renderAll(lastData);
  } catch (err) {
    console.error('Status fetch failed:', err);
  }
}

poll();
setInterval(poll, 5000);
setInterval(refreshTimestamps, 1000);
