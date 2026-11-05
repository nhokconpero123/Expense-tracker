import assert from 'node:assert/strict';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'wrangler.json'), 'utf8'));
// An assets-only configuration must not acquire executable code or service bindings.
assert.deepEqual(Object.keys(config).sort(), ['assets', 'compatibility_date', 'name']);
assert.deepEqual(config.assets, { directory: './frontend/dist', not_found_handling: 'single-page-application' });
assert.equal(process.env.VITE_PUBLIC_DEMO_MODE, 'true', 'Cloudflare builds require the public-demo UI flag');
const base = (process.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const api = new URL(base);
assert(api.protocol === 'https:' && api.origin === base, 'An exact HTTPS API origin is required');
const directory = path.join(root, 'frontend/dist');
assert(!(await lstat(directory)).isSymbolicLink(), 'Asset directory cannot be a symlink');
assert.equal(await realpath(directory), await realpath(path.resolve(root, config.assets.directory)));
const files = [];
async function walk(folder) {
  for (const name of await readdir(folder)) {
    const filename = path.join(folder, name);
    const info = await lstat(filename);
    assert(!info.isSymbolicLink(), 'Symlink in asset output');
    const relative = path.relative(directory, filename).replaceAll('\\', '/');
    assert(!/(^|\/)(backend|node_modules|src)(\/|$)|(^|\/)\.env|\.(sqlite(?:3)?|db)(-|$)|\.(sql|ts|tsx|pem|key|map)$/i.test(relative), `Unexpected asset: ${relative}`);
    if (info.isDirectory()) await walk(filename); else { assert(info.isFile()); files.push(relative); }
  }
}
await walk(directory);
assert(files.includes('index.html'), 'Missing Vite index.html');
const index = await readFile(path.join(directory, 'index.html'), 'utf8');
for (const match of index.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
  assert(files.includes(match[1].slice(1)), `Missing referenced asset: ${match[1]}`);
}
const javascript = (await Promise.all(files.filter(file => file.endsWith('.js')).map(file => readFile(path.join(directory, file), 'utf8')))).join('\n');
assert(javascript.includes(base), 'Built JavaScript is missing the configured API origin');
assert(javascript.includes('Read-only portfolio demo.'), 'Built JavaScript is missing the public-demo notice');
console.log(JSON.stringify({ assetsOnly: true, directory: config.assets.directory, spaFallback: config.assets.not_found_handling,
  publicDemo: true, apiOrigin: base, files }, null, 2));
