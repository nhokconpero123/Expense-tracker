import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const privateDirectories = new Set([
  'skills', '.agents', 'agents', '.codex', '.agent', '.agent-memory', '.ai-memory',
]);

export function findPrivateFiles(files) {
  return files.filter(file => {
    const parts = file.toLowerCase().split('/');
    return parts.at(-1) === 'agents.md'
      || parts.slice(0, -1).some(part => privateDirectories.has(part))
      || file.startsWith('docs/automation/')
      || file.startsWith('scripts/learning-memory/');
  });
}

function main() {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '--cached', '-z'], {
      encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\0').filter(Boolean);
  } catch {
    console.error('Unable to inspect the Git index; private-file check failed.');
    return 1;
  }
  const violations = findPrivateFiles(files);
  if (violations.length) {
    console.error('Private agent files must remain local and untracked:');
    for (const file of violations) console.error(JSON.stringify(file));
    return 1;
  }
  console.log('PASS: no private agent files are tracked.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
