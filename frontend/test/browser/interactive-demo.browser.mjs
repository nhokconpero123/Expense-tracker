import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { installListenerGuard } from './listener-guard.mjs';

// Dependency-free real-Chrome regression tests. Uses a new profile and no backend.
const root = fileURLToPath(new URL('../..', import.meta.url));
const compiled = process.argv.includes('--built');
const artifacts = await mkdtemp(path.join(tmpdir(), 'expense-interactive-browser-'));
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let chrome, socket, server, listener;
const apiRequests = [];
const networkWrites = [];
const applicationErrors = [];
let passed = 0;
const listenerGuard = installListenerGuard();
try {
  // Do not merge the application config: an empty proxy object retains its API proxy.
  // Middleware mode lets Node bind port 0 without Vite falling back to the dev port.
  server = await createServer({
    root: compiled ? path.join(root, 'dist') : root,
    configFile: false, define: { 'import.meta.env.VITE_PUBLIC_DEMO_MODE': JSON.stringify('true'), 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://expense-tracker-oeow.onrender.com') }, plugins: [react(), tailwindcss(), {
      name: 'isolated-browser-api-boundary',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return next();
          const referer = request.headers.referer ? new URL(request.headers.referer) : null;
          apiRequests.push({ method: request.method, path: url.pathname,
            referer: referer ? referer.origin + referer.pathname : null,
            userAgent: request.headers['user-agent'] ?? null,
            probe: request.headers['x-browser-isolation-probe'] === 'true' });
          response.statusCode = 503;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: { code: 'TEST_API_BLOCKED',
            message: 'Browser fixtures must intercept API requests; no backend is connected.' } }));
        });
      },
    }], server: { host: '127.0.0.1', middlewareMode: true, hmr: false, ws: false },
  });
  assert.equal(server.config.server.proxy, undefined);
  listener = createHttpServer(server.middlewares);
  await new Promise((resolve, reject) => {
    listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  assert(address && typeof address === 'object');
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(artifacts, 'profile')}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome debugging startup timed out')), 15000);
    let stderr = '';
    chrome.once('error', error => { clearTimeout(timeout); reject(error); });
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const waiting = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown' && !message.params.exceptionDetails.url?.includes('/@vite/client')) applicationErrors.push(message.params.exceptionDetails);
    if (message.method === 'Network.requestWillBeSent' && !['GET', 'HEAD'].includes(message.params.request.method)) networkWrites.push(message.params.request);
    if (!message.id) return;
    const task = waiting.get(message.id);
    if (!task) return;
    waiting.delete(message.id); clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => { waiting.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 15000);
    waiting.set(requestId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Condition timed out: ${expression}\n${await evaluate('document.body.innerText')}\nActive: ${await evaluate('document.activeElement.outerHTML')}`);
  };
  const key = async (keyName, code, virtualKey, modifiers = 0) => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: virtualKey, modifiers,
      ...(keyName === 'Enter' ? { text: '\r' } : keyName === ' ' ? { text: ' ' } : {}) });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: virtualKey, modifiers });
  };
  const check = async (name, test) => { await test(); passed++; console.log('PASS ' + name); };
  const { runInteractiveDemoChecks } = await import('./interactive-demo.checks.mjs');
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  // Block every external HTTP origin, including Render. A working demo requires no API.
  await command('Network.setBlockedURLs', { urls: ['https://*', 'http://expense-tracker-*'] });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: 'http://127.0.0.1:' + address.port + '/' });
  await runInteractiveDemoChecks({ command, evaluate, waitFor, key, check, send, address, compiled });
  await listenerGuard.snapshot();
  listenerGuard.assertSafe();
  assert.deepEqual(apiRequests, [], 'The interactive demo must never reach an API transport.');
  assert.deepEqual(networkWrites, [], 'No network write requests are permitted.');
  assert.deepEqual(applicationErrors, [], 'No application runtime exceptions are permitted.');
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(artifacts, 'interactive-demo.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('Interactive demo browser tests (' + (compiled ? 'compiled assets' : 'public-mode source') + '): ' + passed + ' passed, 0 failed. Chrome: ' + (await send('Browser.getVersion')).product);
  console.log('Artifacts: ' + artifacts);
} catch (error) {
  console.error(error); console.error('Interactive demo browser tests: ' + passed + ' passed, 1 failed. Artifacts: ' + artifacts); process.exitCode = 1;
} finally {
  await writeFile(path.join(artifacts, 'api-requests.json'), JSON.stringify(apiRequests, null, 2));
  await writeFile(path.join(artifacts, 'network-writes.json'), JSON.stringify(networkWrites, null, 2));
  await writeFile(path.join(artifacts, 'listeners.json'), JSON.stringify(listenerGuard.report, null, 2));
  socket?.close(); chrome?.kill();
  await server?.close();
  if (listener) await new Promise(resolve => listener.close(resolve));
  await listenerGuard.close();
}
