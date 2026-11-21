import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createApp } from '../../../backend/dist/app.js';
import { openDatabase } from '../../../backend/dist/db/connection.js';
import { initializeDatabase } from '../../../backend/dist/db/initialize.js';
import { installListenerGuard } from './listener-guard.mjs';

// Same loopback/CDP isolation pattern as the existing runners; no application startup/data path.
const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = await mkdtemp(path.join(tmpdir(), 'expense-csv-browser-'));
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let passed = 0;
const results = [], requests = [], errors = [], consoleMessages = [];
const fixture = Array.from({ length: 205 }, (_, index) => ({ id: index + 1, type: 'expense', categoryId: 4, categoryName: 'Food',
  date: '2026-11-03', amountCents: 1234, note: index === 204 ? '=1+2 Q%_\\ "café", 日本語\r\nlast' : `Q%_\\ row ${index + 1}`,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }));
fixture.push({ ...fixture[0], id: 206, type: 'income', categoryId: 1, categoryName: 'Salary' },
  { ...fixture[0], id: 207, date: '2026-11-04' }, { ...fixture[0], id: 208, note: 'Qwildcard impostor' });

function parseCsv(bytes) {
  assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
  const text = bytes.toString('utf8').slice(1), rows = []; let row = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; }
    else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if (character === '\r' && text[index + 1] === '\n' && !quoted) { row.push(value); rows.push(row); row = []; value = ''; index++; }
    else value += character;
  }
  assert.equal(quoted, false); assert.equal(value, ''); assert.deepEqual(rows.shift(), ['Date', 'Type', 'Category', 'Amount (USD)', 'Note']);
  assert(rows.every(row => row.length === 5)); return rows;
}

