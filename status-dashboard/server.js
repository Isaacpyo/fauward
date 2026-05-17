import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { checkHttp, checkTcp } from './checks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const INTERVAL = config.interval ?? 30000;
const HISTORY_MAX = 30;

const INIT = () => ({ status: 'checking', responseTime: null, lastChecked: null, history: [] });

const state = new Map();

for (const svc of config.services) {
  state.set(svc.name, {
    name: svc.name,
    type: svc.type,
    local: INIT(),
    prod: svc.prod ? INIT() : null,
  });
}

function doCheck(svc) {
  return svc.type === 'http' ? checkHttp(svc) : checkTcp(svc);
}

function applyResult(prev, result) {
  const history = [...prev.history, result.up].slice(-HISTORY_MAX);
  return {
    status: result.up ? 'up' : 'down',
    responseTime: result.responseTime,
    lastChecked: new Date().toISOString(),
    history,
  };
}

async function runCheck(svc) {
  const fail = { up: false, responseTime: 0 };

  const [localResult, prodResult] = await Promise.all([
    doCheck(svc).catch(() => fail),
    svc.prod ? checkHttp({ type: 'http', url: svc.prod }).catch(() => fail) : Promise.resolve(null),
  ]);

  const prev = state.get(svc.name);

  state.set(svc.name, {
    ...prev,
    local: applyResult(prev.local, localResult),
    prod: prodResult !== null ? applyResult(prev.prod ?? INIT(), prodResult) : prev.prod,
  });

  const sym = (r) => r.up ? '✓' : '✗';
  const prodStr = prodResult ? `  prod ${sym(prodResult)} (${prodResult.responseTime}ms)` : '';
  console.log(`[${new Date().toLocaleTimeString()}] ${sym(localResult)} ${svc.name} local (${localResult.responseTime}ms)${prodStr}`);
}

async function runAll() {
  await Promise.allSettled(config.services.map(runCheck));
}

const app = express();

app.use(express.static(join(__dirname, 'public')));

app.get('/api/status', (_req, res) => {
  res.json({
    checkedAt: new Date().toISOString(),
    interval: INTERVAL,
    services: Array.from(state.values()),
  });
});

app.listen(PORT, () => {
  console.log(`\nStatus dashboard → http://localhost:${PORT}`);
  console.log(`Monitoring ${config.services.length} services every ${INTERVAL / 1000}s\n`);
});

runAll();
setInterval(runAll, INTERVAL);
