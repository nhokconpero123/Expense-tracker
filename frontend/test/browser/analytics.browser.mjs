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
import { installListenerGuard, isLoopback } from './listener-guard.mjs';

// Dependency-free real-Chrome regression tests. Uses a new profile and no backend.
const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = await mkdtemp(path.join(tmpdir(), 'expense-analytics-browser-'));
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let chrome, socket, server, listener;
const apiRequests = [];
let passed = 0;
const listenerGuard = installListenerGuard();
try {
  // Do not merge the application config: an empty proxy object retains its API proxy.
  // Middleware mode lets Node bind port 0 without Vite falling back to the dev port.
  server = await createServer({
    root, configFile: false, plugins: [react(), tailwindcss(), {
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
  const button = text => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
  const click = async text => { await evaluate(`${button(text)}.click()`); };
  const key = async (keyName, code, virtualKey, modifiers = 0) => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: virtualKey, modifiers,
      ...(keyName === 'Enter' ? { text: '\r' } : keyName === ' ' ? { text: ' ' } : {}) });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: virtualKey, modifiers });
  };
  const rows = () => evaluate("document.querySelector('#daily-spending-rows tbody')?.rows.length ?? 0");
  const ready = () => waitFor("document.body.textContent.includes('Monthly expenses')");
  const check = async (name, test) => { await test(); passed++; console.log(`PASS ${name}`); };
  await check('test server rejects unmocked API calls without a backend proxy', async () => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/summary?month=2026-11`, {
      headers: { 'x-browser-isolation-probe': 'true' },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'TEST_API_BLOCKED');
    assert.equal(apiRequests.length, 1);
    assert.equal(apiRequests[0].probe, true);
  });
  await listenerGuard.snapshot();
  if (process.env.BROWSER_ISOLATION_NEGATIVE === '1') {
    // Deliberately omit the probe marker so the normal final assertion must fail.
    const response = await fetch(`http://127.0.0.1:${address.port}/api/isolation-negative`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'TEST_API_BLOCKED');
    console.log('Negative isolation request blocked with 503 TEST_API_BLOCKED');
  }
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `http://127.0.0.1:${address.port}/test/browser/analytics.html` });
  await ready();
  await check('mounted disclosure uses native keyboard activation and retains focus', async () => {
    await evaluate(`${button('Chart View')}.focus()`);
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Table View');
    assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), true);
    assert.notEqual(await evaluate('getComputedStyle(document.activeElement).boxShadow'), 'none');
    await key('Tab', 'Tab', 9, 8);
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Chart View');
    await key('Tab', 'Tab', 9);
    await key('Enter', 'Enter', 13);
    await waitFor(`${button('Show all 29 days')} !== undefined`);
    assert.equal(await rows(), 1);
    await evaluate(`${button('Show all 29 days')}.focus()`);
    await key(' ', 'Space', 32);
    await waitFor(`${button('Show spending days only')} !== undefined`);
    assert.equal(await rows(), 29);
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-expanded')"), 'true');
    await key('Enter', 'Enter', 13); await waitFor(`${button('Show all 29 days')} !== undefined`);
    assert.equal(await rows(), 1);
    await key(' ', 'Space', 32); await waitFor(`${button('Show spending days only')} !== undefined`);
  });
  await check('mounted expansion survives same-month loading and successful refresh', async () => {
    await evaluate("analyticsHarness.configure('hold', 9000)"); await click('Refresh analytics');
    await waitFor("document.querySelector('[aria-label=\"Loading analytics\"]') !== null");
    assert.equal(await rows(), 0);
    await evaluate('analyticsHarness.release()'); await ready();
    assert.equal(await rows(), 29);
    assert.equal(await evaluate("document.body.textContent.includes('$90.00')"), true);
    assert.equal(await evaluate(`${button('Table View')}.getAttribute('aria-pressed')`), 'true');
  });
  await check('mounted expansion survives failed refresh then successful retry', async () => {
    await evaluate("analyticsHarness.configure('error')"); await click('Refresh analytics');
    await waitFor("document.querySelector('[role=alert]') !== null"); assert.equal(await rows(), 0);
    await evaluate("analyticsHarness.configure('success', 10000)"); await click('Try again'); await ready();
    assert.equal(await rows(), 29); assert.equal(await evaluate("document.querySelector('[role=alert]')"), null);
  });
  await check('transaction revision reload preserves mounted presentation state', async () => {
    await evaluate("analyticsHarness.configure('hold', 11000)"); await click('Simulate transaction revision');
    await waitFor("document.querySelector('[aria-busy=true]') !== null");
    await evaluate('analyticsHarness.release()'); await ready(); assert.equal(await rows(), 29);
  });
  await check('month changes reset mounted view and disclosure with late response protection', async () => {
    await evaluate("analyticsHarness.configure('hold')");
    await evaluate("document.querySelector('[aria-label=\"Next month\"]').click()");
    await waitFor("document.querySelector('[aria-busy=true]') !== null");
    assert.equal(await rows(), 0);
    await evaluate("analyticsHarness.configure('success', 12000)");
    await evaluate("document.querySelector('[aria-label=\"Previous month\"]').click()"); await ready();
    await evaluate('analyticsHarness.release()');
    await waitFor("document.body.textContent.includes('$120.00')");
    assert.equal(await evaluate(`${button('Chart View')}.getAttribute('aria-pressed')`), 'true');
    await click('Table View'); await waitFor(`${button('Show all 29 days')} !== undefined`); assert.equal(await rows(), 1);
    assert.equal(await evaluate("document.body.textContent.includes('March 2024')"), false);
  });
  await check('computed selected styles and category keyboard selection/clear', async () => {
    const styles = await evaluate(`['Chart View','Table View'].map(name => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name); const s=getComputedStyle(b); return {background:s.backgroundColor,border:s.borderColor,underline:s.textDecorationLine}; })`);
    assert.notEqual(styles[0].background, styles[1].background); assert.notEqual(styles[0].border, styles[1].border);
    assert.equal(styles[1].underline, 'underline'); assert.equal(styles[0].underline, 'none');
    await evaluate("document.querySelector('ul button[aria-pressed]').focus()"); await key(' ', 'Space', 32);
    await waitFor("document.body.textContent.includes('Selected category: Food.')");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('ul button[aria-pressed]')).textDecorationLine"), 'underline');
    await evaluate(`${button('Clear selection')}.focus()`); await key('Enter', 'Enter', 13);
    await waitFor("document.body.textContent.includes('No category selected.')");
    assert.equal(await evaluate(`${button('Clear selection')}.disabled`), true);
  });
  for (const width of [360, 768, 1440]) {
    await check(`real layout ${width}px: charts, labels, tables and large USD`, async () => {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate("analyticsHarness.configure('success', Number.MAX_SAFE_INTEGER, true)");
      await click('Refresh analytics'); await ready(); await click('Chart View');
      await waitFor("document.querySelectorAll('.recharts-surface').length === 2");
      await new Promise(resolve => setTimeout(resolve, 200));
      // Temporarily reveal overflow instead of trusting the application's hidden overflow.
      await evaluate("document.body.style.overflowX='visible'; document.documentElement.style.overflowX='visible'");
      const layout = await evaluate(`(() => { const width=innerWidth; const groups=[...document.querySelectorAll('main [role=group]')]; const bad=[...document.querySelectorAll('main button, main figure, main svg.recharts-surface, main .recharts-cartesian-axis-tick-value')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1||r.right>width+1)}); const ticks=[...document.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}}); return {scroll:document.documentElement.scrollWidth,width,bad:bad.map(e=>e.tagName+':'+e.textContent),sized:groups.every(e=>e.getBoundingClientRect().width>0),ticks}; })()`);
      assert.equal(layout.scroll <= width + 1, true, JSON.stringify(layout)); assert.deepEqual(layout.bad, []);
      assert.equal(layout.sized, true);
      assert.equal(layout.ticks.length, 4);
      layout.ticks.slice(1).forEach((tick, index) => assert(tick.left >= layout.ticks[index].right));
      const point = await evaluate(`(() => { const bar=document.querySelector('.recharts-rectangle'); bar.scrollIntoView({block:'center'});const r=bar.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+10}; })()`);
      await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await waitFor("[...document.querySelectorAll('[role=tooltip]')].some(e=>getComputedStyle(e.parentElement).visibility!=='hidden')");
      const tooltip = await evaluate(`(() => { const e=[...document.querySelectorAll('[role=tooltip]')].find(e=>getComputedStyle(e.parentElement).visibility!=='hidden');const r=e.getBoundingClientRect();return {text:e.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })()`);
      assert(tooltip.text.includes('$90,071,992,547,409.91'));
      assert(tooltip.left >= 0 && tooltip.right <= width && tooltip.top >= 0 && tooltip.bottom <= 1000, JSON.stringify(tooltip));
      const screenshot = await command('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(artifacts, `charts-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      await click('Table View'); await click('Show all 29 days'); await waitFor(`${button('Show spending days only')} !== undefined`);
      assert.equal(await rows(), 29);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth+1"), true);
      assert.equal(await evaluate("document.body.textContent.includes('$90,071,992,547,409.91')"), true);
      await click('Show spending days only');
    });
  }
  await check('donut pointer selection matches accessible category details', async () => {
    await click('Chart View');
    await waitFor("document.querySelector('.recharts-sector') !== null");
    const point = await evaluate(`(() => { const e=document.querySelector('.recharts-sector');e.scrollIntoView({block:'center'});const p=e.getPointAtLength(e.getTotalLength()*.2);const cx=Number(e.getAttribute('cx')),cy=Number(e.getAttribute('cy'));const s=new DOMPoint(cx+(p.x-cx)*.8,cy+(p.y-cy)*.8).matrixTransform(e.getScreenCTM());return {x:s.x,y:s.y}; })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await waitFor("document.body.textContent.includes('Selected category: Food.')");
    const tooltipText = await evaluate("[...document.querySelectorAll('[role=tooltip]')].filter(e=>getComputedStyle(e.parentElement).visibility!=='hidden').map(e=>e.textContent).join(' ')");
    assert(tooltipText.includes('Food') && tooltipText.includes('$90,071,992,547,409.90'));
    await click('Table View');
  });
  await check('all-zero month has one message and complete zero-day expansion', async () => {
    await evaluate("analyticsHarness.configure('success', 0, false)"); await click('Refresh analytics'); await ready();
    assert.equal(await rows(), 0);
    assert.equal(await evaluate("document.body.textContent.split('No spending recorded this month.').length-1"), 1);
    await click('Show all 29 days'); await waitFor(`${button('Show spending days only')} !== undefined`); assert.equal(await rows(), 29);
  });
  await check('reduced-motion preference and GET-only isolation', async () => {
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate("analyticsHarness.configure('hold')"); await click('Refresh analytics');
    await waitFor("document.querySelector('[aria-busy=true]') !== null");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[class~=\"motion-safe:animate-pulse\"]')).animationName"), 'none');
    assert.equal(await evaluate("analyticsHarness.requests.every(r=>r.startsWith('GET /api/summary?month='))"), true);
    await evaluate('analyticsHarness.release()'); await ready();
  });
  await check('Chrome accessibility tree exposes tables and disclosure expanded state', async () => {
    const { nodes } = await command('Accessibility.getFullAXTree');
    assert(nodes.some(node => node.role?.value === 'table'));
    const toggle = nodes.find(node => node.role?.value === 'button' && node.name?.value === 'Show spending days only');
    assert(toggle?.properties?.some(property => property.name === 'expanded' && property.value?.value === true));
  });
  const { runTransactionChecks } = await import('./transactions.checks.mjs');
  await runTransactionChecks({ command, evaluate, waitFor, key, check });
  const { runBudgetChecks } = await import('./budgets.checks.mjs');
  await runBudgetChecks({ command, evaluate, waitFor, key, check });
  await check('runtime listeners owned by Node and Chrome stay on loopback', async () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1']) assert.equal(isLoopback(address), true);
    for (const address of ['0.0.0.0', '::', '192.168.1.1', '::ffff:192.168.1.1', 'localhost']) assert.equal(isLoopback(address), false);
    await listenerGuard.snapshot();
    const debuggerPort = Number(new URL(endpoint).port);
    for (const snapshot of listenerGuard.report.snapshots) {
      assert(snapshot.listeners.some(row => row.pid === process.pid && row.port === address.port));
      assert(snapshot.listeners.some(row => row.pid === chrome.pid && row.port === debuggerPort));
    }
    listenerGuard.assertSafe();
  });
  console.log('Listener evidence: ' + JSON.stringify(listenerGuard.report));
  assert.deepEqual(apiRequests.filter(request => !request.probe), [], 'Unexpected real API requests; see api-requests.json');
  console.log(`Browser tests: ${passed} passed, 0 failed. Chrome: ${(await send('Browser.getVersion')).product}`);
  console.log(`Screenshots and isolated profile: ${artifacts}`);
} catch (error) {
  console.error(error); console.error(`Browser tests: ${passed} passed, 1 failed. Artifacts: ${artifacts}`); process.exitCode = 1;
} finally {
  await writeFile(path.join(artifacts, 'api-requests.json'), JSON.stringify(apiRequests, null, 2));
  await writeFile(path.join(artifacts, 'listeners.json'), JSON.stringify(listenerGuard.report, null, 2));
  socket?.close(); chrome?.kill();
  await server?.close();
  if (listener) await new Promise(resolve => listener.close(resolve));
  await listenerGuard.close();
}