async function runMode(mode) {
  const guard = installListenerGuard();
  const db = openDatabase({ mode: 'test' }); initializeDatabase(db);
  const insert = db.prepare('INSERT INTO transactions(id,type,category_id,transaction_date,amount_cents,note) VALUES (@id,@type,@categoryId,@date,@amountCents,@note)');
  db.transaction(() => fixture.forEach(row => insert.run(row)))();
  const initialRows = JSON.stringify(db.prepare('SELECT * FROM transactions ORDER BY id').all());
  const app = createApp(db);
  let behavior = 'normal', held = [], chrome, socket, listener, vite;
  const downloads = new Map();
  const directory = path.join(artifacts, mode); await mkdir(directory); await mkdir(path.join(directory, 'downloads'));
  try {
    vite = await createServer({ root, configFile: false,
      define: { 'import.meta.env.VITE_PUBLIC_DEMO_MODE': JSON.stringify(mode === 'demo' ? 'true' : 'false'), 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
      plugins: [react(), tailwindcss(), { name: 'isolated-csv-api', configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!request.url?.startsWith('/api/')) return next();
          requests.push({ mode, method: request.method, url: request.url });
          if (mode === 'demo') { response.writeHead(503); response.end('Unexpected demo network API'); return; }
          const url = new URL(request.url, 'http://127.0.0.1');
          if (url.pathname === '/api/transactions' && url.searchParams.get('pageSize') === '100') {
            if (behavior === 'error') { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: 'Synthetic export request unavailable. Retry.' } })); return; }
            if (behavior === 'hold') { held.push(() => app(request, response)); return; }
          }
          app(request, response);
        });
      } }], server: { host: '127.0.0.1', middlewareMode: true, hmr: false, ws: false } });
    listener = createHttpServer(vite.middlewares);
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${listener.address().port}`;
    chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(directory, 'profile')}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000); let output = '';
      chrome.once('error', error => { clearTimeout(timeout); reject(error); });
      chrome.stderr.on('data', chunk => { output += chunk; const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    socket = new WebSocket(endpoint); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0; const waiting = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Browser.downloadWillBegin') downloads.set(message.params.guid, { ...message.params, state: 'starting' });
      if (message.method === 'Browser.downloadProgress') downloads.set(message.params.guid, { ...downloads.get(message.params.guid), ...message.params });
      if (message.method === 'Runtime.exceptionThrown' && !message.params.exceptionDetails.url?.includes('/@vite/client')) errors.push({ mode, ...message.params });
      if (message.method === 'Runtime.consoleAPICalled') consoleMessages.push({ mode, type: message.params.type, values: message.params.args.map(arg => arg.value ?? arg.description) });
      const pending = waiting.get(message.id); if (!pending) return;
      waiting.delete(message.id); clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence, timeout = setTimeout(() => { waiting.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      waiting.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const target = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    const until = async (condition, label) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
      throw new Error(`Timed out: ${label}\n${await evaluate('document.body.innerText')}`);
    };
    const waitFor = expression => until(() => evaluate(`Boolean(${expression})`), expression);
    const key = async (key, code, windowsVirtualKeyCode) => {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r' } : {}) });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
    };
    const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
    const click = async name => { await evaluate(`${button(name)}.focus()`); await key('Enter', 'Enter', 13); };
    const field = async (selector, value) => {
      await waitFor(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
      await evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));}`);
    };
    const check = async (name, operation) => { await operation(); passed++; results.push({ mode, name, status: 'PASS' }); console.log(`PASS ${mode}: ${name}`); };
    const screenshot = async name => {
      const capture = await command('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(directory, `${name}.png`), Buffer.from(capture.data, 'base64'));
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Network.setBlockedURLs', { urls: ['https://*', 'http://expense-tracker-*'] });
    await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(directory, 'downloads'), eventsEnabled: true });
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.csvUrls=[];window.csvRevoked=[];const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(blob)=>{const url=create(blob);csvUrls.push(url);return url};URL.revokeObjectURL=(url)=>{csvRevoked.push(url);revoke(url)};` });
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: origin + '/#transactions' });
    await waitFor("document.querySelector('#filter-search') && document.querySelector('tbody tr')");
    if (mode === 'demo') {
      await evaluate(`(async()=>{const m=await import('/src/lib/demoRepository.ts');const state=m.initialDemoState();state.transactions=${JSON.stringify(fixture)};state.budgets=[];state.nextId=209;localStorage.setItem(m.DEMO_STORAGE_KEY,JSON.stringify(state));})()`);
      await command('Page.reload'); await waitFor("document.querySelector('tbody')?.textContent.includes('Qwildcard impostor')");
    }
    await field('#filter-type', 'expense'); await field('#filter-category', '4');
    await field('#filter-start-date', '2026-11-03'); await field('#filter-end-date', '2026-11-03'); await field('#filter-search', 'Q%_\\');
    await waitFor("document.querySelector('tbody')?.textContent.includes('=1+2')");
    const exportFile = async () => {
      const before = downloads.size; await click('Export CSV');
      await until(() => Promise.resolve([...downloads.values()].filter(value => value.state === 'completed').length > before), 'actual CSV download');
      await waitFor(`${button('Export CSV')} && !${button('Export CSV')}.disabled`);
      const downloaded = [...downloads.values()].at(-1);
      assert.match(downloaded.suggestedFilename, /^expense-tracker-transactions-[0-9TZ-]+\.csv$/);
      return parseCsv(await readFile(path.join(directory, 'downloads', downloaded.guid)));
    };
    await check('exports every filtered page from visible page 2 with exact downloaded CSV bytes and no storage mutation', async () => {
      await evaluate("document.querySelector('[aria-label=\"Next page\"]').click()");
      await waitFor("document.querySelector('tbody')?.textContent.includes('row 185')");
      const storageBefore = mode === 'demo' ? await evaluate('JSON.stringify(localStorage)') : null;
      const rows = await exportFile(); assert.equal(rows.length, 205);
      assert.deepEqual(rows, [...fixture.slice(0, 205)].reverse().map(row => [row.date, row.type, row.categoryName, '12.34', row.id === 205 ? "'" + row.note : row.note]));
      assert.equal(await evaluate("document.querySelector('tbody').textContent.includes('row 185')"), true);
      if (mode === 'demo') assert.equal(await evaluate('JSON.stringify(localStorage)'), storageBefore);
      await waitFor('csvUrls.length > 0 && csvUrls.every(url=>csvRevoked.includes(url))');
      await screenshot('filtered-export-desktop');
    });
    if (mode === 'local') {
      await check('cancel and filter change prevent downloads from delayed requests', async () => {
        const before = downloads.size; behavior = 'hold'; await click('Export CSV');
        await waitFor(`${button('Cancel export')} && ${button('Exporting CSV...')}.disabled`);
        await click('Cancel export'); behavior = 'normal'; held.splice(0).forEach(release => release());
        await waitFor("document.querySelector('[aria-label=\"CSV export\"]').textContent.includes('canceled')");
        await waitFor("document.activeElement?.textContent==='Export CSV'"); assert.equal(downloads.size, before);
        behavior = 'hold'; await click('Export CSV'); await waitFor(`${button('Cancel export')} !== undefined`);
        await field('#filter-search', 'no-matches'); behavior = 'normal'; held.splice(0).forEach(release => release());
        await waitFor(`${button('Export CSV')} && !${button('Export CSV')}.disabled`); assert.equal(downloads.size, before);
      });
      await check('network errors are visible, retry works, and empty exports make no file', async () => {
        const before = downloads.size; await click('Export CSV');
        await waitFor("document.querySelector('[aria-label=\"CSV export\"]').textContent.includes('No transactions match')"); assert.equal(downloads.size, before);
        await field('#filter-search', 'Q%_\\'); await waitFor("document.querySelector('tbody')?.textContent.includes('=1+2')");
        behavior = 'error'; await click('Export CSV'); await waitFor("document.querySelector('[aria-label=\"CSV export\"] [role=alert]') !== null");
        assert.equal(downloads.size, before); await screenshot('request-error'); behavior = 'normal'; assert.equal((await exportFile()).length, 205);
      });
      assert.equal(JSON.stringify(db.prepare('SELECT * FROM transactions ORDER BY id').all()), initialRows);
    } else {
      await check('demo UI create/edit/delete is reflected by fresh export without network API calls', async () => {
        await evaluate("document.querySelector('[aria-label=\"Previous page\"]').click()");
        await waitFor("document.querySelector('tbody')?.textContent.includes('=1+2')");
        await click('Add Transaction'); await waitFor("document.querySelector('dialog:modal')");
        for (const [selector, value] of [['#tx-amount', '0.01'], ['#tx-category', '4'], ['#tx-date', '2026-11-03'], ['#tx-note', 'Q%_\\ Added fixture']]) await field(selector, value);
        await evaluate("document.querySelector('dialog form').requestSubmit()"); await waitFor("!document.querySelector('dialog[open]') && document.querySelector('tbody')?.textContent.includes('Added fixture')");
        let rows = await exportFile(); assert.equal(rows.length, 206); assert.equal(rows[0][3], '0.01');
        await evaluate("document.querySelector('tbody [title=\"Edit transaction\"]').click()"); await waitFor("document.querySelector('dialog:modal')");
        await field('#tx-amount', '0.10'); await evaluate("document.querySelector('dialog form').requestSubmit()"); await waitFor("!document.querySelector('dialog[open]')");
        rows = await exportFile(); assert.equal(rows[0][3], '0.10');
        await evaluate("document.querySelector('tbody [title=\"Delete transaction\"]').click()"); await waitFor("document.querySelector('dialog:modal')");
        await click('Delete Transaction'); await waitFor("!document.querySelector('dialog[open]')"); assert.equal((await exportFile()).length, 205);
        assert.deepEqual(requests.filter(row => row.mode === 'demo'), []);
      });
      await check('corrupt demo storage fails visibly without partial download or storage reset', async () => {
        const before = downloads.size;
        await evaluate("localStorage.setItem('expense-tracker:interactive-demo:v1','synthetic-corruption')");
        await click('Export CSV'); await waitFor("document.querySelector('[aria-label=\"CSV export\"] [role=alert]') !== null");
        assert.equal(downloads.size, before); assert.equal(await evaluate("localStorage.getItem('expense-tracker:interactive-demo:v1')"), 'synthetic-corruption');
        await screenshot('storage-error');
      });
    }
    await check('keyboard controls and export toolbar fit 360, 768 and 1440 pixel layouts', async () => {
      await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      for (const width of [360, 768, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 360 });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
        await evaluate(`${button('Export CSV')}.focus()`); assert.equal(await evaluate("document.activeElement.textContent==='Export CSV' && document.activeElement.matches(':focus-visible')"), true);
        await key('Tab', 'Tab', 9); assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')==='Refresh transaction list'"), true);
        await screenshot(`layout-${width}`);
      }
    });
    await guard.snapshot(); guard.assertSafe();
    assert.deepEqual(requests.filter(row => row.method !== 'GET'), []); assert.deepEqual(errors, []);
    await writeFile(path.join(directory, 'browser.json'), JSON.stringify({ mode, origin, browser: await send('Browser.getVersion'), viewports: [360, 768, 1440], screenshots: ['filtered-export-desktop', 'layout-360', 'layout-768', 'layout-1440'] }, null, 2));
  } finally {
    held.splice(0).forEach(release => release());
    await writeFile(path.join(directory, 'listeners.json'), JSON.stringify(guard.report, null, 2));
    socket?.close(); chrome?.kill(); await vite?.close();
    if (listener?.listening) await new Promise(resolve => listener.close(resolve));
    await guard.close(); db.close();
  }
}

try { await runMode('local'); await runMode('demo'); console.log(`CSV export browser tests: ${passed} passed, 0 failed. Artifacts: ${artifacts}`); }
catch (error) { console.error(error); results.push({ status: 'FAIL', error: error.stack }); console.error(`CSV export browser tests: ${passed} passed, 1 failed. Artifacts: ${artifacts}`); process.exitCode = 1; }
finally {
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  await writeFile(path.join(artifacts, 'network.json'), JSON.stringify(requests, null, 2));
  await writeFile(path.join(artifacts, 'browser-console.log'), JSON.stringify(consoleMessages, null, 2));
  await writeFile(path.join(artifacts, 'exceptions.json'), JSON.stringify(errors, null, 2));
}
