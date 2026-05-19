import net from 'net';

const TIMEOUT_MS = 5000;

function parseHttpError(err) {
  if (err.name === 'AbortError') return 'Timed out after 5s';
  const code = err.cause?.code;
  if (code === 'ECONNREFUSED') return 'Connection refused — is the service running?';
  if (code === 'ENOTFOUND')    return 'Host not found';
  if (code === 'ECONNRESET')   return 'Connection reset';
  if (code === 'ETIMEDOUT')    return 'Connection timed out';
  return err.message ?? 'Request failed';
}

function parseTcpError(code) {
  if (code === 'ECONNREFUSED') return 'Connection refused — is the service running?';
  if (code === 'ETIMEDOUT')    return 'Connection timed out';
  if (code === 'ENOTFOUND')    return 'Host not found';
  if (code === 'ECONNRESET')   return 'Connection reset';
  return 'Connection failed';
}

export async function checkHttp(service) {
  const start      = Date.now();
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res          = await fetch(service.url, { signal: controller.signal, redirect: 'follow' });
    const responseTime = Date.now() - start;
    clearTimeout(timer);

    const expectedStatus = service.expectedStatus ?? null;
    const up = expectedStatus != null
      ? res.status === expectedStatus
      : res.status >= 200 && res.status < 300;

    return {
      up,
      responseTime,
      error: up ? null : `HTTP ${res.status} ${res.statusText || ''}`.trim(),
    };
  } catch (err) {
    clearTimeout(timer);
    return { up: false, responseTime: Date.now() - start, error: parseHttpError(err) };
  }
}

export function checkTcp(service) {
  return new Promise((resolve) => {
    const start  = Date.now();
    const socket = net.createConnection({ host: service.host, port: service.port });

    const done = (up, code = null) => {
      socket.destroy();
      resolve({ up, responseTime: Date.now() - start, error: up ? null : parseTcpError(code) });
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.on('connect', ()    => done(true));
    socket.on('error',   (err) => done(false, err.code));
    socket.on('timeout', ()    => done(false, 'ETIMEDOUT'));
  });
}
