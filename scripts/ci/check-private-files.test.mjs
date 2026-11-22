import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findPrivateFiles } from './check-private-files.mjs';

const script = fileURLToPath(new URL('./check-private-files.mjs', import.meta.url));
function fixture(t, initialize = true) {
  const tempRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(path.join(tempRoot, 'expense-tracker-ci-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(`${tempRoot}${path.sep}expense-tracker-ci-`));
    rmSync(directory, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  const write = (file, contents = 'Synthetic fixture only\n') => {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), contents);
  };
  if (initialize) git('init', '--quiet');
  const run = () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8' });
  };
  return { git, write, run };
}

test('classifies all private path families and nested instructions without public false positives', () => {
  const privateFiles = ['AGENTS.md', 'frontend/AGENTS.md', 'skills/example/SKILL.md',
    'docs/automation/task.md', 'scripts/learning-memory/cli.mjs', '.agents/config.json',
    'Agents/example.md', '.codex/config.toml', '.agent/state.json', '.agent-memory/note.md', '.ai-memory/note.md'];
  assert.deepEqual(findPrivateFiles([...privateFiles, 'README.md', 'docs/CI_VERIFICATION.md',
    'scripts/ci/check-private-files.mjs', 'frontend/src/AgentStatus.tsx', 'docs/automation-guide.md']), privateFiles);
});

test('ignored and untracked private files do not fail a public Git index', t => {
  const f = fixture(t);
  f.write('.gitignore', 'AGENTS.md\nskills/\ndocs/automation/\nscripts/learning-memory/\n');
  f.write('README.md');
  f.git('add', '--', '.gitignore', 'README.md');
  for (const file of ['AGENTS.md', 'skills/example/SKILL.md', 'docs/automation/task.md', 'scripts/learning-memory/cli.mjs', '.codex/untracked.json']) f.write(file);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no private agent files are tracked/);
});

test('force-tracked ignored files fail and removing only the synthetic index entry recovers', t => {
  const f = fixture(t);
  f.write('.gitignore', 'docs/automation/\n');
  const privatePath = 'docs/automation/synthetic failure.md';
  f.write(privatePath);
  f.git('add', '--force', '--', privatePath);
  const failed = f.run();
  t.diagnostic(JSON.stringify({ scenario: 'expected synthetic rejection', exit: failed.status, stdout: failed.stdout, stderr: failed.stderr }));
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /docs\/automation\/synthetic failure\.md/);
  assert.doesNotMatch(failed.stderr, /Synthetic fixture only/);
  f.git('rm', '--cached', '--', privatePath);
  const recovered = f.run();
  t.diagnostic(JSON.stringify({ scenario: 'synthetic index recovery', exit: recovered.status, stdout: recovered.stdout, stderr: recovered.stderr }));
  assert.equal(recovered.status, 0);
});

test('a nested tracked instruction file fails', t => {
  const f = fixture(t);
  f.write('frontend/AGENTS.md');
  f.git('add', '--force', '--', 'frontend/AGENTS.md');
  assert.equal(f.run().status, 1);
});

test('Git index errors fail closed', t => {
  const f = fixture(t, false);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unable to inspect the Git index/);
});
