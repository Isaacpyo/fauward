import net from 'net';

const TIMEOUT_MS = 5000;

export async function checkHttp(service) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(service.url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    const responseTime = Date.now() - start;
    const expectedStatus = service.expectedStatus ?? null;
    const up = expectedStatus != null
      ? res.status === expectedStatus
      : res.status >= 200 && res.status < 300;
    return { up, responseTime, httpStatus: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { up: false, responseTime: Date.now() - start, error: err.message };
  }
}

export function checkTcp(service) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host: service.host, port: service.port });

    const done = (up) => {
      socket.destroy();
      resolve({ up, responseTime: Date.now() - start });
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
    socket.on('timeout', () => done(false));
  });
}
