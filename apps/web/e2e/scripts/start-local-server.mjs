import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// A local acceptance run uses the same origin for HTML, authenticated WebSocket
// and IDE requests, just like the deployed ingress. The gateway remains real.
const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
const gateway = new URL(process.env.E2E_GATEWAY_URL ?? 'http://127.0.0.1:8082');
const internalPort = Number(process.env.E2E_NEXT_PORT ?? '3001');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('The local E2E proxy requires an explicit loopback HTTP E2E_BASE_URL.');
}
if (
  gateway.protocol !== 'http:' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(gateway.hostname)
) {
  throw new Error('E2E_GATEWAY_URL must address the real gateway on loopback HTTP.');
}
if (!Number.isInteger(internalPort) || internalPort < 1 || internalPort > 65535) {
  throw new Error('E2E_NEXT_PORT must be a valid TCP port.');
}
if (internalPort === Number(base.port || '80')) {
  throw new Error('E2E_NEXT_PORT must differ from the public E2E_BASE_URL port.');
}

const require = createRequire(import.meta.url);
const next = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(internalPort),
  ],
  { cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit' },
);
const web = new URL(`http://127.0.0.1:${internalPort}`);
const sockets = new Set();
let stopping = false;

function destination(url) {
  return /^\/(?:ws|ide)\/session\//.test(url ?? '') ? gateway : web;
}

function upstreamRequest(req) {
  const target = destination(req.url);
  return request({
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    // Preserve Origin, cookies and Host: authentication sees the browser's
    // actual localhost:3000 request, not an invented gateway origin.
    headers: req.headers,
  });
}

function writeUpgradeHeaders(socket, response) {
  let head = `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`;
  for (let i = 0; i < response.rawHeaders.length; i += 2) {
    head += `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`;
  }
  socket.write(`${head}\r\n`);
}

const server = createServer((req, res) => {
  const upstream = upstreamRequest(req);
  upstream.on('response', (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Local E2E upstream unavailable');
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
server.on('upgrade', (req, socket, head) => {
  const upstream = upstreamRequest(req);
  upstream.on('upgrade', (response, peer, upstreamHead) => {
    writeUpgradeHeaders(socket, response);
    if (head.length > 0) peer.write(head);
    if (upstreamHead.length > 0) socket.write(upstreamHead);
    socket.on('error', () => peer.destroy());
    peer.on('error', () => socket.destroy());
    socket.on('close', () => peer.destroy());
    peer.on('close', () => socket.destroy());
    socket.pipe(peer).pipe(socket);
  });
  upstream.on('response', (response) => {
    writeUpgradeHeaders(socket, response);
    response.pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  upstream.end();
});

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const socket of sockets) socket.destroy();
  next.kill('SIGTERM');
  process.exitCode = exitCode;
}

server.on('error', (error) => {
  console.error(error);
  stop(1);
});
next.on('error', (error) => {
  console.error(error);
  stop(1);
});
next.on('exit', (code) => stop(stopping ? 0 : (code ?? 1)));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
server.listen(Number(base.port || '80'), () => {
  console.warn(
    `[e2e] local ingress ${base.origin} -> Next ${web.origin}, gateway ${gateway.origin}`,
  );
});
