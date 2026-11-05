import type { Server } from 'node:http';
import type { RequestHandler } from 'express';

export interface PublicDemoOptions { origin: string; host: string }
function flag(value: string | undefined): boolean {
  if (value !== undefined && value !== 'true' && value !== 'false') throw new Error('Flags must be true or false');
  return value === 'true';
}
export function serverConfiguration(env: NodeJS.ProcessEnv) {
  const publicDemo = flag(env['PUBLIC_DEMO_MODE']);
  const hosted = flag(env['HOSTED_DEPLOYMENT']);
  if (hosted && !publicDemo) throw new Error('Hosted deployment requires public demo mode');
  const text = env['PORT'] ?? '3001';
  const port = Number(text);
  if (!/^\d+$/.test(text) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  let demo: PublicDemoOptions | undefined;
  if (publicDemo) {
    const origin = env['PUBLIC_DEMO_ORIGIN'] ?? '';
    const url = new URL(origin);
    if (origin.includes('*') || url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('An exact HTTPS origin is required');
    const host = env['PUBLIC_DEMO_HOST'] ?? '';
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) || host.includes('*')) throw new Error('An exact lowercase API hostname is required');
    demo = { origin, host };
  }
  return { port, host: hosted ? '0.0.0.0' : '127.0.0.1', demo };
}

/** Global allowlist, before parsers and routes; no public maintenance/write path exists. */
export function publicDemoBoundary(options: PublicDemoOptions): RequestHandler {
  return (req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY', 'X-Public-Demo': 'true', 'Cache-Control': 'no-store' });
    res.vary('Origin');
    const deny = (status: number, code: string, message: string) => { res.status(status).json({ error: { code, message } }); };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.set('Allow', 'GET, HEAD, OPTIONS');
      deny(403, 'PUBLIC_DEMO_READ_ONLY', 'This fictional public demo is read-only.'); return;
    }
    // Ignore spoofable forwarded headers; compare the actual HTTP Host exactly.
    if (req.headers.host?.toLowerCase() !== options.host) { deny(403, 'HOST_NOT_ALLOWED', 'Host is not allowed.'); return; }
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== options.origin) { deny(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed.'); return; }
    if (origin === options.origin) res.set('Access-Control-Allow-Origin', options.origin);
    if (req.method === 'OPTIONS') {
      res.vary('Access-Control-Request-Method'); res.vary('Access-Control-Request-Headers');
      const method = req.get('Access-Control-Request-Method');
      const headers = (req.get('Access-Control-Request-Headers') ?? '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
      if (origin !== options.origin || !method || !['GET', 'HEAD'].includes(method) || headers.some(h => !['accept', 'content-type'].includes(h))) {
        deny(403, 'PREFLIGHT_NOT_ALLOWED', 'Preflight is not allowed.'); return;
      }
      res.set({ 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Accept, Content-Type' });
      res.status(204).end(); return;
    }
    next();
  };
}

/** CONNECT and upgrade events bypass Express; do not offer a tunnel or WebSocket. */
export function protectDemoTransports(server: Server): void {
  const reject = (_request: unknown, socket: import('node:stream').Duplex) => {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  };
  server.on('connect', reject);
  server.on('upgrade', reject);
}
