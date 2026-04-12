const http = require('http');
const net  = require('net');

const ROUTES = {
  'fauward.com':       3002,
  'www.fauward.com':   3002,
  'app.fauward.com':   3003,
  'admin.fauward.com': 3004,
  'api.fauward.com':   3001,
};

function targetPort(host) {
  const hostname = (host || '').split(':')[0].toLowerCase();
  return ROUTES[hostname] ?? 3002;
}

const server = http.createServer((req, res) => {
  const port = targetPort(req.headers.host);
  const opts = {
    hostname: '127.0.0.1',
    port,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const upstream = http.request(opts, (uRes) => {
    res.writeHead(uRes.statusCode, uRes.headers);
    uRes.pipe(res, { end: true });
  });
  upstream.on('error', (err) => {
    console.error(`[proxy] upstream error on :${port} —`, err.message);
    if (!res.headersSent) { res.writeHead(502); }
    res.end('Bad Gateway');
  });
  req.pipe(upstream, { end: true });
});

server.on('upgrade', (req, socket, head) => {
  const port = targetPort(req.headers.host);
  const upstream = net.connect(port, '127.0.0.1', () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(5000, '0.0.0.0', () => {
  console.log('[proxy] Listening on :5000');
  console.log('[proxy] Routes:', ROUTES);
});
